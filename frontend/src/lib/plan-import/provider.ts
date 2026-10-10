// Corbel deliberately supports two hosted providers. AgentRouter is preferred
// when both credentials are present; Rodium remains the fallback.
export type VisionProvider = 'agent-router' | 'rodium-ai';

export function configuredProviders(): VisionProvider[] {
  return [
    ...(process.env.AGENT_ROUTER_API_KEY ? ['agent-router' as const] : []),
    ...(process.env.RODIUM_AI_API_KEY ? ['rodium-ai' as const] : []),
  ];
}

export function resolveProvider(): VisionProvider {
  const explicit = process.env.VISION_PROVIDER;
  if (explicit === 'agent-router') return 'agent-router';
  if (explicit === 'rodium-ai') return 'rodium-ai';

  // Precedence: AgentRouter > Rodium.
  if (configuredProviders().includes('agent-router')) return 'agent-router';
  if (configuredProviders().includes('rodium-ai')) return 'rodium-ai';
  return 'agent-router';
}
