import { describe, expect, it } from 'vitest';
import { validateTraceFeedback } from '../traceFeedback';
import type { FloorPlan } from '@/types/design';

const plan: FloorPlan = {
  id: 'trace-feedback', name: 'Trace', width: 12000, height: 9000, scale: 100,
  walls: [
    { id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 50, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
    { id: 'w2', startPoint: { x: 50, y: 0 }, endPoint: { x: 50, y: 50 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
    { id: 'w3', startPoint: { x: 50, y: 50 }, endPoint: { x: 0, y: 50 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
    { id: 'w4', startPoint: { x: 0, y: 50 }, endPoint: { x: 0, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
  ],
  rooms: [
    { id: 'r1', name: 'Room 1', vertices: [], area: 0.8 },
    { id: 'r2', name: 'Room 2', vertices: [], area: 0.9 },
  ],
  doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(),
};

describe('image retrace feedback', () => {
  it('does not make physical-size claims before a known-length calibration', () => {
    const result = validateTraceFeedback(plan, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'info', rule: 'set-drawing-scale' });
  });

  it('raises a cautious scale review only when multiple geometry patterns agree', () => {
    const result = validateTraceFeedback(plan, {
      wallId: 'w1', knownLengthMm: 3_000, pixelsPerMeter: 100, calibratedAt: '2026-08-31T00:00:00.000Z',
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'warning', rule: 'check-drawing-scale', targetId: 'w1' });
    expect(result[0].remediation).toContain('Recheck');
  });

  it('flags an incomplete trace and duplicate wall using observable geometry', () => {
    const incomplete = {
      ...plan,
      rooms: [],
      walls: [
        plan.walls[0],
        plan.walls[1],
        { ...plan.walls[0], id: 'w1-copy' },
      ],
    };
    const result = validateTraceFeedback(incomplete, undefined);

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ rule: 'complete-traced-room', evidence: expect.stringContaining('bounded room') }),
      expect.objectContaining({ rule: 'review-duplicate-wall', evidence: expect.stringContaining('endpoints') }),
    ]));
  });

  it('stays silent for a freehand plan that never started as an image trace', () => {
    const freehandOpenBoundary = { ...plan, rooms: [] };
    expect(validateTraceFeedback(freehandOpenBoundary, undefined, false)).toEqual([]);
  });
});
