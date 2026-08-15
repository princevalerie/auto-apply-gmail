import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";
import { isValidEmail } from "@/lib/utils";
import { getCachedFiles } from "@/lib/file-cache";
import { saveApplication, getUserFile } from "@/lib/db";
import { downloadFileFromS3Url } from "@/lib/s3";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized. Silakan login ulang." }, { status: 401 });
  }

  try {
    const formData = await request.formData();

    const targetEmail = formData.get("targetEmail") as string;
    const emailSubject = formData.get("emailSubject") as string;
    const emailBody = formData.get("emailBody") as string;
    const position = formData.get("position") as string || "";
    const company = formData.get("company") as string || "";
    const portfolioFile = formData.get("portfolio") as File | null;

    // Validate required fields
    if (!targetEmail || !emailSubject || !emailBody) {
      return NextResponse.json(
        { error: "Data lamaran tidak lengkap" },
        { status: 400 }
      );
    }

    // Validate email format
    if (!isValidEmail(targetEmail)) {
      return NextResponse.json(
        { error: "Format email tujuan tidak valid" },
        { status: 400 }
      );
    }

    // Get CV: try memory cache first, then S3 storage
    let cvBuffer: Buffer | null = null;

    const cached = getCachedFiles(session.user.id);
    if (cached.cv?.base64) {
      cvBuffer = Buffer.from(cached.cv.base64, "base64");
    } else {
      // Fallback: get CV from S3 via database record
      try {
        const cvRecord = await getUserFile(session.user.id, "cv");
        if (cvRecord?.file_url) {
          cvBuffer = await downloadFileFromS3Url(cvRecord.file_url);
          console.log("[Send] CV loaded from S3 storage");
        }
      } catch (s3Err) {
        console.warn("[Send] Failed to load CV from S3:", (s3Err as Error).message);
      }
    }

    if (!cvBuffer) {
      return NextResponse.json(
        { error: "CV tidak ditemukan. Silakan proses ulang screenshot terlebih dahulu." },
        { status: 400 }
      );
    }

    // Prepare attachments
    const attachments = [];

    attachments.push({
      filename: "CV.pdf",
      content: cvBuffer,
      mimeType: "application/pdf",
    });

    // Portfolio from FormData binary file (if provided)
    if (portfolioFile) {
      const portfolioBytes = await portfolioFile.arrayBuffer();
      attachments.push({
        filename: "Portfolio.pdf",
        content: Buffer.from(portfolioBytes),
        mimeType: "application/pdf",
      });
    } else {
      // Fallback: get portfolio from S3 if user uploaded before
      try {
        const portfolioRecord = await getUserFile(session.user.id, "portfolio");
        if (portfolioRecord?.file_url) {
          const portfolioBuffer = await downloadFileFromS3Url(portfolioRecord.file_url);
          attachments.push({
            filename: "Portfolio.pdf",
            content: portfolioBuffer,
            mimeType: "application/pdf",
          });
          console.log("[Send] Portfolio loaded from S3 storage");
        }
      } catch (s3Err) {
        console.warn("[Send] No portfolio in S3:", (s3Err as Error).message);
      }
    }

    // Send email via Gmail API
    const result = await sendEmail({
      userEmail: session.user.email || "",
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      to: targetEmail,
      subject: emailSubject,
      body: emailBody,
      attachments,
    });

    // Save application history to database (non-blocking)
    try {
      await saveApplication({
        userId: session.user.id,
        position,
        company,
        targetEmail,
        emailSubject,
        emailBody,
        gmailMessageId: result.messageId,
        status: result.success ? "sent" : "failed",
      });
    } catch (dbErr) {
      // Don't fail the send if DB save fails
      console.warn("[Send] Failed to save application record:", (dbErr as Error).message);
    }

    if (result.success) {
      return NextResponse.json({
        success: true,
        messageId: result.messageId,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Send error:", error);
    return NextResponse.json(
      {
        error: "Gagal mengirim email",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
