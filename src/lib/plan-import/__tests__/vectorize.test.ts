import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import {
  attachOpeningsToWalls,
  cleanBinaryMask,
  douglasPeucker,
  traceOpenings,
  traceWalls,
} from '../vectorize';
import type { SegWallSegment } from '../geometry-provider';

// Days 2-3 of docs/corbel-ship-segmentation-plan.md. Covers exactly the
// cases the original plan's own Verification section scoped for the
// Python vectorizer (ml/vectorize.py) and never expanded beyond:
// horizontal/vertical/thin wall, one L-junction, plus opening extraction
// and host-wall attachment. Parallel-wall-merging and cross-junction
// cases stay explicitly out of scope here too, same reasoning.

function makeRectMask(width: number, height: number, x0: number, y0: number, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      mask[y * width + x] = 1;
    }
  }
  return mask;
}

function polylineExtent(points: [number, number][]): { dx: number; dy: number } {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return { dx: Math.max(...xs) - Math.min(...xs), dy: Math.max(...ys) - Math.min(...ys) };
}

test('traceWalls: horizontal wall produces a roughly horizontal, correctly-thick segment', () => {
  const width = 100;
  const height = 40;
  const mask = makeRectMask(width, height, 10, 15, 80, 10);
  const segments = traceWalls(mask, width, height);

  assert.ok(segments.length >= 1, 'expected at least one wall segment');
  const combinedDx = segments.reduce((sum, s) => sum + polylineExtent(s.points).dx, 0);
  const combinedDy = segments.reduce((sum, s) => sum + polylineExtent(s.points).dy, 0);
  assert.ok(combinedDx > combinedDy, `expected horizontal extent to dominate (dx=${combinedDx}, dy=${combinedDy})`);
  for (const s of segments) {
    assert.ok(s.thicknessPx > 2 && s.thicknessPx < 20, `thickness ${s.thicknessPx} out of expected range for a 10px-thick wall`);
  }
});

test('traceWalls: vertical wall produces a roughly vertical segment', () => {
  const width = 40;
  const height = 100;
  const mask = makeRectMask(width, height, 15, 10, 10, 80);
  const segments = traceWalls(mask, width, height);

  assert.ok(segments.length >= 1, 'expected at least one wall segment');
  const combinedDx = segments.reduce((sum, s) => sum + polylineExtent(s.points).dx, 0);
  const combinedDy = segments.reduce((sum, s) => sum + polylineExtent(s.points).dy, 0);
  assert.ok(combinedDy > combinedDx, `expected vertical extent to dominate (dx=${combinedDx}, dy=${combinedDy})`);
});

test('traceWalls: thin wall does not crash and produces finite, valid output', () => {
  const width = 100;
  const height = 20;
  const mask = makeRectMask(width, height, 10, 9, 80, 2);
  const segments = traceWalls(mask, width, height);

  for (const s of segments) {
    assert.ok(s.points.length >= 2, 'every returned segment must have at least 2 points');
    for (const [x, y] of s.points) {
      assert.ok(Number.isFinite(x) && Number.isFinite(y), 'polyline points must be finite');
    }
    assert.ok(Number.isFinite(s.thicknessPx) && s.thicknessPx >= 0, 'thickness must be a finite, non-negative number');
  }
});

test('traceWalls: L-junction traces both arms without throwing', () => {
  const width = 100;
  const height = 100;
  const mask = new Uint8Array(width * height);
  const horizontalArm = makeRectMask(width, height, 10, 10, 70, 10);
  const verticalArm = makeRectMask(width, height, 10, 10, 10, 70);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = horizontalArm[i] || verticalArm[i] ? 1 : 0;
  }

  const segments = traceWalls(mask, width, height);
  assert.ok(segments.length >= 1, 'expected at least one wall segment covering the L shape');

  let totalArcLength = 0;
  for (const s of segments) {
    for (let i = 1; i < s.points.length; i++) {
      totalArcLength += Math.hypot(s.points[i][0] - s.points[i - 1][0], s.points[i][1] - s.points[i - 1][1]);
    }
  }
  // The L's two arms are each ~70px along their long axis; a degenerate
  // trace (e.g. only the corner) would be far shorter than this.
  assert.ok(totalArcLength > 60, `expected combined arc length to cover most of the L shape, got ${totalArcLength}`);
});

