import { describe, expect, it, vi } from 'vitest';

import { waitForHostedReconstruction } from '../hostedImport';

const result = {
  schemaVersion: 1 as const,
  source: { kind: 'image' as const, fileName: 'plan.png', url: 'https://example.com/plan.png', width: 800, height: 600 },
  scale: { pixelsPerMeter: 100, confidence: 0.8, method: 'manual' as const },
  detections: [],
  overallConfidence: 0.8,
};

describe('waitForHostedReconstruction', () => {
  it('submits to the configured hosted provider job API and returns its review result', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'job-1', status: 'processing' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'job-1', status: 'review', result }), { status: 200 }));

    await expect(
      waitForHostedReconstruction(result.source, { fetchImpl, pollIntervalMs: 0 })
    ).resolves.toEqual(result);

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      '/api/plan-import/jobs',
      expect.objectContaining({ method: 'POST' })
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(2, '/api/plan-import/jobs/job-1', { cache: 'no-store' });
  });

  it('stops polling and explains when a provider does not finish', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'job-2', status: 'processing' }), { status: 202 }))
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ id: 'job-2', status: 'processing' }), { status: 200 }))
      );

    await expect(
      waitForHostedReconstruction(result.source, { fetchImpl, pollIntervalMs: 0, maxPolls: 2 })
    ).rejects.toThrow('did not finish within the expected time');
  });
});
