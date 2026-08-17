import { describe, expect, it } from 'vitest';

import {
  ENDPOINT_SNAP_DISTANCE,
  GRID_SIZE,
  distanceToPoint,
  pointInBounds,
  rectangleCollision,
  snapToGrid,
} from '../snap';

describe('grid snapping and geometry utilities', () => {
  it('exports the shared millimetre grid and endpoint tolerance', () => {
    expect(GRID_SIZE).toBe(100);
    expect(ENDPOINT_SNAP_DISTANCE).toBe(16);
  });

  it('rounds positive and negative values to the nearest grid line', () => {
    expect(snapToGrid(149)).toBe(100);
    expect(snapToGrid(150)).toBe(200);
    expect(snapToGrid(-149)).toBe(-100);
    expect(snapToGrid(-150)).toBe(-100);
  });

  it('includes rectangle boundaries when checking a point', () => {
    const rect = { x: 100, y: 200, width: 300, height: 400 };
    expect(pointInBounds({ x: 100, y: 200 }, rect)).toBe(true);
    expect(pointInBounds({ x: 400, y: 600 }, rect)).toBe(true);
    expect(pointInBounds({ x: 401, y: 600 }, rect)).toBe(false);
  });

  it('detects overlapping and edge-touching rectangles', () => {
    const first = { x: 0, y: 0, width: 100, height: 100 };
    expect(rectangleCollision(first, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(rectangleCollision(first, { x: 100, y: 0, width: 20, height: 20 })).toBe(true);
    expect(rectangleCollision(first, { x: 101, y: 0, width: 20, height: 20 })).toBe(false);
  });

  it('calculates Euclidean point distance', () => {
    expect(distanceToPoint({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
