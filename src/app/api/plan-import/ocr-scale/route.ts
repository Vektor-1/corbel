import { NextResponse } from 'next/server';
import { runGeminiOcrAndScale } from '@/lib/plan-import/gemini';
import { runOcrAndScale as runDispatcherOcrAndScale } from '@/lib/plan-import/provider-dispatcher';
import { resolveProvider } from '@/lib/plan-import/provider';
import { parseImportSource } from '@/lib/plan-import/validate';

export const runtime = 'nodejs';

// Server-side OCR + scale calibration for geometry sources that don't run
// their own OCR step (the local-ml/YOLO path, and the self-hosted ML
// backend path). Geometry is detected elsewhere; this route only extracts
// text and computes scale.
//
// Prefers the already-configured AgentRouter/Rodium provider (the same one
// the live hosted-LLM import path uses for detection) so this doesn't carry
// its own separate Gemini-key dependency; falls back to direct Gemini only
// if neither provider key is configured but a Gemini key is.
export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  const hasProviderKey = !!(process.env.AGENT_ROUTER_API_KEY || process.env.RODIUM_AI_API_KEY);
  const hasGeminiKey = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!hasProviderKey && !hasGeminiKey) {
    return NextResponse.json(
      { error: 'OCR requires AGENT_ROUTER_API_KEY, RODIUM_AI_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY to be set.' },
      { status: 503 }
    );
  }

  try {
    const payload = (await request.json()) as { source?: unknown };
    const source = parseImportSource(payload.source);
    const result = hasProviderKey ? await runDispatcherOcrAndScale(source, resolveProvider()) : await runGeminiOcrAndScale(source);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR and scale calibration failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
