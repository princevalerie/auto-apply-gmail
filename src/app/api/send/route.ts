import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";
import { isValidEmail } from "@/lib/utils";
import { getCachedFiles } from "@/lib/file-cache";
import { saveApplication, getUserFile, saveFileRecord, upsertUser } from "@/lib/db";
import { downloadFileFromS3Url, uploadFileToS3 } from "@/lib/s3";

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
    const position = (formData.get("position") as string) || "Posisi Lamaran";
    const company = (formData.get("company") as string) || "Perusahaan";
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

    const userId = (session.user.id || session.user.email || "") as string;
    const userEmail = (session.user.email || "") as string;

    // Ensure user exists in PostgreSQL (prevents foreign key errors)
    await upsertUser({
      id: userId,
      name: session.user.name,
      email: userEmail,
      image: session.user.image,
    }).catch(err => console.warn("[Send] upsertUser warning:", err));

    // Get CV: try memory cache first, then S3 storage
    let cvBuffer: Buffer | null = null;

    const cached = getCachedFiles(userId);
    if (cached.cv?.base64) {
      cvBuffer = Buffer.from(cached.cv.base64, "base64");
    } else {
      // Fallback: get CV from S3 via database record
      try {
        const cvRecord = await getUserFile(userId, "cv", userEmail);
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
        { error: "CV tidak ditemukan. Silakan upload CV terlebih dahulu." },
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
      const portfolioBuffer = Buffer.from(portfolioBytes);
      attachments.push({
        filename: "Portfolio.pdf",
        content: portfolioBuffer,
        mimeType: "application/pdf",
      });

      // Persist portfolio to Neon S3 Storage & PostgreSQL
      try {
        const s3Res = await uploadFileToS3({
          userId: userId,
          fileType: "portfolio",
          fileName: portfolioFile.name || "Portfolio.pdf",
          fileBuffer: portfolioBuffer,
          mimeType: "application/pdf",
        });

        await saveFileRecord({
          userId: userId,
          userEmail: userEmail,
          fileType: "portfolio",
          fileName: portfolioFile.name || "Portfolio.pdf",
          fileUrl: s3Res.url,
          fileSize: portfolioBuffer.length,
          mimeType: "application/pdf",
        });
        console.log("[Send] Portfolio successfully saved to S3 & Database");
      } catch (saveErr) {
        console.warn("[Send] Could not persist Portfolio to S3/DB:", (saveErr as Error).message);
      }
    } else {
      // Fallback: get portfolio from S3 if user uploaded before
      try {
        const portfolioRecord = await getUserFile(userId, "portfolio", userEmail);
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

    // Save application history to database
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
      console.log("[Send] Application saved to database successfully");
    } catch (dbErr) {
      console.error("[Send] Failed to save application record:", (dbErr as Error).message);
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
