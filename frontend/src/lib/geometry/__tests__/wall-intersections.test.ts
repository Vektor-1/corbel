import { describe, expect, it } from 'vitest';
import { insertWallWithIntersections, rehostWallOpening, splitWallAtPoint } from '../wall-intersections';
import type { Door, Wall, Window } from '@/types/design';

function wall(id: string, start: [number, number], end: [number, number], overrides: Partial<Wall> = {}): Wall {
  return {
    id,
    startPoint: { x: start[0], y: start[1] },
    endPoint: { x: end[0], y: end[1] },
    thickness: 225,
    material: 'sandcrete',
    type: 'loadBearing',
    height: 2700,
    ...overrides,
  };
}

const length = (w: Wall) => Math.hypot(w.endPoint.x - w.startPoint.x, w.endPoint.y - w.startPoint.y);
const totalLength = (walls: Wall[]) => walls.reduce((sum, w) => sum + length(w), 0);

describe('insertWallWithIntersections', () => {
  it('adds a wall unchanged when it touches nothing', () => {
    const result = insertWallWithIntersections([], wall('a', [0, 0], [100, 0]));
    expect(result).toHaveLength(1);
    expect(result[0].startPoint).toEqual({ x: 0, y: 0 });
    expect(result[0].endPoint).toEqual({ x: 100, y: 0 });
  });

  it('splits both walls at a T-junction', () => {
    const existing = [wall('a', [0, 0], [200, 0])];
    const result = insertWallWithIntersections(existing, wall('b', [100, 0], [100, 100]));

    // The horizontal wall is cut in two at x=100; the vertical wall starts exactly
    // at the junction and is not split (nothing crosses it partway).
    const horizontalPieces = result.filter((w) => w.startPoint.y === 0 && w.endPoint.y === 0);
    expect(horizontalPieces).toHaveLength(2);
    expect(result.filter((w) => w.id === 'b' || w.id.startsWith('b-split-'))).toHaveLength(1);
  });

  it('splits both walls at a real crossing (plus junction)', () => {
    const existing = [wall('a', [0, 50], [200, 50])];
    const result = insertWallWithIntersections(existing, wall('b', [100, 0], [100, 100]));

    const fromA = result.filter((w) => w.id === 'a' || w.id.startsWith('a-split-'));
    const fromB = result.filter((w) => w.id === 'b' || w.id.startsWith('b-split-'));
    expect(fromA).toHaveLength(2);
    expect(fromB).toHaveLength(2);
  });

  it('leaves a collinear overlap unchanged, per its own documented contract', () => {
    const existing = [wall('a', [0, 0], [200, 0])];
    const result = insertWallWithIntersections(existing, wall('b', [50, 0], [150, 0]));

    // Two parallel, collinear segments never satisfy the cross-product intersection
    // test (it returns null for parallel lines), so nothing is split.
    expect(result).toHaveLength(2);
    expect(result.find((w) => w.id === 'a')).toBeTruthy();
    expect(result.find((w) => w.id === 'b')).toBeTruthy();
  });

  it('does not split at a near-endpoint touch (within epsilon)', () => {
    const existing = [wall('a', [0, 0], [200, 0])];
    const result = insertWallWithIntersections(existing, wall('b', [0, 0], [0, 100]));

    // b starts exactly at a's endpoint -- a T at the very end, not a mid-span split.
    expect(result.filter((w) => w.id === 'a' || w.id.startsWith('a-split-'))).toHaveLength(1);
  });

  it('preserves total wall length across a split (no geometry gained or lost)', () => {
    const existing = [wall('a', [0, 0], [200, 0])];
    const before = totalLength(existing) + 100; // the incoming wall's own length
    const result = insertWallWithIntersections(existing, wall('b', [100, -50], [100, 50]));
    expect(totalLength(result)).toBeCloseTo(before, 5);
  });

  it('handles inserting into an empty plan', () => {
    expect(insertWallWithIntersections([], wall('a', [0, 0], [10, 0]))).toHaveLength(1);
  });

  it('is idempotent for a wall that intersects nothing new', () => {
    const first = insertWallWithIntersections([wall('a', [0, 0], [200, 0])], wall('b', [100, -50], [100, 50]));
    const second = insertWallWithIntersections(first, wall('c', [1000, 1000], [1100, 1000]));
    expect(second).toHaveLength(first.length + 1);
  });
});

