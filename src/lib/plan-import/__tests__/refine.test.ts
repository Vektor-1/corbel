import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { refineWalls, reattachOpenings } from '../refine';
import type { RawBox } from '../local-ml';

const box = (cls: RawBox['cls'], x0: number, y0: number, x1: number, y1: number, confidence = 0.9): RawBox => ({
  cls, x0, y0, x1, y1, confidence,
});

test('closes a near-touching corner between two wall boxes', () => {
  // Horizontal wall ending near (100, 10); vertical wall starting near (102, 12).
  const boxes = [
    box('wall', 0, 5, 100, 15),
    box('wall', 98, 10, 108, 200),
  ];
  const walls = refineWalls(boxes);
  assert.equal(walls.length, 2);

  const endpoints = walls.flatMap((w) => [
    { x: w.startX, y: w.startY },
    { x: w.endX, y: w.endY },
  ]);
  const nearCorner = endpoints.filter((p) => Math.hypot(p.x - 103, p.y - 10) < 20);
  assert.ok(nearCorner.length >= 2, 'expected both walls to share a closed corner');
  const [a, b] = nearCorner;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 1, 'corner endpoints should coincide after closing');
});

test('snaps a slightly angled wall box to the horizontal axis', () => {
  // ~3 degree tilt: rise of 5px over run of 100px.
  const boxes = [box('wall', 0, 0, 100, 5)];
  const walls = refineWalls(boxes);
  assert.equal(walls.length, 1);
  assert.equal(walls[0].startY, walls[0].endY, 'snapped wall should be perfectly horizontal');
});

test('collapses duplicate overlapping wall boxes into one', () => {
  const boxes = [
    box('wall', 0, 0, 100, 10, 0.7),
    box('wall', 2, 2, 98, 12, 0.9),
  ];
  const walls = refineWalls(boxes);
  assert.equal(walls.length, 1);
});

test('reattaches an opening to the nearest refined wall', () => {
  const boxes = [
    box('wall', 0, 0, 200, 10),
    box('door', 90, 0, 110, 10),
  ];
  const walls = refineWalls(boxes);
  const openings = reattachOpenings(boxes, walls);
  assert.equal(openings.length, 1);
  assert.equal(openings[0].kind, 'door');
  assert.equal(openings[0].wallId, walls[0].id);
  assert.ok(openings[0].offsetRatio > 0.3 && openings[0].offsetRatio < 0.7);
});
