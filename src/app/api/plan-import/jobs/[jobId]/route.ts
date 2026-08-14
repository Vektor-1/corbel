import { NextResponse } from 'next/server';
import { getRunpodImport } from '@/lib/plan-import/runpod';
import { getPipelineJob } from '@/lib/plan-import/pipeline';
import { resolveProvider } from '@/lib/plan-import/provider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_: Request, context: { params: Promise<{ jobId: string }> }) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  try {
    const { jobId } = await context.params;
    const provider = resolveProvider();

    if (provider === 'claude-holistic' || provider === 'claude-api' || provider === 'claude-agent' || provider === 'gemini') {
      const job = getPipelineJob(jobId);
      if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
      return NextResponse.json({ id: jobId, providerJobId: jobId, ...job, updatedAt: new Date().toISOString() });
    }

    const job = await getRunpodImport(jobId);
    return NextResponse.json({ id: jobId, providerJobId: jobId, ...job, updatedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to read import job.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
