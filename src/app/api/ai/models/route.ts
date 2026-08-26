import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { discoverModels } from "@/lib/model-discovery";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const geminiApiKey = searchParams.get("geminiApiKey") || undefined;
    const groqApiKey = searchParams.get("groqApiKey") || undefined;

    const discovered = await discoverModels(geminiApiKey, groqApiKey);

    return NextResponse.json({
      gemini: discovered.gemini,
      groq: discovered.groq,
    });
  } catch (error) {
    console.error("[AI Models] Error:", error);
    return NextResponse.json(
      { gemini: [], groq: [], error: (error as Error).message },
    );
  }
}
