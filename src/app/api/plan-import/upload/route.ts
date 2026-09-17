import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { isSafeUploadPathname, MAX_UPLOAD_SIZE_BYTES } from '@/lib/uploads/uploadPolicy';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (process.env.PLAN_IMPORT_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Plan import is not enabled.' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!isSafeUploadPathname(pathname)) throw new Error('Upload a PNG, JPEG, WebP or PDF floor plan.');

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
          maximumSizeInBytes: MAX_UPLOAD_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Job submission happens explicitly after upload so the user can confirm
        // page and scale details before paid inference begins.
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
