import { extractJson } from '@/lib/plan-import/pipeline';
import { resolveRodiumModel } from '@/lib/plan-import/rodium-ai';
import { parsePlanChatResponse } from './validate';
import type { PlanChatContext, PlanChatResponse } from './types';

const MAX_MESSAGE_LENGTH = 1_000;
type ChatContent = string | Array<
  { type: 'text'; text: string } |
  { type: 'image_url'; image_url: { url: string } }
>;

function requestBody(message: string, context: PlanChatContext, stream: boolean) {
  const prompt = message.trim();
  if (!prompt) throw new Error('Describe the plan change you want.');
  if (prompt.length > MAX_MESSAGE_LENGTH) throw new Error('Message must be under ' + MAX_MESSAGE_LENGTH + ' characters.');
  const { canvasSnapshot, ...contextWithoutSnapshot } = context;
  const userText = JSON.stringify({
    request: prompt,
    context: {
      ...contextWithoutSnapshot,
      floorPlan: contextWithoutSnapshot.floorPlan
        ? { ...contextWithoutSnapshot.floorPlan, createdAt: undefined, updatedAt: undefined }
        : null,
    },
  });
  const user: ChatContent = typeof canvasSnapshot === 'string' && canvasSnapshot.startsWith('data:image/') && canvasSnapshot.length <= 5_000_000
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: canvasSnapshot } },
      ]
    : userText;
  const system = [
    "You are Corbel's architectural plan assistant. Return ONLY valid JSON.",
    'You may propose only validated structured operations, never code or prose outside JSON.',
    'The context includes selectedElementIds and selectedElements when the user has selected geometry in the 2D editor. Treat selectedElements as authoritative context and target those elements when the user says selected elements. Do not invent IDs or modify unselected elements unless explicitly asked.',
    'If selectedElements is non-empty, mention the selection scope in reply and use its geometry, labels, and dimensions to ground the response.',
    'If a request is ambiguous or unsafe, return no operations and explain the missing detail in reply.',
    'For review requests, analyze validationResults and the supplied geometry. Return recommendations in reply and no operations unless the user explicitly asks for a fix.',
    'Do not claim professional approval. Distinguish detected issues, educational guidance, and uncertain inferences.',
    'Break multi-step work into 2-8 simple todo items with status pending, in_progress, or completed.',
    'Supported operation types: update-wall, update-door, update-window, update-room, add-wall, add-door, add-window, set-scale, rename-plan, delete-element.',
    'For broad or destructive changes set requiresConfirmation to true. Always set requiresConfirmation to true when operations are present.',
    'Coordinates use the existing Corbel plan coordinate system. Preserve fields not being changed.',
    'JSON shape: {\"intent\":\"create|edit|configure|analyze\",\"reply\":\"short user-facing message\",\"requiresConfirmation\":true,\"todo\":[{\"id\":\"step-1\",\"title\":\"Inspect selected walls\",\"status\":\"completed\"}],\"operations\":[]}',
  ].join('\n');
  return {
    key: process.env.RODIUM_AI_API_KEY,
    url: (process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1') + '/chat/completions',
    body: {
      model: resolveRodiumModel(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.1,
      max_tokens: 3_000,
      response_format: { type: 'json_object' },
      stream,
    },
  };
}

export async function generatePlanChatResponse(message: string, context: PlanChatContext): Promise<PlanChatResponse> {
  const request = requestBody(message, context, false);
  if (!request.key) throw new Error('RODIUM_AI_API_KEY is not configured for plan chat.');
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + request.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('Rodium AI error (' + response.status + '): ' + await response.text());
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error('Rodium AI returned an empty plan action.');
  return parsePlanChatResponse(extractJson(content));
}

export async function generatePlanChatResponseStream(
  message: string,
  context: PlanChatContext,
  onToken: (token: string) => void,
): Promise<PlanChatResponse> {
  const request = requestBody(message, context, true);
  if (!request.key) throw new Error('RODIUM_AI_API_KEY is not configured for plan chat.');
  const response = await fetch(request.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + request.key, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error('Rodium AI error (' + response.status + '): ' + await response.text());
  if (!response.body) throw new Error('Rodium AI did not return a response stream.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let done = false;
  const consume = (rawEvent: string) => {
    const line = rawEvent.split('\n').find((item) => item.startsWith('data: '));
    if (!line) return;
    const value = line.slice(6).trim();
    if (!value || value === '[DONE]') {
      done = value === '[DONE]';
      return;
    }
    try {
      const payload = JSON.parse(value) as {
        choices?: Array<{ delta?: { content?: string }; message?: { content?: string } }>;
      };
      const token = payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? '';
      if (token) {
        content += token;
        onToken(token);
      }
    } catch {
      // Ignore incomplete provider frames; the next frame completes them.
    }
  };

  while (!done) {
    const chunk = await reader.read();
    buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    events.forEach(consume);
    if (chunk.done) break;
  }
  if (buffer) consume(buffer);
  if (!content) throw new Error('Rodium AI returned an empty plan action.');
  return parsePlanChatResponse(extractJson(content));
}