test('traceWalls: keeps a straight run continuous through a T-junction', () => {
  const width = 120;
  const height = 100;
  const mask = new Uint8Array(width * height);
  const horizontalRun = makeRectMask(width, height, 10, 45, 100, 10);
  const verticalBranch = makeRectMask(width, height, 55, 45, 10, 45);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = horizontalRun[i] || verticalBranch[i] ? 1 : 0;
  }

  const segments = traceWalls(mask, width, height);
  const continuousHorizontalRuns = segments.filter(({ points }) => {
    const { dx, dy } = polylineExtent(points);
    return dx >= 80 && dy <= 3;
  });

  assert.equal(
    continuousHorizontalRuns.length,
    1,
    `the horizontal wall should remain one continuous segment across its T-junction; got ${JSON.stringify(segments)}`
  );
});

test('traceWalls: does not merge distinct parallel walls', () => {
  const width = 120;
  const height = 80;
  const mask = new Uint8Array(width * height);
  const upper = makeRectMask(width, height, 10, 15, 100, 8);
  const lower = makeRectMask(width, height, 10, 45, 100, 8);
  for (let i = 0; i < mask.length; i++) {
    mask[i] = upper[i] || lower[i] ? 1 : 0;
  }

  const segments = traceWalls(mask, width, height);
  const longHorizontalRuns = segments.filter(({ points }) => {
    const { dx, dy } = polylineExtent(points);
    return dx >= 80 && dy <= 3;
  });
  assert.equal(longHorizontalRuns.length, 2, 'separate, parallel walls must remain separate');
});

test('cleanBinaryMask: drops components below minArea, keeps components at/above it', () => {
  const width = 20;
  const height = 20;
  const mask = new Uint8Array(width * height);
  // 6x6 = 36px^2 block, above the 25px^2 threshold.
  for (let y = 2; y < 8; y++) {
    for (let x = 2; x < 8; x++) mask[y * width + x] = 1;
  }
  // Lone 1px speck elsewhere, below the threshold.
  const speckIdx = 15 * width + 15;
  mask[speckIdx] = 1;

  const cleaned = cleanBinaryMask(mask, width, height, 25);
  let count = 0;
  for (let i = 0; i < cleaned.length; i++) count += cleaned[i];
  assert.equal(count, 36, 'the 6x6 block should survive intact');
  assert.equal(cleaned[speckIdx], 0, 'the below-threshold speck should be removed');
});

test('traceOpenings: extracts correct centroid and bbox for a single opening', () => {
  const width = 50;
  const height = 50;
  const mask = makeRectMask(width, height, 10, 10, 6, 4); // area 24 >= minArea 9
  const openings = traceOpenings(mask, width, height, 'door');

  assert.equal(openings.length, 1);
  const [opening] = openings;
  assert.equal(opening.cls, 'door');
  assert.equal(opening.hostWallIndex, null);
  assert.deepEqual(opening.bboxPx, [10, 10, 16, 14]);
  const [cx, cy] = opening.centroid;
  assert.ok(Math.abs(cx - 12.5) < 1e-6 && Math.abs(cy - 11.5) < 1e-6, `unexpected centroid [${cx}, ${cy}]`);
});

test('attachOpeningsToWalls: attaches a nearby opening, leaves a far one unattached', () => {
  const walls: SegWallSegment[] = [{ points: [[0, 20], [100, 20]], thicknessPx: 10 }];
  const openings = [
    { cls: 'door' as const, centroid: [50, 22] as [number, number], bboxPx: [45, 18, 55, 26] as [number, number, number, number], hostWallIndex: null },
    { cls: 'window' as const, centroid: [50, 200] as [number, number], bboxPx: [45, 195, 55, 205] as [number, number, number, number], hostWallIndex: null },
  ];

  attachOpeningsToWalls(openings, walls, 40);

  assert.equal(openings[0].hostWallIndex, 0, 'the nearby opening should attach to the wall');
  assert.equal(openings[1].hostWallIndex, null, 'the far opening should remain unattached');
});

test('douglasPeucker: collapses near-collinear points, keeps a real corner', () => {
  const points: [number, number][] = [[0, 0], [10, 0.1], [20, -0.1], [30, 0], [30, 30]];
  const simplified = douglasPeucker(points, 1);
  assert.ok(simplified.length < points.length, 'should simplify the near-straight run');
  assert.deepEqual(simplified[0], [0, 0]);
  assert.deepEqual(simplified[simplified.length - 1], [30, 30]);
});
