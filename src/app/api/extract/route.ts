import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractJobInfoWithFallback, generateEmailWithFallback } from "@/lib/ai-provider";
import type { FileAttachment } from "@/lib/gemini";
import { cacheFiles } from "@/lib/file-cache";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      imageBase64,
      mimeType,
      cvBase64,
      portfolioBase64,
      geminiApiKey,
      groqApiKey,
    } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 dan mimeType diperlukan" },
        { status: 400 }
      );
    }

    // Cache CV and Portfolio files server-side for later use by /api/send
    if (session.user.id) {
      cacheFiles(session.user.id, cvBase64, portfolioBase64);
    }

    // Step 1: Extract job info from screenshot (with fallback)
    const extractResult = await extractJobInfoWithFallback(
      imageBase64,
      mimeType,
      geminiApiKey,
      groqApiKey
    );
    const jobInfo = extractResult.data;

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

    // Step 3: Generate email content with CV & portfolio context (with fallback)
    const emailResult = await generateEmailWithFallback(
      jobInfo,
      cvFile,
      portfolioFile,
      geminiApiKey,
      groqApiKey
    );
    const emailContent = emailResult.data;

    // Step 4: Flag if email not detected
    const emailValid = jobInfo.email && jobInfo.email.includes("@");

    return NextResponse.json({
      success: true,
      data: {
        ...jobInfo,
        emailSubject: emailContent.subject,
        emailBody: emailContent.body,
        emailValid,
        extractProvider: extractResult.provider,
        emailProvider: emailResult.provider,
        warning: !emailValid
          ? "Email tujuan tidak terdeteksi dari screenshot. Silakan masukkan email secara manual."
          : null,
      },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error("Extract error:", errorMessage);
    console.error("ENV check — GEMINI_API_KEY:", !!process.env.GEMINI_API_KEY ? "SET" : "MISSING");
    console.error("ENV check — GROQ_API_KEY:", !!process.env.GROQ_API_KEY ? "SET" : "MISSING");
    return NextResponse.json(
      {
        error: `Gagal mengekstrak: ${errorMessage}`,
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
