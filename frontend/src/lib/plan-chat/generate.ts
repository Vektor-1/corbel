import { extractJson } from '@/lib/plan-import/pipeline';
import { resolveRodiumModel } from '@/lib/plan-import/rodium-ai';
import { OBJECT_CATALOG } from '@/lib/objects/catalog';
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
    'For broad or destructive changes set requiresConfirmation to true. Always set requiresConfirmation to true when operations are present.',
    'Coordinates use the existing Corbel plan coordinate system (plan units, not millimetres, for every x/y point). Preserve fields not being changed.',
    'Each operation MUST match one of these exact shapes — field names, nesting, and required fields are strict and validated server-side; no other shape is accepted:',
    '{"type":"add-wall","wall":{"id":"wall_1","startPoint":{"x":0,"y":0},"endPoint":{"x":400,"y":0},"thickness":200,"height":2700,"type":"loadBearing","material":"sandcrete"}}',
    '{"type":"add-door","door":{"id":"door_1","wallId":"wall_1","position":{"x":150,"y":0},"width":900,"type":"internal","swing":"left"}}',
    '{"type":"add-window","window":{"id":"window_1","wallId":"wall_2","position":{"x":200,"y":0},"width":1000,"height":1200,"sillHeight":900}}',
    '{"type":"update-wall","id":"wall_1","updates":{"thickness":225}}  (updates may include any of: startPoint, endPoint, thickness, material, type, height)',
    '{"type":"update-door","id":"door_1","updates":{"width":800}}  (updates may include any of: position, wallId, width, type, swing, openDirection)',
    '{"type":"update-window","id":"window_1","updates":{"width":1200}}  (updates may include any of: position, wallId, width, height, sillHeight)',
    '{"type":"update-room","id":"room_1","updates":{"name":"Bedroom"}}  (updates may include any of: name, type, vertices)',
    '{"type":"add-object","object":{"id":"obj_1","assetId":"single-bed","position":{"x":250,"y":200},"rotation":0,"scale":1}}',
    '{"type":"update-object","id":"obj_1","updates":{"position":{"x":300,"y":200}}}  (updates may include any of: assetId, position, rotation, scale)',
    '{"type":"set-scale","scale":100}',
    '{"type":"rename-plan","name":"New plan name"}',
    '{"type":"delete-element","id":"wall_1","element":"wall"}  (element is one of: wall, door, window, room, object)',
    'wall.material must be exactly one of: sandcrete, laterite, concrete, timber. wall.type must be exactly loadBearing or partition. door.type must be exactly entry or internal. door.swing must be exactly left or right. Every add-wall needs id, startPoint, endPoint, thickness, height, type, and material — none are optional. Every add-door needs id, wallId, position, width, type, and swing. Every add-window needs id, wallId, position, width, height, and sillHeight. door/window position is a {x,y} point measured along the host wall (not a bare number), and wallId must reference a wall id created earlier in the same operations array when building a new plan from scratch.',
    'thickness, width, height, and sillHeight are always real-world millimetres, a different scale from the x/y plan-unit coordinates — do not reuse coordinate-scale numbers for these. Use realistic residential values: wall thickness 200-300mm (minimum 150mm for a load-bearing wall per Ghana code), wall height 2700-3000mm, door width 800-1000mm, window width 900-1500mm with height 1000-1500mm and sillHeight 800-1000mm.',
    'Furniture and freestanding objects use add-object/update-object/delete-element(element:"object"). object.assetId MUST be exactly one of these catalog ids (no others exist, do not invent or guess a close spelling) — ' +
      Object.entries(
        OBJECT_CATALOG.reduce<Record<string, string[]>>((byCategory, asset) => {
          (byCategory[asset.category] ??= []).push(asset.id);
          return byCategory;
        }, {})
      ).map(([category, ids]) => category + ': ' + ids.join(', ')).join(' | ') + '.',
    'object.position is a plan-unit {x,y} point (100 units = 1 metre, same scale as wall startPoint/endPoint) placed inside the room the object belongs to, not on top of a wall or opening. object.rotation is radians around the vertical axis (0 = the asset\'s default orientation). object.scale is a multiplier where 1 = the asset\'s real-world size — default to 1 unless the user explicitly asks to resize it. Every add-object needs id, assetId, position, rotation, and scale — none are optional.',
    'JSON shape: {\"intent\":\"create|edit|configure|analyze\",\"reply\":\"short user-facing message\",\"requiresConfirmation\":true,\"todo\":[{\"id\":\"step-1\",\"title\":\"Inspect selected walls\",\"status\":\"completed\"}],\"operations\":[]}',
    'Output MUST be a single minified JSON object: no indentation, no line breaks, no spaces after colons or commas. The response token budget is limited, and whitespace wastes it — compact formatting is required to fit a full multi-wall plan within budget. Keep "reply" to one short sentence.',
  ].join('\n');
  return {
    key: process.env.RODIUM_AI_API_KEY,
    url: (process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1') + '/chat/completions',
    body: {
      model: resolveRodiumModel(),
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature: 0.1,
      max_tokens: 6_000,
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
