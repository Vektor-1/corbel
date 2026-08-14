// Provider precedence: explicit VISION_PROVIDER wins; otherwise:
// claude-holistic (full detection) if ANTHROPIC_API_KEY present,
// then claude-api (OCR+scale only), then gemini, then claude-agent, then worker/RunPod.
export type VisionProvider = 'claude-holistic' | 'claude-api' | 'claude-agent' | 'gemini' | 'worker';

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'claude-holistic') return 'claude-holistic';
  if (explicit === 'claude-api') return 'claude-api';
  if (explicit === 'claude-agent') return 'claude-agent';
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'worker' || explicit === 'runpod') return 'worker';
  // Default to claude-holistic for full detection if API key present
  if (process.env.ANTHROPIC_API_KEY && !process.env.VISION_PROVIDER_OCROPONLY)
    return 'claude-holistic';
  if (process.env.ANTHROPIC_API_KEY) return 'claude-api';
  if (process.env.VISION_WORKER_URL) return 'worker';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini';
  return 'worker';
}
