import { generatePlanChatResponseStream } from '@/lib/plan-chat/generate';
import { parsePlanChatResponse } from '@/lib/plan-chat/validate';
import type { PlanChatContext } from '@/lib/plan-chat/types';

export const runtime = 'nodejs';

const encoder = new TextEncoder();
const event = (payload: unknown) => encoder.encode('data: ' + JSON.stringify(payload) + '\n\n');

export async function POST(request: Request) {
  const body = await request.json() as { message?: unknown; context?: unknown };
  if (typeof body.message !== 'string') return new Response(JSON.stringify({ error: 'Message is required.' }), { status: 400 });
  const context = body.context as PlanChatContext;
  if (!context || !Array.isArray(context.selectedElementIds) || !['2d', '3d', 'split'].includes(context.viewMode)) {
    return new Response(JSON.stringify({ error: 'A valid editor context is required.' }), { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(event({ type: 'status', message: 'Reading the current plan…' }));
        const result = await generatePlanChatResponseStream(body.message as string, context, (token) => {
          controller.enqueue(event({ type: 'token', token }));
        });
        controller.enqueue(event({ type: 'status', message: 'Preparing a reviewable response…' }));
        controller.enqueue(event({ type: 'final', response: parsePlanChatResponse(result) }));
      } catch (error) {
        controller.enqueue(event({ type: 'error', message: error instanceof Error ? error.message : 'The AI plan assistant is unavailable.' }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
