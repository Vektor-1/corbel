import { NextResponse } from 'next/server';
import { askPlanTutor, tutorIsAvailable, validateTutorPayload } from '@/lib/plan-reading/tutor';

export const runtime = 'nodejs';

export async function GET() {
  return NextResponse.json({ available: tutorIsAvailable() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const checked = validateTutorPayload(body);
    if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
    if (!tutorIsAvailable()) return NextResponse.json({ error: 'The AI Tutor is not configured right now. You can still complete this lesson without it.' }, { status: 503 });
    // Rule-engine evidence must be generated and trusted server-side before it
    // can be supplied as tutor grounding. Ignore request-provided context so a
    // client cannot elevate arbitrary text into a system-level instruction.
    const answer = await askPlanTutor(checked.messages);
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: 'The AI Tutor is unavailable right now. You can still complete this lesson without it.' }, { status: 503 });
  }
}
