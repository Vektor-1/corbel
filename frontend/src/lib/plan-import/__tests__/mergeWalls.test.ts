import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WALL_MERGE_OPTIONS,
  mergeCollinearWalls,
  pointAtRatio,
  ratioAlongWall,
} from '../mergeWalls';
import type { DetectedWall } from '../types';

const wall = (
  id: string,
  start: [number, number],
  end: [number, number],
  overrides: Partial<DetectedWall> = {}
): DetectedWall => ({
  id,
  kind: 'wall',
  confidence: 0.9,
  start: { x: start[0], y: start[1] },
  end: { x: end[0], y: end[1] },
  thicknessMm: 225,
  ...overrides,
});

/** Rotates a length-`len` segment starting at `from` by `deg`. */
const atAngle = (id: string, from: [number, number], len: number, deg: number): DetectedWall => {
  const rad = (deg * Math.PI) / 180;
  return wall(id, from, [from[0] + len * Math.cos(rad), from[1] + len * Math.sin(rad)]);
};

const lengthOf = (w: DetectedWall) => Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);

describe('mergeCollinearWalls', () => {
  it('reconnects a straight wall split into fragments', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('b', [52, 0], [100, 0]),
    ]);

    expect(result.walls).toHaveLength(1);
    expect(result.mergedCount).toBe(1);
    expect(lengthOf(result.walls[0])).toBeCloseTo(100, 5);
  });

  it('collapses a long chain of junction stubs into one wall', () => {
    // The shape the hatch-texture bug produces: many short pieces along one line.
    const fragments = Array.from({ length: 12 }, (_, index) =>
      wall(`f${index}`, [index * 10, 0], [index * 10 + 9, 0])
    );

    const result = mergeCollinearWalls(fragments);

    expect(result.walls).toHaveLength(1);
    expect(lengthOf(result.walls[0])).toBeCloseTo(119, 5);
  });

  it('does not merge across a corner', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('b', [50, 0], [50, 50]),
    ]);

    expect(result.walls).toHaveLength(2);
    expect(result.mergedCount).toBe(0);
  });

  it('never merges the two parallel walls of a corridor', () => {
    // Perfectly parallel, so any angle tolerance passes -- only the offset guard
    // stops this, and merging them would destroy the corridor.
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('b', [0, 10], [50, 10]),
    ]);

    expect(result.walls).toHaveLength(2);
  });

  it('does not bridge a gap wider than the threshold', () => {
    // A door-sized hole must survive reconstruction rather than be paved over.
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('b', [80, 0], [130, 0]),
    ]);

    expect(result.walls).toHaveLength(2);
  });

  it('widens the angle tolerance for short fragments but not long ones', () => {
    const short = mergeCollinearWalls([
      atAngle('a', [0, 0], 5, 0),
      atAngle('b', [5, 0], 5, 15),
    ]);
    const long = mergeCollinearWalls([
      atAngle('a', [0, 0], 100, 0),
      atAngle('b', [100, 0], 100, 15),
    ]);

    // 15 degrees is noise on a 5px fragment and a real corner on a 100px wall.
    expect(short.walls).toHaveLength(1);
    expect(long.walls).toHaveLength(2);
  });

  it('is idempotent', () => {
    const input = [wall('a', [0, 0], [50, 0]), wall('b', [52, 0], [100, 0])];

    const once = mergeCollinearWalls(input);
    const twice = mergeCollinearWalls(once.walls);

    expect(twice.mergedCount).toBe(0);
    expect(twice.walls).toEqual(once.walls);
  });

  it('is independent of input order', () => {
    const fragments = [
      wall('a', [0, 0], [30, 0]),
      wall('b', [31, 0], [60, 0]),
      wall('c', [61, 0], [90, 0]),
    ];

    const forward = mergeCollinearWalls(fragments);
    const reversed = mergeCollinearWalls([...fragments].reverse());

    expect(reversed.walls).toEqual(forward.walls);
  });

  it('remaps every absorbed wall id onto the surviving wall', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('b', [52, 0], [100, 0]),
    ]);

    const survivor = result.walls[0].id;
    expect(result.remap.get('a')).toBe(survivor);
    expect(result.remap.get('b')).toBe(survivor);
  });

  it('keeps unmerged walls mapped to themselves', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0]),
      wall('corner', [50, 0], [50, 50]),
    ]);

    expect(result.remap.get('a')).toBe('a');
    expect(result.remap.get('corner')).toBe('corner');
  });

  it('refuses to merge walls of clearly different thickness', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0], { thicknessMm: 225 }),
      wall('b', [52, 0], [100, 0], { thicknessMm: 100 }),
    ]);

    expect(result.walls).toHaveLength(2);
  });

  it('length-weights merged thickness and keeps the lowest confidence', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [90, 0], { thicknessMm: 200, confidence: 0.9 }),
      wall('b', [90, 0], [100, 0], { thicknessMm: 300, confidence: 0.4 }),
    ]);

    expect(result.walls).toHaveLength(1);
    expect(result.walls[0].thicknessMm).toBeCloseTo(210, 5);
    expect(result.walls[0].confidence).toBe(0.4);
  });

  it('promotes the merged wall to load-bearing if either contributor was', () => {
    const result = mergeCollinearWalls([
      wall('a', [0, 0], [50, 0], { role: 'partition' }),
      wall('b', [52, 0], [100, 0], { role: 'loadBearing' }),
    ]);

    expect(result.walls[0].role).toBe('loadBearing');
  });

  it('handles empty and single-wall input', () => {
    expect(mergeCollinearWalls([]).walls).toEqual([]);
    const single = mergeCollinearWalls([wall('a', [0, 0], [50, 0])]);
    expect(single.walls).toHaveLength(1);
    expect(single.mergedCount).toBe(0);
  });

  it('respects overridden options', () => {
    const input = [wall('a', [0, 0], [50, 0]), wall('b', [80, 0], [130, 0])];

    expect(mergeCollinearWalls(input).walls).toHaveLength(2);
    expect(mergeCollinearWalls(input, { maxGapPx: 40 }).walls).toHaveLength(1);
  });

  it('exposes a default gap smaller than a typical doorway', () => {
    // Guards the intent: the default must never be wide enough to close a door.
    expect(DEFAULT_WALL_MERGE_OPTIONS.maxGapPx).toBeLessThan(20);
  });
});

