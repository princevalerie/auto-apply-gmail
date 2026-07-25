import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractJobInfo, generateEmail, FileAttachment } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { imageBase64, mimeType, cvBase64, portfolioBase64 } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 dan mimeType diperlukan" },
        { status: 400 }
      );
    }

    // Step 1: Extract job info from screenshot
    const jobInfo = await extractJobInfo(imageBase64, mimeType);

    // Step 2: Prepare CV and Portfolio from frontend base64
    let cvFile: FileAttachment | null = null;
    let portfolioFile: FileAttachment | null = null;

    if (cvBase64) {
      cvFile = {
        base64: cvBase64,
        mimeType: "application/pdf",
      };
    }

    if (portfolioBase64) {
      portfolioFile = {
        base64: portfolioBase64,
        mimeType: "application/pdf",
      };
    }

    // Step 3: Generate email content with CV & portfolio context
    const emailContent = await generateEmail(jobInfo, cvFile, portfolioFile);

    // Step 4: Flag if email not detected
    const emailValid = jobInfo.email && jobInfo.email.includes("@");

    return NextResponse.json({
      success: true,
      data: {
        ...jobInfo,
        emailSubject: emailContent.subject,
        emailBody: emailContent.body,
        emailValid,
        warning: !emailValid
          ? "Email tujuan tidak terdeteksi dari screenshot. Silakan masukkan email secara manual."
          : null,
      },
    });
  } catch (error) {
    console.error("Extract error:", error);
    return NextResponse.json(
      {
        error: "Gagal mengekstrak informasi dari screenshot",
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
