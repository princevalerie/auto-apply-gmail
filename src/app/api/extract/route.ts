import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractAndGenerateWithFallback } from "@/lib/ai-provider";
import type { FileAttachment } from "@/lib/gemini";
import { cacheFiles, getCachedFiles } from "@/lib/file-cache";
import { uploadFileToS3, downloadFileFromS3Url } from "@/lib/s3";
import { saveFileRecord, upsertUser, getUserFile } from "@/lib/db";

// Allow up to 60s for AI extraction + email generation
export const maxDuration = 60;

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
      language = "id",
      selectedModel,
    } = body;

    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: "imageBase64 dan mimeType diperlukan" },
        { status: 400 }
      );
    }

    const userId = (session.user.id || session.user.email || "") as string;
    const userEmail = (session.user.email || "") as string;

    // Background user upsert (non-blocking for speed)
    upsertUser({
      id: userId,
      name: session.user.name,
      email: userEmail,
      image: session.user.image,
    }).catch(err => console.warn("[Extract] upsertUser warning:", err));

    let effectiveCvBase64 = cvBase64;

    // If new CV was uploaded in this request, cache it and asynchronously persist to S3/DB
    if (userId && cvBase64) {
      cacheFiles(userId, cvBase64);

      // Async S3 + DB persist (runs in parallel, non-blocking)
      (async () => {
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
          console.log("[Extract] CV successfully persisted to S3 & Database");
        } catch (saveErr) {
          console.warn("[Extract] S3/DB persist warning:", (saveErr as Error).message);
        }
      })();
    } else if (!effectiveCvBase64 && userId) {
      // Check fast in-memory cache first
      const cached = getCachedFiles(userId);
      if (cached.cv?.base64) {
        effectiveCvBase64 = cached.cv.base64;
      } else {
        // Fallback: load saved CV from S3/Database
        try {
          const savedCv = await getUserFile(userId, "cv", userEmail);
          if (savedCv?.file_url) {
            const cvBuffer = await downloadFileFromS3Url(savedCv.file_url);
            effectiveCvBase64 = cvBuffer.toString("base64");
            cacheFiles(userId, effectiveCvBase64);
            console.log("[Extract] Loaded CV from S3");
          }
        } catch (loadErr) {
          console.warn("[Extract] Failed to load saved CV:", (loadErr as Error).message);
        }
      }
    }

    // Prepare CV attachment
    let cvFile: FileAttachment | null = null;
    if (effectiveCvBase64) {
      cvFile = {
        base64: effectiveCvBase64,
        mimeType: "application/pdf",
      };
    }

    // ─── 1 Single AI Call: Extract Job Info & Generate Email ───
    const aiResult = await extractAndGenerateWithFallback(
      imageBase64,
      mimeType,
      cvFile,
      null, // portfolio is attached at send time
      geminiApiKey,
      groqApiKey,
      language,
      selectedModel
    );

    const resultData = aiResult.data;
    const emailValid = Boolean(resultData.email && resultData.email.includes("@"));

    return NextResponse.json({
      success: true,
      data: {
        position: resultData.position || "Posisi Lamaran",
        company: resultData.company || "Perusahaan",
        email: resultData.email || "",
        location: resultData.location || "",
        requirements: resultData.requirements || [],
        subjectInstruction: resultData.subjectInstruction || "",
        emailSubject: resultData.emailSubject || "",
        emailBody: resultData.emailBody || "",
        emailValid,
        extractProvider: aiResult.provider,
        emailProvider: aiResult.provider,
        warning: !emailValid
          ? "Email tujuan tidak terdeteksi dari screenshot. Silakan masukkan email secara manual."
          : null,
      },
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error("Extract error:", errorMessage);
    return NextResponse.json(
      {
        error: `Gagal mengekstrak: ${errorMessage}`,
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}

