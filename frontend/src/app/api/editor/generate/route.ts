import { NextResponse } from 'next/server';
import { generateFloorPlanFromPrompt } from '@/lib/plan-import/chatGenerate';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ available: Boolean(process.env.RODIUM_AI_API_KEY) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate prompt
    if (typeof body.prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const prompt = body.prompt.trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Please describe a floor plan to generate.' }, { status: 400 });
    }

    if (prompt.length > 500) {
      return NextResponse.json({ error: 'Description must be under 500 characters.' }, { status: 400 });
    }

    // Check availability
    if (!process.env.RODIUM_AI_API_KEY) {
      return NextResponse.json({ error: 'The AI plan generator is not configured right now.' }, { status: 503 });
    }

    const result = await generateFloorPlanFromPrompt(prompt);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI plan generator is unavailable right now.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
