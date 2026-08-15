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
      geminiApiKey,
      groqApiKey,
    } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 dan mimeType diperlukan" },
        { status: 400 }
      );
    }

    // Cache CV server-side for later use by /api/send (portfolio NOT cached — sent directly at send time)
    if (session.user.id && cvBase64) {
      cacheFiles(session.user.id, cvBase64);
    }

    // Step 1: Extract job info from screenshot (with fallback)
    const extractResult = await extractJobInfoWithFallback(
      imageBase64,
      mimeType,
      geminiApiKey,
      groqApiKey
    );
    const jobInfo = extractResult.data;

    // Step 2: Prepare CV for AI email generation (portfolio NOT sent here — attached at send time)
    let cvFile: FileAttachment | null = null;

    if (cvBase64) {
      cvFile = {
        base64: cvBase64,
        mimeType: "application/pdf",
      };
    }

    // Step 3: Generate email content with CV context (with fallback)
    // Portfolio is NOT passed to AI — it will be attached as-is when sending email
    const emailResult = await generateEmailWithFallback(
      jobInfo,
      cvFile,
      null, // portfolio not sent to AI
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

