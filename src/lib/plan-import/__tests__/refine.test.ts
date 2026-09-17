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

test('calibrates measured wall thickness and opening width at non-default scales', () => {
  const boxes = [box('wall', 0, 0, 800, 40), box('door', 300, 0, 480, 40)];
  const walls = refineWalls(boxes, 200);
  const openings = reattachOpenings(boxes, walls, 200);
  assert.equal(walls[0].thicknessMm, 200);
  assert.equal(openings[0].widthMm, 900);
  assert.equal(openings[0].offsetRatio, 390 / 800);

  // Resizing the source image must preserve physical measurements.
  const resized = boxes.map(b => ({ ...b, x0: b.x0 / 2, y0: b.y0 / 2, x1: b.x1 / 2, y1: b.y1 / 2 }));
  const resizedWalls = refineWalls(resized, 100);
  assert.equal(resizedWalls[0].thicknessMm, walls[0].thicknessMm);
  assert.equal(reattachOpenings(resized, resizedWalls, 100)[0].widthMm, openings[0].widthMm);
});

test('does not attach remote opening false positives to a wall', () => {
  const walls = refineWalls([box('wall', 0, 0, 400, 20)]);
  assert.equal(reattachOpenings([box('door', 100, 200, 190, 290)], walls).length, 0);
  assert.equal(reattachOpenings([box('window', 500, 0, 590, 20)], walls).length, 0);
});

test('measures opening width along its host wall, excluding symbol depth', () => {
  const walls = refineWalls([box('wall', 90, 0, 110, 400)]);
  const openings = reattachOpenings([box('door', 90, 100, 210, 190)], walls);
  assert.equal(openings.length, 1);
  assert.equal(openings[0].widthMm, 900);
});

test('drops invalid wall and opening boxes before refining geometry', () => {
  assert.equal(refineWalls([box('wall', 0, 0, 0, 100), box('wall', NaN, 0, 100, 10)]).length, 0);
  const walls = refineWalls([box('wall', 0, 0, 400, 20)]);
  assert.equal(reattachOpenings([box('door', 100, 0, 90, 20)], walls).length, 0);
});
