import type { ImportJobStatus, ImportSource, ReconstructionResultV1 } from './types';
import { parseReconstructionResult } from './validate';

const endpointId = () => process.env.RUNPOD_ENDPOINT_ID;
const apiKey = () => process.env.RUNPOD_API_KEY;
const localWorker = () => process.env.VISION_WORKER_URL; // e.g. http://localhost:8787

const apiBase = () =>
  localWorker() ?? `https://api.runpod.ai/v2/${endpointId()}`;

function assertConfigured() {
  if (!localWorker() && (!endpointId() || !apiKey())) {
    throw new Error('Plan vision provider is not configured.');
  }
}

function headers() {
  const key = apiKey();
  return {
    ...(key ? { Authorization: `Bearer ${key}` } : {}),
    'Content-Type': 'application/json',
  };
}

export function isAllowedImportUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.hostname === 'localhost')) {
      return false;
    }

    if (process.env.NODE_ENV === 'development' && url.hostname === 'localhost') return true;

    const configured = (process.env.PLAN_IMPORT_ALLOWED_HOSTS ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean);
    const host = url.hostname.toLowerCase();
    return host.endsWith('.blob.vercel-storage.com') || configured.includes(host);
  } catch {
    return false;
  }
}

export async function submitRunpodImport(source: ImportSource) {
  assertConfigured();
  const response = await fetch(`${apiBase()}/run`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ input: { schemaVersion: 1, source } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Vision provider rejected the job (${response.status}).`);

  const payload = (await response.json()) as { id?: string; status?: string };
  if (!payload.id) throw new Error('Vision provider did not return a job id.');
  return { providerJobId: payload.id, status: mapRunpodStatus(payload.status) };
}

export async function getRunpodImport(providerJobId: string): Promise<{
  status: ImportJobStatus;
  progress: number;
  result?: ReconstructionResultV1;
  error?: string;
}> {
  assertConfigured();
  if (!/^[a-zA-Z0-9_-]+$/.test(providerJobId)) throw new Error('Invalid provider job id.');

  const response = await fetch(`${apiBase()}/status/${providerJobId}`, {
    headers: headers(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Unable to read vision job (${response.status}).`);

  const payload = (await response.json()) as {
    status?: string;
    output?: unknown;
    error?: string;
    executionTime?: number;
  };
  const status = mapRunpodStatus(payload.status);
  const result = status === 'completed' && payload.output ? parseReconstructionResult(payload.output) : undefined;

  return {
    status: result ? 'review' : status,
    progress: status === 'completed' ? 100 : status === 'processing' ? 55 : status === 'failed' ? 100 : 10,
    result,
    error: payload.error,
  };
}

function mapRunpodStatus(status?: string): ImportJobStatus {
  switch (status?.toUpperCase()) {
    case 'IN_QUEUE':
      return 'queued';
    case 'IN_PROGRESS':
      return 'processing';
    case 'COMPLETED':
      return 'completed';
    case 'FAILED':
    case 'CANCELLED':
    case 'TIMED_OUT':
      return 'failed';
    default:
      return 'queued';
  }
}
