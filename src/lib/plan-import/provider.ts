// Provider precedence: explicit VISION_PROVIDER wins; otherwise:
// agent-router (AgentRouter routing: Gemini 3.1 + GPT 5.6 Luna) if AGENT_ROUTER_API_KEY present,
// then rodium-ai (Rodium AI orchestration) if RODIUM_AI_API_KEY present,
// then claude-holistic (full detection) if ANTHROPIC_API_KEY present,
// then claude-api (OCR+scale only), then gemini, then claude-agent, then worker/RunPod.
export type VisionProvider = 'agent-router' | 'rodium-ai' | 'claude-holistic' | 'claude-api' | 'claude-agent' | 'gemini' | 'worker';

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'agent-router') return 'agent-router';
  if (explicit === 'rodium-ai') return 'rodium-ai';
  if (explicit === 'claude-holistic') return 'claude-holistic';
  if (explicit === 'claude-api') return 'claude-api';
  if (explicit === 'claude-agent') return 'claude-agent';
  if (explicit === 'gemini') return 'gemini';
  if (explicit === 'worker' || explicit === 'runpod') return 'worker';

  // Precedence: agent-router > rodium-ai > claude > gemini > worker
  if (process.env.AGENT_ROUTER_API_KEY) return 'agent-router';
  if (process.env.RODIUM_AI_API_KEY) return 'rodium-ai';
  if (process.env.ANTHROPIC_API_KEY && !process.env.VISION_PROVIDER_OCROPONLY)
    return 'claude-holistic';
  if (process.env.ANTHROPIC_API_KEY) return 'claude-api';
  if (process.env.VISION_WORKER_URL) return 'worker';
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) return 'gemini';
  return 'worker';
}
