// Corbel deliberately supports two hosted providers. AgentRouter is preferred
// when both credentials are present; Rodium remains the fallback.
export type VisionProvider = 'agent-router' | 'rodium-ai';

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'agent-router') return 'agent-router';
  if (explicit === 'rodium-ai') return 'rodium-ai';

  // Precedence: AgentRouter > Rodium.
  if (process.env.AGENT_ROUTER_API_KEY) return 'agent-router';
  if (process.env.RODIUM_AI_API_KEY) return 'rodium-ai';
  return 'agent-router';
}
