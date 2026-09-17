import { NextResponse } from 'next/server';
import { callAsParticipant, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const { jobId } = await context.params;
    const response = await callAsParticipant(`/v1/inference-jobs/${jobId}`, { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to read job.' }, { status: response.status });
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to read ML backend job.';
    return NextResponse.json({ error: message }, { status });
  }
}
