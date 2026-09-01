import { NextResponse } from 'next/server';
import { getDetectionJob } from '@/lib/plan-import/provider-dispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  try {
    const { jobId } = await context.params;
    const job = getDetectionJob(jobId);
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    return NextResponse.json({ id: jobId, providerJobId: jobId, ...job, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read import job.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
