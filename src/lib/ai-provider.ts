// AI Provider abstraction layer
// Tries Gemini first, falls back to Groq on rate limit / errors

import { extractJobInfo as geminiExtract, generateEmail as geminiGenerate } from "./gemini";
import { extractJobInfoGroq, generateEmailGroq } from "./groq";
import type { JobInfo, GeneratedEmail, FileAttachment } from "./gemini";

export type AIProvider = "gemini" | "groq";

export interface AIResult<T> {
  data: T;
  provider: AIProvider;
}

function isRateLimitOrQuotaError(error: unknown): boolean {
  const message = (error as Error)?.message?.toLowerCase() || "";
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource_exhausted") ||
    message.includes("too many requests") ||
    message.includes("exceeded") ||
    message.includes("limit")
  );
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
        // Throw the original Gemini error if Groq also fails, unless Groq error is more informative
        throw new Error(
          `Gemini: ${(error as Error).message} | Groq fallback: ${(groqError as Error).message}`
        );
      }
    }

    // No Groq key available, throw original error
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
