import {
  extractJobInfo as geminiExtract,
  generateEmail as geminiGenerate,
  extractAndGenerateGemini,
} from "./gemini";
import {
  extractJobInfoGroq,
  generateEmailGroq,
  extractAndGenerateGroq,
} from "./groq";
import type {
  JobInfo,
  GeneratedEmail,
  FileAttachment,
  ExtractedJobAndEmail,
} from "./gemini";

export type AIProvider = "gemini" | "groq";

export interface AIResult<T> {
  data: T;
  provider: AIProvider;
}

// ─── Extract Job Info & Generate Email in 1 Single AI Call ──

export async function extractAndGenerateWithFallback(
  imageBase64: string,
  mimeType: string,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null,
  geminiApiKey?: string,
  groqApiKey?: string
): Promise<AIResult<ExtractedJobAndEmail>> {
  const effectiveGroqKey = groqApiKey || process.env.GROQ_API_KEY;

  // Try Gemini first
  try {
    const data = await extractAndGenerateGemini(
      imageBase64,
      mimeType,
      cvFile,
      portfolioFile,
      geminiApiKey
    );
    return { data, provider: "gemini" };
  } catch (error) {
    console.warn(
      "[AI Provider] Gemini single-call failed:",
      (error as Error).message
    );

    // Fallback to Groq
    if (effectiveGroqKey) {
      console.log("[AI Provider] Falling back to Groq single-call...");
      try {
        const data = await extractAndGenerateGroq(
          effectiveGroqKey,
          imageBase64,
          mimeType,
          cvFile,
          portfolioFile
        );
        return { data, provider: "groq" };
      } catch (groqError) {
        console.error(
          "[AI Provider] Groq single-call also failed:",
          (groqError as Error).message
        );
        throw new Error(
          `Gemini: ${(error as Error).message} | Groq fallback: ${(groqError as Error).message}`
        );
      }
    }

    throw error;
  }
}

// ─── Extract Job Info with Fallback ──────────────────────

export async function extractJobInfoWithFallback(
  imageBase64: string,
  mimeType: string,
  geminiApiKey?: string,
  groqApiKey?: string
): Promise<AIResult<JobInfo>> {
  const effectiveGroqKey = groqApiKey || process.env.GROQ_API_KEY;

  // Try Gemini first
  try {
    const data = await geminiExtract(imageBase64, mimeType, geminiApiKey);
    return { data, provider: "gemini" };
  } catch (error) {
    console.warn("[AI Provider] Gemini extractJobInfo failed:", (error as Error).message);

    // If we have a Groq key and the error seems like a rate limit, try fallback
    if (effectiveGroqKey) {
      console.log("[AI Provider] Falling back to Groq for extractJobInfo...");
      try {
        const data = await extractJobInfoGroq(effectiveGroqKey, imageBase64, mimeType);
        return { data, provider: "groq" };
      } catch (groqError) {
        console.error("[AI Provider] Groq extractJobInfo also failed:", (groqError as Error).message);
        throw new Error(
          `Gemini: ${(error as Error).message} | Groq fallback: ${(groqError as Error).message}`
        );
      }
    }

    throw error;
  }
}

// ─── Generate Email with Fallback ────────────────────────

export async function generateEmailWithFallback(
  jobInfo: JobInfo,
  cvFile?: FileAttachment | null,
  portfolioFile?: FileAttachment | null,
  geminiApiKey?: string,
  groqApiKey?: string
): Promise<AIResult<GeneratedEmail>> {
  const effectiveGroqKey = groqApiKey || process.env.GROQ_API_KEY;

  // Try Gemini first
  try {
    const data = await geminiGenerate(jobInfo, cvFile, portfolioFile, geminiApiKey);
    return { data, provider: "gemini" };
  } catch (error) {
    console.warn("[AI Provider] Gemini generateEmail failed:", (error as Error).message);

    // Fallback to Groq
    if (effectiveGroqKey) {
      console.log("[AI Provider] Falling back to Groq for generateEmail...");
      try {
        const data = await generateEmailGroq(effectiveGroqKey, jobInfo, cvFile, portfolioFile);
        return { data, provider: "groq" };
      } catch (groqError) {
        console.error("[AI Provider] Groq generateEmail also failed:", (groqError as Error).message);
        throw new Error(
          `Gemini: ${(error as Error).message} | Groq fallback: ${(groqError as Error).message}`
        );
      }
    }

    throw error;
  }
}
