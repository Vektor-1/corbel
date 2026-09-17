import { describe, expect, it } from 'vitest';
import { pointAlongWall, projectOffsetOntoWall } from '../wall-intersections';
import type { Wall } from '@/types/design';

function wall(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'w1',
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 300, y: 0 },
    thickness: 225,
    material: 'sandcrete',
    type: 'loadBearing',
    height: 2700,
    ...overrides,
  };
}

describe('projectOffsetOntoWall', () => {
  it('is the inverse of pointAlongWall for a point exactly on the wall', () => {
    const w = wall();
    const offset = 120;
    const point = pointAlongWall(w, offset);
    expect(projectOffsetOntoWall(w, point)).toBeCloseTo(offset, 5);
  });

  it('projects a point off the centerline onto the nearest point along the wall', () => {
    const w = wall();
    // 50 units off the wall body, but still centered along its length
    expect(projectOffsetOntoWall(w, { x: 150, y: 50 })).toBeCloseTo(150, 5);
  });

  it('clamps to the wall start when the projection falls before it', () => {
    const w = wall();
    expect(projectOffsetOntoWall(w, { x: -100, y: 0 })).toBe(0);
  });

  it('clamps to the wall end when the projection falls beyond it', () => {
    const w = wall();
    expect(projectOffsetOntoWall(w, { x: 1000, y: 0 })).toBe(300);
  });

  it('works for a diagonal wall', () => {
    const w = wall({ startPoint: { x: 0, y: 0 }, endPoint: { x: 300, y: 400 } }); // length 500
    expect(projectOffsetOntoWall(w, { x: 150, y: 200 })).toBeCloseTo(250, 5);
  });

  it('returns 0 for a degenerate (zero-length) wall rather than dividing by zero', () => {
    const w = wall({ startPoint: { x: 10, y: 10 }, endPoint: { x: 10, y: 10 } });
    expect(projectOffsetOntoWall(w, { x: 999, y: -999 })).toBe(0);
  });
});
