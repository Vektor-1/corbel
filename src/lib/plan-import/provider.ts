// Provider precedence: explicit VISION_PROVIDER wins; otherwise local worker,
// then Gemini when a key is present, then RunPod (via the worker path).
export type VisionProvider = 'claude-agent' | 'gemini' | 'worker';

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'claude-agent') return 'claude-agent';
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'worker' || explicit === 'runpod') return 'worker';
  if (process.env.VISION_WORKER_URL) return 'worker';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini';
  return 'worker';
}
