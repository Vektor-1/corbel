import { NextRequest, NextResponse } from 'next/server';
import { Canonical3D } from '@/lib/types/3d';
import { convert3DTo2D, analyze3DGeometry } from '@/lib/conversion/2d-3d-sync';

export async function POST(request: NextRequest) {
  try {
    const { floor3D } = await request.json();

    if (!floor3D) {
      return NextResponse.json(
        { error: '3D floor plan required' },
        { status: 400 }
      );
    }

    // Analyze 3D geometry
    const analysis = analyze3DGeometry(floor3D);

    // Convert 3D to 2D
    const floor2D = convert3DTo2D(floor3D);

    // Validate conversion
    const wallsMatched = floor3D.walls.length === floor2D.walls.length;
    const roomsMatched = floor3D.rooms.length === floor2D.rooms.length;
    const openingsMatched = floor3D.openings.length === floor2D.openings.length;

    const confidence =
      (wallsMatched ? 1 : 0.8) *
      (roomsMatched ? 1 : 0.9) *
      (openingsMatched ? 1 : 0.85) *
      0.95; // Base conversion confidence

    return NextResponse.json({
      success: true,
      floor2D,
      analysis,
      confidence: Math.min(1, confidence),
      conversion: {
        direction: '3d-to-2d',
        wallsMatched,
        roomsMatched,
        openingsMatched,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Analysis failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/analyze-3d',
    method: 'POST',
    description: 'Analyze 3D floor plan and extract 2D representation',
    input: {
      floor3D: 'Canonical3D.Floor3D object',
    },
    output: {
      floor2D: 'Canonical.Floor extracted from 3D',
      analysis: 'Geometry analysis metrics',
      confidence: 'Conversion confidence 0-1',
    },
  });
}
