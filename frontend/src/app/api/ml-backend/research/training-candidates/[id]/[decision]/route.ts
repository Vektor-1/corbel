import { NextResponse } from 'next/server';
import { callAsResearcher, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

export async function POST(_request: Request, context: { params: Promise<{ id: string; decision: string }> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const { id, decision } = await context.params;
    if (decision !== 'approve' && decision !== 'reject') {
      return NextResponse.json({ error: 'decision must be approve or reject.' }, { status: 400 });
    }
    const response = await callAsResearcher(`/v1/research/training-candidates/${id}/${decision}`, { method: 'POST' });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to update training candidate.' }, { status: response.status });
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to update training candidate.';
    return NextResponse.json({ error: message }, { status });
  }
}
