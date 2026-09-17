import { describe, expect, it } from 'vitest';
import { getCombinedBounds, getElementIdsInRect, getUnpaddedElementBounds } from '../element-bounds';
import type { FloorPlan } from '@/types/design';

function plan(): FloorPlan {
  return {
    id: 'p1', name: 'test', width: 2000, height: 2000, scale: 100,
    walls: [{ id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 200, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 }],
    rooms: [],
    doors: [], windows: [],
    objects: [{ id: 'o1', assetId: 'stool', position: { x: 500, y: 500 }, rotation: 0, scale: 1 }],
    groups: [],
    createdAt: new Date(), updatedAt: new Date(),
  };
}

describe('getUnpaddedElementBounds', () => {
  it('bounds a wall around its centerline without spotlight padding', () => {
    const bounds = getUnpaddedElementBounds('w1', plan())!;
    expect(bounds.x).toBeCloseTo(0, 0);
    expect(bounds.width).toBeCloseTo(200, 0);
  });

  it('bounds an object around its catalog footprint centered on its position', () => {
    const bounds = getUnpaddedElementBounds('o1', plan())!;
    expect(bounds.x + bounds.width / 2).toBeCloseTo(500, 0);
    expect(bounds.y + bounds.height / 2).toBeCloseTo(500, 0);
    expect(bounds.width).toBeGreaterThan(0);
  });

  it('returns null for an id that does not exist', () => {
    expect(getUnpaddedElementBounds('missing', plan())).toBeNull();
  });
});

describe('getElementIdsInRect', () => {
  it('finds elements intersecting a marquee rectangle and excludes those outside it', () => {
    const ids = getElementIdsInRect({ x: -10, y: -10, width: 220, height: 20 }, plan());
    expect(ids).toEqual(['w1']);
  });

  it('returns nothing when the rect misses every element', () => {
    expect(getElementIdsInRect({ x: 900, y: 900, width: 10, height: 10 }, plan())).toEqual([]);
  });
});

describe('getCombinedBounds', () => {
  it('spans every requested element', () => {
    const bounds = getCombinedBounds(['w1', 'o1'], plan())!;
    expect(bounds.x).toBeLessThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeGreaterThanOrEqual(500);
  });

  it('returns null when no ids resolve to bounds', () => {
    expect(getCombinedBounds(['missing'], plan())).toBeNull();
  });
});
