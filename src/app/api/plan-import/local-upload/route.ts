import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';

// Dev-only route: saves the uploaded file to .next/local-uploads and
// returns a localhost URL the vision worker can fetch.
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development.' }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }

    const supported = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!supported.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type.' }, { status: 400 });
    }

    const dir = join(process.cwd(), '.next', 'local-uploads');
    await mkdir(dir, { recursive: true });

    const ext = file.name.split('.').pop() ?? 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const bytes = await file.arrayBuffer();
    await writeFile(join(dir, fileName), Buffer.from(bytes));

    const host = request.headers.get('host') ?? 'localhost:3000';
    const url = `http://${host}/api/plan-import/local-upload/${fileName}`;
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
