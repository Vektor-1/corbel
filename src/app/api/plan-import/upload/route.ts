import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

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
        const normalized = pathname.toLowerCase();
        const supported = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'].some((extension) =>
          normalized.endsWith(extension)
        );
        if (!supported) throw new Error('Upload a PNG, JPEG, WebP or PDF floor plan.');

        return {
          allowedContentTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
          maximumSizeInBytes: 50 * 1024 * 1024,
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
