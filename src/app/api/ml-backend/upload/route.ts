import { NextResponse } from 'next/server';
import { validateUploadContent, validateUploadFile } from '@/lib/uploads/uploadPolicy';
import { callAsParticipant, MlBackendError } from '@/lib/server/mlBackendClient';

export const runtime = 'nodejs';

interface UploadCreateResponse {
  id: string;
  uploadUrl: string;
  expiresAt: string;
}

// Proxies the backend's 2-step upload (create -> presigned PUT -> complete)
// behind a single call, mirroring the simplicity of the existing
// /api/plan-import/local-upload route. The browser never sees the presigned
// MinIO URL or the participant token.
export async function POST(request: Request) {
  if (process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND !== 'true') {
    return NextResponse.json({ error: 'ML backend import is not enabled.' }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const checked = validateUploadFile(file);
    if (!checked.ok) return NextResponse.json({ error: checked.message }, { status: 400 });
    const content = await validateUploadContent(file);
    if (!content.ok) return NextResponse.json({ error: content.message }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const createResponse = await callAsParticipant('/v1/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, sizeBytes: file.size }),
    });
    if (!createResponse.ok) {
      const detail = await createResponse.json().catch(() => ({}));
      return NextResponse.json({ error: detail.detail ?? 'Unable to create upload.' }, { status: createResponse.status });
    }
    const created = (await createResponse.json()) as UploadCreateResponse;

    const putResponse = await fetch(created.uploadUrl, { method: 'PUT', body: bytes });
    if (!putResponse.ok) {
      return NextResponse.json({ error: 'Uploading to storage failed.' }, { status: 502 });
    }

    const completeResponse = await callAsParticipant(`/v1/uploads/${created.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha256 }),
    });
    if (!completeResponse.ok) {
      const detail = await completeResponse.json().catch(() => ({}));
      return NextResponse.json({ error: detail.detail ?? 'Unable to finalize upload.' }, { status: completeResponse.status });
    }

    return NextResponse.json({ uploadId: created.id });
  } catch (error) {
    const status = error instanceof MlBackendError ? error.status : 500;
    const message = error instanceof Error ? error.message : 'Backend upload failed.';
    return NextResponse.json({ error: message }, { status });
  }
}