// A parameter sweep (scripts/benchmark-wall-merge.ts) showed these are the cases
// that break first when tolerances are loosened for better recall -- raising
// maxOffsetPx to 5 collapses a 5px corridor. They are pinned so a future tuning
// pass cannot trade them away silently.
describe('mergeCollinearWalls safety guards', () => {
  const corridor = (separation: number) => [
    wall('a', [0, 0], [200, 0]),
    wall('b', [0, separation], [200, separation]),
  ];
  const corner = (arm: number) => [wall('a', [0, 0], [arm, 0]), wall('b', [arm, 0], [arm, arm])];

  it.each([5, 6, 8, 10, 20])('keeps both sides of a %ipx corridor', (separation) => {
    expect(mergeCollinearWalls(corridor(separation)).walls).toHaveLength(2);
  });

  it.each([3, 5, 10, 50, 200])('keeps a right-angle corner with %ipx arms', (arm) => {
    expect(mergeCollinearWalls(corner(arm)).walls).toHaveLength(2);
  });

  it('stays fast on a heavily fragmented plan', () => {
    // 400 fragments is the scale a hatched CAD plan actually produces. An earlier
    // implementation rescanned every pair after each merge and did not finish.
    const fragments = Array.from({ length: 400 }, (_, index) =>
      wall(`w${String(index).padStart(3, '0')}`, [index * 5, 0], [index * 5 + 4, 0])
    );

    const startedAt = Date.now();
    const result = mergeCollinearWalls(fragments);

    expect(result.walls).toHaveLength(1);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('never drops or duplicates a wall id in the remap', () => {
    const fragments = [
      wall('a', [0, 0], [50, 0]),
      wall('b', [52, 0], [100, 0]),
      wall('c', [100, 0], [100, 80]),
    ];

    const result = mergeCollinearWalls(fragments);
    const survivors = new Set(result.walls.map((w) => w.id));

    expect([...result.remap.keys()].sort()).toEqual(['a', 'b', 'c']);
    for (const target of result.remap.values()) expect(survivors.has(target)).toBe(true);
  });
});

describe('ratioAlongWall / pointAtRatio', () => {
  it('round-trips a point through its ratio', () => {
    const w = wall('a', [10, 10], [110, 10]);
    expect(ratioAlongWall(w, pointAtRatio(w, 0.25))).toBeCloseTo(0.25, 6);
  });

  it('clamps points that fall beyond either end', () => {
    const w = wall('a', [0, 0], [100, 0]);
    expect(ratioAlongWall(w, { x: -50, y: 0 })).toBe(0);
    expect(ratioAlongWall(w, { x: 500, y: 0 })).toBe(1);
  });

  it('projects an off-axis point onto the wall', () => {
    const w = wall('a', [0, 0], [100, 0]);
    expect(ratioAlongWall(w, { x: 40, y: 25 })).toBeCloseTo(0.4, 6);
  });

  it('carries an opening from a fragment onto the wall that replaced it', () => {
    const fragment = wall('b', [50, 0], [100, 0]);
    const openingPoint = pointAtRatio(fragment, 0.5); // 75px along the full wall
    const merged = mergeCollinearWalls([wall('a', [0, 0], [50, 0]), fragment]).walls[0];

    expect(ratioAlongWall(merged, openingPoint)).toBeCloseTo(0.75, 5);
  });
});
