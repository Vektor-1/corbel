import { NextResponse } from 'next/server';
import { callAsResearcher, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const response = await callAsResearcher('/v1/research/training-candidates', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to list training candidates.' }, { status: response.status });
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to list training candidates.';
    return NextResponse.json({ error: message }, { status });
  }
}
