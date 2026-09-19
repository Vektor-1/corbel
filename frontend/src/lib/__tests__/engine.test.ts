import { describe, expect, it } from 'vitest';
import * as engine from '../engine';

/**
 * A single import-and-call smoke test for the engine barrel. This is not a
 * functional test of the underlying logic (each function has its own tests) --
 * it exists to catch the barrel itself drifting: a rename in a source module
 * that silently turns a named export into `undefined` here.
 */
describe('engine barrel', () => {
  it('exposes every declared export as a defined value', () => {
    const missing = Object.entries(engine)
      .filter(([, value]) => value === undefined)
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('runs a full reconstruct -> validate -> export round trip through only the barrel', () => {
    const result = engine.reconstructFloorPlan({
      schemaVersion: 1,
      source: { kind: 'image', fileName: 'plan.png', url: 'blob:x', width: 1000, height: 1000 },
      scale: { pixelsPerMeter: 100, confidence: 0.9, method: 'manual' },
      detections: [
        { id: 'w1', kind: 'wall', confidence: 0.9, start: { x: 0, y: 0 }, end: { x: 500, y: 0 } },
      ],
      overallConfidence: 0.9,
    });

    expect(result.floorPlan.walls).toHaveLength(1);

    const findings = engine.validateFloorPlan(result.floorPlan, engine.ghanaBuildingCode);
    expect(Array.isArray(findings)).toBe(true);

    const exported = engine.createDesignFloorJsonExport(result.floorPlan);
    expect(exported.exportVersion).toBeDefined();
  });
});
