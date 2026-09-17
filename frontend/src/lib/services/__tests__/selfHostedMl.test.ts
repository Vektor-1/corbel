import { describe, expect, it } from 'vitest';
import { backendResultToReconstruction } from '../selfHostedMl';

describe('self-hosted ML adapter', () => {
  it('adapts backend geometry to the editor reconstruction contract', () => {
    const result = backendResultToReconstruction({
      source: { kind: 'image', fileName: 'plan.png', width: 640, height: 480 },
      geometry: {
        walls: [{ id: 'w1', kind: 'wall', confidence: 0.8, start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thicknessMm: 225, role: 'partition' }],
        openings: [{ id: 'o1', kind: 'door', confidence: 0.8, wallId: 'w1', offsetRatio: 0.5, widthMm: 900, swing: 'left' }],
      },
      overallConfidence: 0.8,
    });
    expect(result.detections).toHaveLength(2);
    expect(result.detections[1]).toMatchObject({ kind: 'door', wallId: 'w1' });
  });
});
