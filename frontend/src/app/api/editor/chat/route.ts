import { NextResponse } from 'next/server';
import { generatePlanChatResponse } from '@/lib/plan-chat/generate';
import { parsePlanChatResponse } from '@/lib/plan-chat/validate';
import type { PlanChatContext } from '@/lib/plan-chat/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown; context?: unknown };
    if (typeof body.message !== 'string') return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    const context = body.context as PlanChatContext;
    if (!context || !Array.isArray(context.selectedElementIds) || !['2d', '3d', 'split'].includes(context.viewMode)) {
      return NextResponse.json({ error: 'A valid editor context is required.' }, { status: 400 });
    }
    const result = await generatePlanChatResponse(body.message, context);
    return NextResponse.json(parsePlanChatResponse(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The AI plan assistant is unavailable.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
