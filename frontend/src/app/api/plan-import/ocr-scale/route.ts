import { NextResponse } from 'next/server';
import { runOcrAndScale as runDispatcherOcrAndScale } from '@/lib/plan-import/provider-dispatcher';
import { resolveProvider } from '@/lib/plan-import/provider';
import { parseImportSource } from '@/lib/plan-import/validate';

export const runtime = 'nodejs';

// Server-side OCR + scale calibration for geometry sources that don't run
// their own OCR step (the local-ml/YOLO path, and the self-hosted ML
// backend path). Geometry is detected elsewhere; this route only extracts
// text and computes scale.
//
// Uses the same AgentRouter/Rodium provider dispatcher as hosted reconstruction.
export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  const hasProviderKey = !!(process.env.AGENT_ROUTER_API_KEY || process.env.RODIUM_AI_API_KEY);
  if (!hasProviderKey) {
    return NextResponse.json(
      { error: 'OCR requires AGENT_ROUTER_API_KEY or RODIUM_AI_API_KEY to be set.' },
      { status: 503 }
    );
  }

  try {
    const payload = (await request.json()) as { source?: unknown };
    const source = parseImportSource(payload.source);
    const result = await runDispatcherOcrAndScale(source, resolveProvider());
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR and scale calibration failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
