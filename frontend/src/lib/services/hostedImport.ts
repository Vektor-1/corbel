import type { ImportJob, ImportSource, ReconstructionResultV1 } from '@/lib/plan-import/types';

type FetchLike = typeof fetch;

export interface HostedImportOptions {
  fetchImpl?: FetchLike;
  pollIntervalMs?: number;
  /** Number of status requests before treating the provider as unavailable. */
  maxPolls?: number;
  onStatus?: (status: NonNullable<ImportJob['status']>, progress: number) => void;
}

const delay = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Submit an image to the configured AgentRouter/Rodium job endpoint and wait
 * until the provider produces a reviewable reconstruction. */
export async function waitForHostedReconstruction(
  source: ImportSource,
  { fetchImpl = fetch, pollIntervalMs = 1_500, maxPolls = 50, onStatus }: HostedImportOptions = {}
): Promise<ReconstructionResultV1> {
  const submission = await fetchImpl('/api/plan-import/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  const submittedJob = (await submission.json()) as Partial<ImportJob> & { error?: string };
  if (!submission.ok || !submittedJob.id) {
    throw new Error(submittedJob.error ?? 'Unable to begin reconstruction.');
  }

  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (pollIntervalMs > 0) await delay(pollIntervalMs);
    const response = await fetchImpl(`/api/plan-import/jobs/${submittedJob.id}`, { cache: 'no-store' });
    const job = (await response.json()) as Partial<ImportJob> & { error?: string };
    if (!response.ok) throw new Error(job.error ?? 'Unable to read reconstruction progress.');
    if (job.status) onStatus?.(job.status, job.progress ?? 0);
    if (job.status === 'review' && job.result) return job.result;
    if (job.status === 'failed') throw new Error(job.error ?? 'Reconstruction failed.');
  }

  throw new Error('The AI provider did not finish within the expected time. Please try again.');
}
