import type { ReconstructionResultV1 } from '@/lib/plan-import/types';

export interface CorbelBackendClientOptions {
  baseUrl: string;
  participantToken: string;
  fetchImpl?: typeof fetch;
}

type BackendResult = {
  source: { kind: 'image' | 'pdf'; fileName: string; width: number; height: number };
  geometry: { walls: Array<Record<string, unknown>>; openings: Array<Record<string, unknown>> };
  diagnostics?: Array<{ message: string }>;
  overallConfidence: number;
};

/** Converts the self-hosted backend's richer result to the existing immutable
 * editor contract. The UI can adopt this client without changing reconstruction. */
export function backendResultToReconstruction(result: BackendResult): ReconstructionResultV1 {
  const detections = [
    ...result.geometry.walls,
    ...result.geometry.openings.map(({ heightMm, sillHeightMm, ...opening }) =>
      Object.fromEntries(Object.entries({ ...opening, heightMm, sillHeightMm }).filter(([, value]) => value !== null))
    ),
  ] as unknown as ReconstructionResultV1['detections'];
  return {
    schemaVersion: 1,
    source: { ...result.source, url: '', purpose: 'reconstruct' },
    scale: { pixelsPerMeter: 100, confidence: 0.15, method: 'manual' },
    detections,
    overallConfidence: result.overallConfidence,
    warnings: result.diagnostics?.map(item => item.message) ?? [],
  };
}

export async function pollSelfHostedJob(
  jobId: string,
  { baseUrl, participantToken, fetchImpl = fetch }: CorbelBackendClientOptions,
  { intervalMs = 1_500, maxPolls = 120 } = {}
): Promise<ReconstructionResultV1> {
  for (let attempt = 0; attempt < maxPolls; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, intervalMs));
    const response = await fetchImpl(`${baseUrl}/v1/inference-jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${participantToken}` }, cache: 'no-store',
    });
    const job = await response.json() as { status?: string; error?: string; result?: BackendResult };
    if (!response.ok) throw new Error(job.error ?? 'Unable to read self-hosted inference job.');
    if (job.status === 'review' && job.result) return backendResultToReconstruction(job.result);
    if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.error ?? `Inference job ${job.status}.`);
  }
  throw new Error('The self-hosted inference job did not complete in time.');
}
