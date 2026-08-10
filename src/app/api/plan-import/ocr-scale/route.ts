import { NextResponse } from 'next/server';
import { runGeminiOcrAndScale } from '@/lib/plan-import/gemini';
import { parseImportSource } from '@/lib/plan-import/validate';

export const runtime = 'nodejs';

// Server-side OCR + scale calibration for the local-ml (YOLO) path. Geometry
// is detected client-side; this route only extracts text and computes scale,
// since that requires a VLM call with a server-held API key.
export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return NextResponse.json({ error: 'OCR requires GOOGLE_GENERATIVE_AI_API_KEY to be set.' }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as { source?: unknown };
    const source = parseImportSource(payload.source);
    const result = await runGeminiOcrAndScale(source);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR and scale calibration failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
