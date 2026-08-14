// Provider precedence: explicit VISION_PROVIDER wins; otherwise:
// claude-api if ANTHROPIC_API_KEY present, then Gemini if key present,
// then claude-agent if available, then worker/RunPod.
export type VisionProvider = 'claude-api' | 'claude-agent' | 'gemini' | 'worker';

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'claude-api') return 'claude-api';
  if (explicit === 'claude-agent') return 'claude-agent';
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'worker' || explicit === 'runpod') return 'worker';
  if (process.env.ANTHROPIC_API_KEY) return 'claude-api';
  if (process.env.VISION_WORKER_URL) return 'worker';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini';
  return 'worker';
}
