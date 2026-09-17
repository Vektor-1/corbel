import type { BackendGeometry } from '@/lib/plan-import/fromBackendGeometry';

type FetchLike = typeof fetch;

export interface MlBackendImportOptions {
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  maxPolls?: number;
  onStatus?: (status: string, progress: number) => void;
}

interface JobResponse {
  id: string;
  status: 'queued' | 'processing' | 'review' | 'failed' | 'cancelled';
  progress: number;
  result?: { geometry: BackendGeometry } & Record<string, unknown>;
  error?: string;
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Upload a file to the self-hosted backend via Corbel's proxy routes. */
export async function uploadToMlBackend(file: File, fetchImpl: FetchLike = fetch): Promise<string> {
  const form = new FormData();
  form.append('file', file);
  const response = await fetchImpl('/api/ml-backend/upload', { method: 'POST', body: form });
  const body = (await response.json()) as { uploadId?: string; error?: string };
  if (!response.ok || !body.uploadId) throw new Error(body.error ?? 'Backend upload failed.');
  return body.uploadId;
}

/** Submit an inference job and poll until it reaches a terminal state. Mirrors
 * hostedImport.ts's waitForHostedReconstruction, one level lower (raw
 * backend geometry, not yet a ReconstructionResultV1 -- see
 * fromBackendGeometry.ts for that step). */
export async function waitForMlBackendGeometry(
  uploadId: string,
  { fetchImpl = fetch, pollIntervalMs = 1_500, maxPolls = 60, onStatus }: MlBackendImportOptions = {}
): Promise<{ jobId: string; geometry: BackendGeometry }> {
  const submission = await fetchImpl('/api/ml-backend/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
  const submitted = (await submission.json()) as Partial<JobResponse> & { error?: string };
  if (!submission.ok || !submitted.id) throw new Error(submitted.error ?? 'Unable to submit backend job.');

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (pollIntervalMs > 0) await delay(pollIntervalMs);
    const response = await fetchImpl(`/api/ml-backend/jobs/${submitted.id}`, { cache: 'no-store' });
    const job = (await response.json()) as Partial<JobResponse> & { error?: string };
    if (!response.ok) throw new Error(job.error ?? 'Unable to read backend job progress.');
    if (job.status) onStatus?.(job.status, job.progress ?? 0);
    if (job.status === 'review' && job.result?.geometry) {
      return { jobId: submitted.id, geometry: job.result.geometry };
    }
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error ?? 'Backend inference job failed.');
    }
  }

  throw new Error('The self-hosted backend did not finish within the expected time. Please try again.');
}
