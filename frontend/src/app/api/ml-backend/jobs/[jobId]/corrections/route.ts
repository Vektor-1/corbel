import { NextResponse } from 'next/server';
import { callAsParticipant, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

interface CorrectionPayload {
  approvedGeometry: unknown;
  editDeltas: unknown[];
  errorReason?: string | null;
  trainingConsent: boolean;
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const { jobId } = await context.params;
    const payload = (await request.json()) as Partial<CorrectionPayload>;
    if (!payload.approvedGeometry || !Array.isArray(payload.editDeltas)) {
      return NextResponse.json({ error: 'approvedGeometry and editDeltas are required.' }, { status: 400 });
    }

    const response = await callAsParticipant(`/v1/inference-jobs/${jobId}/corrections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        approvedGeometry: payload.approvedGeometry,
        editDeltas: payload.editDeltas,
        errorReason: payload.errorReason ?? null,
        trainingConsent: payload.trainingConsent ?? false,
      }),
    });
    const body = await response.json();
    if (!response.ok) return NextResponse.json({ error: body.detail ?? 'Unable to submit correction.' }, { status: response.status });
    return NextResponse.json(body, { status: 201 });
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Unable to submit correction.';
    return NextResponse.json({ error: message }, { status });
  }
}
