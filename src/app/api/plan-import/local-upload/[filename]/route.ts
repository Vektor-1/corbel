import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { lookup } from 'mime-types';

export const runtime = 'nodejs';

export async function GET(_: Request, context: { params: Promise<{ filename: string }> }) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Only available in development.' }, { status: 403 });
  }

  try {
    const { filename } = await context.params;
    if (!/^[\w.-]+$/.test(filename)) {
      return NextResponse.json({ error: 'Invalid filename.' }, { status: 400 });
    }

    const filePath = join(process.cwd(), '.next', 'local-uploads', filename);
    const buffer = await readFile(filePath);
    const contentType = (lookup(filename) || 'application/octet-stream') as string;

    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'File not found.' }, { status: 404 });
  }
}
