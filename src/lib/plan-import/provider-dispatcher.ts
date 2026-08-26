import type { ImportSource, ReconstructionResultV1 } from './types';
import { type RawLabel, type ScaleResult } from './pipeline';
import { resolveProvider, type VisionProvider } from './provider';
import * as agentRouter from './agent-router';
import * as rodiumAi from './rodium-ai';
import * as claudeApi from './claude-api';
import * as claudeHolistic from './claude-holistic';
import * as gemini from './gemini';

// ── Detection (P1–P3) ─────────────────────────────────────────────────────────

export async function runDetection(source: ImportSource, provider?: VisionProvider): Promise<ReconstructionResultV1> {
  const visionProvider = provider || resolveProvider();
  console.log(`[provider-dispatcher] Running detection with ${visionProvider}`);

  switch (visionProvider) {
    case 'agent-router':
      return agentRouter.runAgentRouterDetection(source);
    case 'rodium-ai':
      return rodiumAi.runRodiumDetection(source);
    case 'claude-holistic':
      return claudeHolistic.runClaudeHolisticDetection(source);
    case 'claude-api':
      return claudeApi.runClaudeApiDetection(source);
    case 'gemini':
      return gemini.runGeminiDetection(source);
    case 'worker':
      throw new Error('Worker detection not yet implemented in dispatcher');
    default:
      throw new Error(`Unknown vision provider: ${visionProvider}`);
  }
}

// ── OCR + Scale (P4–P5) ───────────────────────────────────────────────────────

export async function runOcrAndScale(
  source: ImportSource,
  provider?: VisionProvider
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const visionProvider = provider || resolveProvider();
  console.log(`[provider-dispatcher] Running OCR+scale with ${visionProvider}`);

  switch (visionProvider) {
    case 'agent-router':
      return agentRouter.runAgentRouterOcrAndScale(source);
    case 'rodium-ai':
      return rodiumAi.runRodiumOcrAndScale(source);
    case 'claude-holistic':
    case 'claude-api':
      return claudeApi.runClaudeApiOcrAndScale(source);
    case 'gemini':
      return gemini.runGeminiOcrAndScale(source);
    case 'worker':
      throw new Error('Worker OCR not yet implemented in dispatcher');
    default:
      throw new Error(`Unknown vision provider: ${visionProvider}`);
  }
}

// ── Job-based detection (async) ───────────────────────────────────────────────

export function submitDetectionJob(source: ImportSource, provider?: VisionProvider): string {
  const visionProvider = provider || resolveProvider();
  console.log(`[provider-dispatcher] Submitting detection job with ${visionProvider}`);

  switch (visionProvider) {
    case 'agent-router':
      return agentRouter.submitAgentRouterJob(source);
    case 'rodium-ai':
      return rodiumAi.submitRodiumJob(source);
    case 'claude-holistic':
      return claudeHolistic.submitClaudeHolisticJob(source);
    case 'claude-api':
      return claudeApi.submitClaudeApiJob(source);
    case 'gemini':
      return gemini.submitGeminiJob(source);
    case 'worker':
      throw new Error('Worker job submission not yet implemented in dispatcher');
    default:
      throw new Error(`Unknown vision provider: ${visionProvider}`);
  }
}

export function getDetectionJob(id: string, provider?: VisionProvider) {
  const visionProvider = provider || resolveProvider();
  // Job ID prefixes encode the provider, so this is mostly for compatibility
  if (id.startsWith('agent-router-')) return agentRouter.getAgentRouterJob(id);
  if (id.startsWith('rodium-')) return rodiumAi.getRodiumJob(id);
  if (id.startsWith('claude-')) return claudeApi.getClaudeApiJob(id);
  if (id.startsWith('gemini-')) return gemini.getGeminiJob(id);
  return claudeApi.getClaudeApiJob(id); // fallback
}
