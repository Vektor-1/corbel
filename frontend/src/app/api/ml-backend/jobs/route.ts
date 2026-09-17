import { NextResponse } from 'next/server';
import { callAsParticipant, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const payload = (await request.json()) as { uploadId?: string };
    if (!payload.uploadId) {
      return NextResponse.json({ error: 'uploadId is required.' }, { status: 400 });
    }

    const response = await callAsParticipant('/v1/inference-jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId: payload.uploadId }),
    });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to submit job.' }, { status: response.status });
    return NextResponse.json(body, { status: 202 });
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to submit ML backend job.';
    return NextResponse.json({ error: message }, { status });
  }
}
