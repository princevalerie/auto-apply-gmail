// ─── Auto Model Discovery ─────────────────────────────────
// Fetches available models from Gemini & Groq APIs at runtime,
// caches results, and picks the best available model.

interface CachedModels {
  gemini: string[];
  groq: string[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cache: CachedModels | null = null;

// Gemini model preferences (in priority order — vision-capable flash models first)
const GEMINI_PREFERRED = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash-lite",
];

// Groq vision model preferences (in priority order)
const GROQ_VISION_PREFERRED = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "llama-3.2-90b-vision-preview",
  "llama-3.2-11b-vision-preview",
];

// Groq text model preferences (in priority order)
const GROQ_TEXT_PREFERRED = [
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-8b-instant",
];

// ─── Fetch Available Models ────────────────────────────────

async function fetchGeminiModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(800) }
    );
    if (!res.ok) {
      console.warn(`[Model Discovery] Gemini list models failed: ${res.status}`);
      return [];
    }
    const data = await res.json() as {
      models?: Array<{
        name: string;
        supportedGenerationMethods?: string[];
      }>;
    };
    return (data.models || [])
      .filter(
        (m) =>
          m.supportedGenerationMethods?.includes("generateContent") &&
          !m.name.includes("embedding") &&
          !m.name.includes("aqa")
      )
      .map((m) => m.name.replace("models/", ""));
  } catch (error) {
    console.warn("[Model Discovery] Gemini fetch error:", (error as Error).message);
    return [];
  }
}

async function fetchGroqModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1200),
    });
    if (!res.ok) {
      console.warn(`[Model Discovery] Groq list models failed: ${res.status}`);
      return [];
    }
    const data = await res.json() as {
      data?: Array<{ id: string; active?: boolean }>;
    };
    return (data.data || [])
      .filter((m) => m.active !== false)
      .map((m) => m.id);
  } catch (error) {
    console.warn("[Model Discovery] Groq fetch error:", (error as Error).message);
    return [];
  }
}

// ─── Discovery + Cache ─────────────────────────────────────

export async function discoverModels(
  geminiKey?: string,
  groqKey?: string
): Promise<CachedModels> {
  // Skip cache when explicit override keys are provided (need fresh validation)
  const hasOverrideKeys = !!(geminiKey || groqKey);
  if (!hasOverrideKeys && cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return cache;
  }

  const effectiveGeminiKey = geminiKey || process.env.GEMINI_API_KEY;
  const effectiveGroqKey = groqKey || process.env.GROQ_API_KEY;

  const [geminiModels, groqModels] = await Promise.all([
    effectiveGeminiKey
      ? fetchGeminiModels(effectiveGeminiKey)
      : Promise.resolve([]),
    effectiveGroqKey
      ? fetchGroqModels(effectiveGroqKey)
      : Promise.resolve([]),
  ]);

  cache = {
    gemini: geminiModels,
    groq: groqModels,
    timestamp: Date.now(),
  };

  console.log(
    `[Model Discovery] Found ${geminiModels.length} Gemini models, ${groqModels.length} Groq models`
  );
  if (geminiModels.length > 0) {
    console.log("[Model Discovery] Gemini sample:", geminiModels.slice(0, 8).join(", "));
  }
  if (groqModels.length > 0) {
    console.log("[Model Discovery] Groq sample:", groqModels.slice(0, 8).join(", "));
  }

  return cache;
}

// ─── Pick Best Model ───────────────────────────────────────

export function getPreferredGeminiModels(available: string[]): string[] {
  if (available.length === 0) return GEMINI_PREFERRED;

  const result: string[] = [];

  // First: add preferred models that are actually available
  for (const pref of GEMINI_PREFERRED) {
    // Exact match or prefix match (e.g., "gemini-2.0-flash" matches "gemini-2.0-flash-001")
    const match = available.find((a) => a === pref || a.startsWith(pref));
    if (match && !result.includes(match)) {
      result.push(match);
    }
  }

  // Second: add any other flash/pro models not already in list
  for (const model of available) {
    if (
      (model.includes("flash") || model.includes("pro")) &&
      !model.includes("thinking") &&
      !result.includes(model)
    ) {
      result.push(model);
    }
  }

  return result.length > 0 ? result : GEMINI_PREFERRED;
}

export function getPreferredGroqVisionModel(available: string[]): string {
  if (available.length === 0) return GROQ_VISION_PREFERRED[0];

  // Try preferred vision models first
  for (const pref of GROQ_VISION_PREFERRED) {
    if (available.includes(pref)) return pref;
  }

  // Fallback: find any vision-capable model
  const visionModel = available.find(
    (m) =>
      m.includes("vision") ||
      m.includes("scout") ||
      m.includes("maverick") ||
      m.includes("llava")
  );

  return visionModel || GROQ_VISION_PREFERRED[0];
}

export function getPreferredGroqTextModel(available: string[]): string {
  if (available.length === 0) return GROQ_TEXT_PREFERRED[0];

  for (const pref of GROQ_TEXT_PREFERRED) {
    if (available.includes(pref)) return pref;
  }

  // Fallback: any llama model
  const llamaModel = available.find((m) => m.includes("llama"));
  return llamaModel || GROQ_TEXT_PREFERRED[0];
}
