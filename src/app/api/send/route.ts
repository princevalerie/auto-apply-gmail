import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/gmail";
import { isValidEmail } from "@/lib/utils";
import { getCachedFiles } from "@/lib/file-cache";

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

    // Get CV from server cache (cached during /api/extract)
    const cached = getCachedFiles(session.user.id);
    const cvBase64 = cached.cv?.base64;

    if (!cvBase64) {
      return NextResponse.json(
        { error: "CV tidak ditemukan di cache. Silakan proses ulang screenshot terlebih dahulu." },
        { status: 400 }
      );
    }

    // Prepare attachments
    const attachments = [];

    // CV from server cache (base64 → Buffer)
    attachments.push({
      filename: "CV.pdf",
      content: Buffer.from(cvBase64, "base64"),
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


