import type { ImportSource, ReconstructionResultV1 } from './types';
import { type RawLabel, type ScaleResult } from './pipeline';
import { resolveProvider, type VisionProvider } from './provider';
import * as agentRouter from './agent-router';
import * as rodiumAi from './rodium-ai';

// Jobs use UUIDs, so retain the selected provider for polling in this process.
// This also lets local development use Rodium without changing global settings.
const submittedJobProviders = new Map<string, VisionProvider>();

function isDevelopmentLocalSource(source: ImportSource): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    const url = new URL(source.url);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function resolveSubmissionProvider(source: ImportSource, provider?: VisionProvider): VisionProvider {
  const selected = provider || resolveProvider();
  // AgentRouter is remote and cannot reach a browser's localhost upload URL.
  // Rodium reads the image from the Next.js process and therefore works in dev.
  if (selected === 'agent-router' && isDevelopmentLocalSource(source) && process.env.RODIUM_AI_API_KEY) {
    return 'rodium-ai';
  }
  return selected;
}

// ── Detection (P1–P3) ─────────────────────────────────────────────────────────

export async function runDetection(source: ImportSource, provider?: VisionProvider): Promise<ReconstructionResultV1> {
  const visionProvider = provider || resolveProvider();
  console.log(`[provider-dispatcher] Running detection with ${visionProvider}`);

  switch (visionProvider) {
    case 'agent-router':
      return agentRouter.runAgentRouterDetection(source);
    case 'rodium-ai':
      return rodiumAi.runRodiumDetection(source);
  }
}

// ── OCR + Scale (P4–P5) ───────────────────────────────────────────────────────

function hasProviderKey(visionProvider: VisionProvider): boolean {
  return visionProvider === 'agent-router' ? !!process.env.AGENT_ROUTER_API_KEY : !!process.env.RODIUM_AI_API_KEY;
}

function runOcrAndScaleOnce(visionProvider: VisionProvider, source: ImportSource) {
  console.log(`[provider-dispatcher] Running OCR+scale with ${visionProvider}`);
  switch (visionProvider) {
    case 'agent-router':
      return agentRouter.runAgentRouterOcrAndScale(source);
    case 'rodium-ai':
      return rodiumAi.runRodiumOcrAndScale(source);
  }
}

/**
 * Falls back to the other configured provider if the primary one fails, for
 * any reason (quota/billing, network, timeout) -- a VISION_PROVIDER pin
 * picks which provider is tried *first*, not a promise to stay hard-blocked
 * when the alternative is already configured and available. If both fail,
 * the thrown error includes both real messages so the failure is
 * diagnosable instead of only ever reporting whichever ran last.
 */
export async function runOcrAndScale(
  source: ImportSource,
  provider?: VisionProvider
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const primary = provider || resolveProvider();
  const fallback: VisionProvider = primary === 'agent-router' ? 'rodium-ai' : 'agent-router';

  try {
    return await runOcrAndScaleOnce(primary, source);
  } catch (primaryError) {
    if (!hasProviderKey(fallback)) throw primaryError;
    const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(`[provider-dispatcher] OCR+scale failed on ${primary} (${primaryMessage}), retrying with ${fallback}`);
    try {
      return await runOcrAndScaleOnce(fallback, source);
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`OCR/scale failed on both providers. ${primary}: ${primaryMessage}. ${fallback}: ${fallbackMessage}.`);
    }
  }
}

// ── Job-based detection (async) ───────────────────────────────────────────────

export function submitDetectionJob(source: ImportSource, provider?: VisionProvider): string {
  const visionProvider = resolveSubmissionProvider(source, provider);
  console.log(`[provider-dispatcher] Submitting detection job with ${visionProvider}`);

  switch (visionProvider) {
    case 'agent-router': {
      const id = agentRouter.submitAgentRouterJob(source);
      submittedJobProviders.set(id, visionProvider);
      return id;
    }
    case 'rodium-ai': {
      const id = rodiumAi.submitRodiumJob(source);
      submittedJobProviders.set(id, visionProvider);
      return id;
    }
  }
}

/**
 * Jobs created by the current providers use UUIDs from the shared pipeline
 * store. Older integrations may supply a provider-prefixed id, so retain that
 * routing convention while treating an unprefixed id as belonging to the
 * selected provider.
 */
export function resolveDetectionJobProvider(id: string, provider: VisionProvider): VisionProvider {
  if (id.startsWith('agent-router-')) return 'agent-router';
  if (id.startsWith('rodium-')) return 'rodium-ai';
  return provider;
}

export function getDetectionJob(id: string, provider?: VisionProvider) {
  const visionProvider = provider || resolveProvider();
  const jobProvider = resolveDetectionJobProvider(id, submittedJobProviders.get(id) ?? visionProvider);

  switch (jobProvider) {
    case 'agent-router':
      return agentRouter.getAgentRouterJob(id);
    case 'rodium-ai':
      return rodiumAi.getRodiumJob(id);
  }
}
