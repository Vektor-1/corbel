import type { TutorMessage, TutorContext } from './types';

export const MAX_TUTOR_MESSAGE_LENGTH = 600;
export const MAX_TUTOR_HISTORY = 6;

const systemPrompt = `You are Corbel's Plan Reading Tutor. Teach beginner architecture and construction students how to read a visible two-bedroom 2D floor plan. Use short, plain language. Explain terms before using them. Encourage the student to observe labels, walls, doors, and the marked 3 m wall. Do not invent dimensions, room uses, building rules, or facts not shown. You are a learning aid, not a professional, structural, or building-code authority. For structural safety, code compliance, or professional approval, tell the student to consult a qualified tutor or professional.`;

export function validateTutorPayload(payload: unknown): { messages: TutorMessage[] } | { error: string } {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { messages?: unknown }).messages)) {
    return { error: 'Send a question to the tutor.' };
  }
  const raw = (payload as { messages: unknown[] }).messages;
  if (raw.length < 1 || raw.length > MAX_TUTOR_HISTORY) return { error: 'Please send up to six short messages.' };
  const messages: TutorMessage[] = [];
  for (const message of raw) {
    if (!message || typeof message !== 'object') return { error: 'Messages must be plain text.' };
    const { role, content } = message as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return { error: 'Messages must be plain text.' };
    const text = content.trim();
    if (!text || text.length > MAX_TUTOR_MESSAGE_LENGTH) return { error: 'Each message must be between 1 and 600 characters.' };
    messages.push({ role, content: text });
  }
  return { messages };
}

/**
 * Normalise optional rule-engine context. This parser is deliberately kept
 * separate from the public tutor route: request-provided values must never be
 * elevated into system instructions. A future trusted server workflow may use
 * it after constructing the context itself.
 */
export function validateTutorContext(payload: unknown): TutorContext | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const { misconceptionTitle, misconceptionExplanation, citation, evidence } = payload as Record<string, unknown>;
  return {
    misconceptionTitle: typeof misconceptionTitle === 'string' ? misconceptionTitle : undefined,
    misconceptionExplanation: typeof misconceptionExplanation === 'string' ? misconceptionExplanation : undefined,
    citation: typeof citation === 'string' ? citation : undefined,
    evidence: typeof evidence === 'string' ? evidence : undefined,
  };
}

export function tutorIsAvailable() {
  return Boolean(process.env.RODIUM_AI_API_KEY);
}
export async function askPlanTutor(messages: TutorMessage[]): Promise<string> {
  const apiKey = process.env.RODIUM_AI_API_KEY;
  if (!apiKey) throw new Error('TUTOR_UNAVAILABLE');
  const baseUrl = process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1';
  const model = process.env.RODIUM_AI_MODEL?.trim() || 'rodium/fast';
  const systemMessages = [{ role: 'system' as const, content: systemPrompt }];
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: 350, messages: [...systemMessages, ...messages] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('TUTOR_UNAVAILABLE');
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error('TUTOR_UNAVAILABLE');
  return answer;
}
