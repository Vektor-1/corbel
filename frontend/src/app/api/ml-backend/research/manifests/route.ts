import { NextResponse } from 'next/server';
import { callAsResearcher, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }
  try {
    const response = await callAsResearcher('/v1/research/model-manifests', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to list manifests.' }, { status: response.status });
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to list manifests.';
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }
  try {
    const payload = (await request.json()) as { manifestId?: string };
    if (!payload.manifestId) return NextResponse.json({ error: 'manifestId is required.' }, { status: 400 });

    const response = await callAsResearcher('/v1/research/model-manifests/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manifestId: payload.manifestId }),
    });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to promote manifest.' }, { status: response.status });
    return NextResponse.json(body);
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to promote manifest.';
    return NextResponse.json({ error: message }, { status });
  }
}
