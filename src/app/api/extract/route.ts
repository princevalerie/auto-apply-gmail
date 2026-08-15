import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractJobInfoWithFallback, generateEmailWithFallback } from "@/lib/ai-provider";
import type { FileAttachment } from "@/lib/gemini";
import { cacheFiles } from "@/lib/file-cache";
import { uploadFileToS3, downloadFileFromS3Url } from "@/lib/s3";
import { saveFileRecord, upsertUser, getUserFile } from "@/lib/db";

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

    const userId = (session.user.id || session.user.email || "") as string;
    const userEmail = (session.user.email || "") as string;

    // Ensure user exists in database
    await upsertUser({
      id: userId,
      name: session.user.name,
      email: userEmail,
      image: session.user.image,
    }).catch(err => console.warn("[Extract] upsertUser warning:", err));

    let effectiveCvBase64 = cvBase64;

    // If new CV was uploaded, persist it to S3 & Database
    if (userId && cvBase64) {
      cacheFiles(userId, cvBase64);

      try {
        const cvBuffer = Buffer.from(cvBase64, "base64");
        const s3Res = await uploadFileToS3({
          userId: userId,
          fileType: "cv",
          fileName: "CV.pdf",
          fileBuffer: cvBuffer,
          mimeType: "application/pdf",
        });

        await saveFileRecord({
          userId: userId,
          userEmail: userEmail,
          fileType: "cv",
          fileName: "CV.pdf",
          fileUrl: s3Res.url,
          fileSize: cvBuffer.length,
          mimeType: "application/pdf",
        });
        console.log("[Extract] CV successfully saved to S3 & Database");
      } catch (saveErr) {
        console.warn("[Extract] Could not persist CV to S3/DB:", (saveErr as Error).message);
      }
    } else if (!effectiveCvBase64 && userId) {
      // If no CV uploaded in this session, auto-load saved CV from S3/Database
      try {
        const savedCv = await getUserFile(userId, "cv", userEmail);
        if (savedCv?.file_url) {
          const cvBuffer = await downloadFileFromS3Url(savedCv.file_url);
          effectiveCvBase64 = cvBuffer.toString("base64");
          cacheFiles(userId, effectiveCvBase64);
          console.log("[Extract] Auto-loaded saved CV from Cloud for AI analysis");
        }
      } catch (loadErr) {
        console.warn("[Extract] Failed to auto-load saved CV from S3:", (loadErr as Error).message);
      }
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

    if (effectiveCvBase64) {
      cvFile = {
        base64: effectiveCvBase64,
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

