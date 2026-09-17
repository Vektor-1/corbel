import { describe, expect, it } from 'vitest';
import { reconstructFloorPlan } from '../reconstruct';

describe('reconstructFloorPlan', () => {
  it('keeps AI source and confidence on editable reconstructed elements', () => {
    const result = reconstructFloorPlan({
      schemaVersion: 1,
      source: { kind: 'image', fileName: 'plan.png', url: 'https://example.com/plan.png', width: 1000, height: 800 },
      scale: { pixelsPerMeter: 100, confidence: 0.9, method: 'dimension-ocr' },
      overallConfidence: 0.74,
      detections: [
        { id: 'w1', kind: 'wall', confidence: 0.71, start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thicknessMm: 225, role: 'loadBearing' },
        { id: 'd1', kind: 'door', confidence: 0.62, wallId: 'w1', offsetRatio: 0.5, widthMm: 900, swing: 'left' },
        { id: 'win1', kind: 'window', confidence: 0.58, wallId: 'w1', offsetRatio: 0.8, widthMm: 1200, heightMm: 1200, sillHeightMm: 900, swing: 'left' },
      ],
    });

    expect(result.floorPlan.walls[0]).toMatchObject({ source: 'ai', confidence: 0.71 });
    expect(result.floorPlan.doors[0]).toMatchObject({ source: 'ai', confidence: 0.62 });
    expect(result.floorPlan.windows[0]).toMatchObject({ source: 'ai', confidence: 0.58 });
  });
});
