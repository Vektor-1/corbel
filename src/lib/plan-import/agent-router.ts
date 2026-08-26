import type { ImportSource, ReconstructionResultV1 } from './types';
import { extractJson, runDetectionPipeline, runOcrAndScale, submitPipelineJob, getPipelineJob, type AskFn, type RawLabel, type ScaleResult } from './pipeline';

interface AgentRouterConfig {
  apiKey: string;
  baseUrl: string;
}

function getConfig(): AgentRouterConfig {
  const key = process.env.AGENT_ROUTER_API_KEY;
  if (!key) throw new Error('AGENT_ROUTER_API_KEY is not set.');
  return {
    apiKey: key,
    baseUrl: process.env.AGENT_ROUTER_BASE_URL || 'https://api.agentrouter.org/v1',
  };
}

interface AgentRouterRequest {
  task: 'image-analysis' | 'ocr' | 'scale-calibration';
  image_url: string;
  prompt: string;
  preferred_models?: string[]; // ['gpt-5.6-luna', 'gemini-3.1']
  timeout_ms?: number;
  fallback_enabled?: boolean;
}

interface AgentRouterResponse {
  result: unknown;
  model_used: string;
  latency_ms: number;
  cost_usd: number;
  success: boolean;
  error?: string;
}

async function makeAgentRouterRequest(request: AgentRouterRequest): Promise<AgentRouterResponse> {
  const { apiKey, baseUrl } = getConfig();
  const response = await fetch(`${baseUrl}/route`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...request,
      timeout_ms: request.timeout_ms ?? 30_000,
      fallback_enabled: request.fallback_enabled ?? true,
    }),
  });

  if (!response.ok) {
    throw new Error(`AgentRouter error (${response.status}): ${await response.text()}`);
  }

  return (await response.json()) as AgentRouterResponse;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}

// ── Stage 1: Image analysis (P1) ──────────────────────────────────────────────
// Route to GPT 5.6 Luna primarily (detailed analysis), fallback to Gemini 3.1

export function makeAskImageAnalysis(imageUrl: string): AskFn {
  return async (prompt: string) => {
    const response = await makeAgentRouterRequest({
      task: 'image-analysis',
      image_url: imageUrl,
      prompt,
      preferred_models: ['gpt-5.6-luna', 'gemini-3.1'],
      fallback_enabled: true,
    });

    if (!response.success) {
      throw new Error(`Image analysis failed: ${response.error}`);
    }

    return extractJson(JSON.stringify(response.result));
  };
}

// ── Stage 4: OCR (P4) ─────────────────────────────────────────────────────────
// Route to Gemini 3.1 primarily (excellent OCR), fallback to GPT

export function makeAskOcr(imageUrl: string): AskFn {
  return async (prompt: string) => {
    const response = await makeAgentRouterRequest({
      task: 'ocr',
      image_url: imageUrl,
      prompt,
      preferred_models: ['gemini-3.1', 'gpt-5.6-luna'],
      fallback_enabled: true,
    });

    if (!response.success) {
      throw new Error(`OCR failed: ${response.error}`);
    }

    return extractJson(JSON.stringify(response.result));
  };
}

// ── Stage 5: Scale calibration (P5) ───────────────────────────────────────────
// Route to GPT 5.6 Luna (reasoning), fallback to Gemini

export function makeAskScaleCalibration(imageUrl: string): AskFn {
  return async (prompt: string) => {
    const response = await makeAgentRouterRequest({
      task: 'scale-calibration',
      image_url: imageUrl,
      prompt,
      preferred_models: ['gpt-5.6-luna', 'gemini-3.1'],
      fallback_enabled: true,
    });

    if (!response.success) {
      throw new Error(`Scale calibration failed: ${response.error}`);
    }

    return extractJson(JSON.stringify(response.result));
  };
}

// ── Detection (P1 + P2 + P3) ──────────────────────────────────────────────────

export async function runAgentRouterDetection(source: ImportSource): Promise<ReconstructionResultV1> {
  const ask = makeAskImageAnalysis(source.url);
  return runDetectionPipeline(ask, source, 'agent-router-detect');
}

export function submitAgentRouterJob(source: ImportSource): string {
  return submitPipelineJob(source, 'agent-router-detect', async () => makeAskImageAnalysis(source.url));
}

export function getAgentRouterJob(id: string) {
  return getPipelineJob(id);
}

// ── OCR + Scale (P4 + P5) ─────────────────────────────────────────────────────

export async function runAgentRouterOcrAndScale(source: ImportSource): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  // P4: OCR with Gemini 3.1 routing
  const askOcr = makeAskOcr(source.url);
  // P5: Scale calibration with GPT routing
  const askScale = makeAskScaleCalibration(source.url);

  // Run P4 and P5 in parallel
  const [ocrLabels, scale] = await Promise.all([
    runOcrAndScale(askOcr, source, 'agent-router-ocr').then((r) => r.labels),
    runOcrAndScale(askScale, source, 'agent-router-scale').then((r) => r.scale),
  ]);

  return { labels: ocrLabels, scale };
}

// ── Metrics collection for beta testing ───────────────────────────────────────

export interface RouteMetrics {
  stage: string;
  modelUsed: string;
  latencyMs: number;
  costUsd: number;
}

const metrics: RouteMetrics[] = [];

export function getMetrics(): RouteMetrics[] {
  return metrics;
}

export function clearMetrics(): void {
  metrics.length = 0;
}
