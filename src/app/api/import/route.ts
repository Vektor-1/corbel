import { NextRequest, NextResponse } from 'next/server';
import { runAgentRouterDetection } from '@/lib/plan-import/agent-router';
import { runRodiumDetection } from '@/lib/plan-import/rodium-ai';
import type { ImportSource } from '@/lib/plan-import/types';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const provider = (formData.get('provider') as string) || 'agent-router';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Convert file to base64
    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${file.type};base64,${base64}`;

    const source: ImportSource = {
      kind: file.type.startsWith('application/pdf') ? 'pdf' : 'image',
      fileName: file.name,
      url: dataUrl,
      width: 0,
      height: 0,
    };

    // Route to appropriate provider
    let result;
    try {
      if (provider === 'rodium') {
        result = await runRodiumDetection(source);
      } else {
        result = await runAgentRouterDetection(source);
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: 'Detection failed',
          details: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
      );
    }

    // Count detections by type
    const walls = result.detections?.filter((d: any) => d.kind === 'wall') || [];
    const doors = result.detections?.filter((d: any) => d.kind === 'door') || [];
    const windows = result.detections?.filter((d: any) => d.kind === 'window') || [];
    const rooms = result.detections?.filter((d: any) => d.kind === 'room') || [];

    return NextResponse.json({
      success: true,
      sourceId: `import-${Date.now()}`,
      filename: file.name,
      provider,
      result,
      wallCount: walls.length,
      roomCount: rooms.length,
      openingCount: doors.length + windows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Import failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/import',
    method: 'POST',
    contentType: 'multipart/form-data',
    parameters: {
      file: 'Image file (PNG/JPG)',
      provider: 'Agent provider (agent-router or rodium, default: agent-router)',
    },
    example: {
      curl: 'curl -X POST -F "file=@floor-plan.png" http://localhost:3000/api/import',
    },
  });
}