describe('splitWallAtPoint', () => {
  it('splits a wall body into two pieces at the given point', () => {
    const walls = [wall('a', [0, 0], [200, 0])];
    const result = splitWallAtPoint(walls, 'a', { x: 100, y: 0 });

    expect(result).toHaveLength(2);
    expect(totalLength(result)).toBeCloseTo(200, 5);
  });

  it('returns the list unchanged when the target wall does not exist', () => {
    const walls = [wall('a', [0, 0], [200, 0])];
    expect(splitWallAtPoint(walls, 'missing', { x: 100, y: 0 })).toBe(walls);
  });

  it('returns the list unchanged when the point does not project onto the wall', () => {
    const walls = [wall('a', [0, 0], [200, 0])];
    // Off the end of the segment entirely -- projectPointOntoWall returns null.
    expect(splitWallAtPoint(walls, 'a', { x: 500, y: 0 })).toBe(walls);
  });

  it('refuses to split within tolerance of the start endpoint', () => {
    const walls = [wall('a', [0, 0], [1000, 0])];
    const result = splitWallAtPoint(walls, 'a', { x: 5, y: 0 }, 20);
    expect(result).toBe(walls);
  });

  it('refuses to split within tolerance of the end endpoint', () => {
    const walls = [wall('a', [0, 0], [1000, 0])];
    const result = splitWallAtPoint(walls, 'a', { x: 995, y: 0 }, 20);
    expect(result).toBe(walls);
  });

  it('leaves every other wall in the plan untouched', () => {
    const walls = [wall('a', [0, 0], [200, 0]), wall('b', [500, 500], [600, 500])];
    const result = splitWallAtPoint(walls, 'a', { x: 100, y: 0 });
    expect(result.find((w) => w.id === 'b')).toEqual(walls[1]);
  });
});

describe('rehostWallOpening', () => {
  const door = (overrides: Partial<Door> = {}): Door => ({
    id: 'door-1',
    wallId: 'a',
    position: { x: 50, y: 0 },
    width: 900,
    type: 'internal',
    swing: 'left',
    ...overrides,
  });

  const win = (overrides: Partial<Window> = {}): Window => ({
    id: 'win-1',
    wallId: 'a',
    position: { x: 50, y: 0 },
    width: 900,
    height: 1200,
    sillHeight: 900,
    ...overrides,
  });

  it('returns the opening unchanged when its host wall no longer exists at all', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    const opening = rehostWallOpening(door({ wallId: 'gone' }), previous, previous);
    expect(opening).toEqual(door({ wallId: 'gone' }));
  });

  it('keeps the same wall and position when nothing changed', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    const opening = rehostWallOpening(door(), previous, previous);
    expect(opening.wallId).toBe('a');
    expect(opening.position.x).toBeCloseTo(50, 5);
  });

  it('re-hosts a door onto the split piece that now contains its world position', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    // Split at x=100: a door originally at x=150 belongs on the second half.
    const next = splitWallAtPoint(previous, 'a', { x: 100, y: 0 });

    const opening = rehostWallOpening(door({ position: { x: 150, y: 0 } }), previous, next);

    const host = next.find((w) => w.id === opening.wallId);
    expect(host).toBeTruthy();
    expect(host!.startPoint.x).toBeLessThanOrEqual(150);
    expect(host!.endPoint.x).toBeGreaterThanOrEqual(150);
    // The world position is preserved: offset from the new host's own start.
    expect(opening.position.x).toBeCloseTo(150 - host!.startPoint.x, 5);
  });

  it('falls back to the original opening when no split piece contains the point', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    // Simulate the host wall having vanished entirely from the next generation,
    // with an unrelated wall reusing a similar id prefix.
    const next = [wall('a-split-unrelated', [1000, 1000], [1100, 1000])];

    const opening = rehostWallOpening(door(), previous, next);
    expect(opening).toEqual(door());
  });

  it('works the same way for a window as for a door', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    const next = splitWallAtPoint(previous, 'a', { x: 100, y: 0 });

    const opening = rehostWallOpening(win({ position: { x: 150, y: 0 } }), previous, next);
    expect(opening.wallId).not.toBe('a');
    expect(opening.width).toBe(900);
    expect(opening.height).toBe(1200);
  });

  it('does not re-host onto a parallel wall that does not actually contain the point', () => {
    const previous = [wall('a', [0, 0], [200, 0])];
    // A same-direction wall far away, sharing no id relationship with 'a'.
    const next = [wall('unrelated', [0, 500], [200, 500])];

    const opening = rehostWallOpening(door(), previous, next);
    expect(opening.wallId).toBe('a'); // unchanged: no candidate matched
  });
});
