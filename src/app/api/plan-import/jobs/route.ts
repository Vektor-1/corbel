import { NextResponse } from 'next/server';
import { isAllowedImportUrl } from '@/lib/plan-import/runpod';
import { submitDetectionJob } from '@/lib/plan-import/provider-dispatcher';
import { parseImportSource } from '@/lib/plan-import/validate';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as { source?: unknown };
    const source = parseImportSource(payload.source);
    if (!isAllowedImportUrl(source.url)) {
      return NextResponse.json({ error: 'The source file host is not allowed.' }, { status: 400 });
    }

    const id = submitDetectionJob(source);
    return NextResponse.json(
      { id, providerJobId: id, status: 'processing', source, progress: 20,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { status: 202 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit import.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
