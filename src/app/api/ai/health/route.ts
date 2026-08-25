import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { discoverModels } from "@/lib/model-discovery";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get optional override keys from query params
    const { searchParams } = new URL(request.url);
    const geminiApiKey = searchParams.get("geminiApiKey") || undefined;
    const groqApiKey = searchParams.get("groqApiKey") || undefined;

    // discoverModels() calls the real Gemini & Groq list-models APIs
    // It has built-in 5s timeout per provider and 10min cache
    const discovered = await discoverModels(geminiApiKey, groqApiKey);

    const geminiOk = discovered.gemini.length > 0;
    const groqOk = discovered.groq.length > 0;

    return NextResponse.json({
      gemini: { ok: geminiOk, models: discovered.gemini.length },
      groq: { ok: groqOk, models: discovered.groq.length },
      anyOk: geminiOk || groqOk,
    });
  } catch (error) {
    console.error("[AI Health] Error:", error);
    return NextResponse.json({
      gemini: { ok: false, models: 0 },
      groq: { ok: false, models: 0 },
      anyOk: false,
      error: (error as Error).message,
    });
  }
}
