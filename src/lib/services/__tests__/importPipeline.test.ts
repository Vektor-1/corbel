import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { buildDraftFloorPlan, applyDraftOverrides, pxToMm, WALL_CONFIDENCE_THRESHOLD, OPENING_CONFIDENCE_THRESHOLD } from '../importPipeline';
import { liftFloorPlan } from '@/lib/refinement/lift';
import type { RawWall, RawOpening } from '@/lib/plan-import/pipeline';

// Test fixture: a synthetic CubiCasa5K-style plan — a single 4m × 3m room
// (monochrome line drawing, 480×640px canvas, 100px/m scale) with one door
// and one window, standing in for what P2 (YOLOv8) + P3 (refinement) would
// hand off after detecting geometry on a real CubiCasa5K photo. Confidences
// are deliberately mixed so both highlight thresholds get exercised:
// wall-right and wall-left are below the 0.7 wall threshold, and the window
// is below the 0.6 opening threshold.
const WALLS: RawWall[] = [
  { id: 'wall-top', startX: 40, startY: 40, endX: 440, endY: 40, thicknessMm: 200, role: 'loadBearing', confidence: 0.85 },
  { id: 'wall-right', startX: 440, startY: 40, endX: 440, endY: 340, thicknessMm: 200, role: 'loadBearing', confidence: 0.62 },
  { id: 'wall-bottom', startX: 440, startY: 340, endX: 40, endY: 340, thicknessMm: 200, role: 'loadBearing', confidence: 0.78 },
  { id: 'wall-left', startX: 40, startY: 340, endX: 40, endY: 40, thicknessMm: 200, role: 'loadBearing', confidence: 0.55 },
];

const OPENINGS: RawOpening[] = [
  { id: 'door-0', kind: 'door', wallId: 'wall-top', offsetRatio: 0.5, widthMm: 900, confidence: 0.9 },
  { id: 'window-0', kind: 'window', wallId: 'wall-right', offsetRatio: 0.5, widthMm: 1200, confidence: 0.5 },
];

const LABELS = [{ id: 'label-0', text: 'Bedroom', x: 240, y: 190, role: 'room-name' as const }];

test('pxToMm converts pixel coordinates using the calibrated scale', () => {
  assert.equal(pxToMm(100, 100), 1000); // 100px at 100px/m = 1m = 1000mm
  assert.equal(pxToMm(400, 100), 4000);
});

test('buildDraftFloorPlan assembles walls, openings, and labels with correct confidence stats', () => {
  const draft = buildDraftFloorPlan({
    id: 'draft-test',
    walls: WALLS,
    openings: OPENINGS,
    labels: LABELS,
    pixelsPerMetre: 100,
    scaleConfidence: 0.8,
    scaleSource: 'dimension-ocr',
  });

  assert.equal(draft.walls.length, 4, 'all four walls should be present');
  assert.equal(draft.openings.length, 2, 'both openings should be present');
  assert.equal(draft.labels.length, 1, 'room-name label should be present');

  // 4m wall at 100px/m -> 400px -> 4000mm
  const topWall = draft.walls.find((w) => w.id === 'wall-top')!;
  assert.equal(Math.round(topWall.end.x - topWall.start.x), 4000);

  // Confidence is in the expected 0-1 range and overall is the mean of wall+opening confidences.
  for (const w of draft.walls) assert.ok(w.confidence >= 0 && w.confidence <= 1);
  const expectedMean =
    (0.85 + 0.62 + 0.78 + 0.55 + 0.9 + 0.5) / 6;
  assert.ok(Math.abs(draft.overallConfidence - Math.round(expectedMean * 100) / 100) < 0.01);

  // Low-confidence highlighting: two walls below threshold, one opening below threshold.
  const lowWalls = draft.walls.filter((w) => w.confidence < WALL_CONFIDENCE_THRESHOLD);
  const lowOpenings = draft.openings.filter((o) => o.confidence < OPENING_CONFIDENCE_THRESHOLD);
  assert.equal(lowWalls.length, 2);
  assert.equal(lowOpenings.length, 1);

  const warningIds = draft.warnings.map((w) => w.elementIds[0]);
  assert.ok(warningIds.includes('wall-right'));
  assert.ok(warningIds.includes('wall-left'));
  assert.ok(warningIds.includes('window-0'));
});

test('applyDraftOverrides folds user corrections into effective wall/opening values', () => {
  const draft = buildDraftFloorPlan({ id: 'draft-test', walls: WALLS, openings: OPENINGS, pixelsPerMetre: 100 });
  const overridden = {
    ...draft,
    walls: draft.walls.map((w) => (w.id === 'wall-left' ? { ...w, overrideThickness: 250, overrideConfidence: 1.0 } : w)),
    openings: draft.openings.map((o) => (o.id === 'window-0' ? { ...o, overrideWidth: 900, overrideHeight: 1500 } : o)),
  };

  const result = applyDraftOverrides(overridden);
  const wall = result.walls.find((w) => w.id === 'wall-left')!;
  const opening = result.openings.find((o) => o.id === 'window-0')!;
  assert.equal(wall.thickness, 250);
  assert.equal(wall.confidence, 1.0);
  assert.equal(opening.width, 900);
  assert.equal(opening.height, 1500);
});

test('liftFloorPlan produces a canonical Floor with a closed room and attached openings from the draft', () => {
  const draft = buildDraftFloorPlan({
    id: 'draft-test',
    walls: WALLS,
    openings: OPENINGS,
    labels: LABELS,
    pixelsPerMetre: 100,
    scaleConfidence: 0.8,
  });

  const canonical = liftFloorPlan(draft);

  assert.equal(canonical.walls.length, 4, 'all stages should complete and preserve four walls');
  assert.equal(canonical.rooms.length, 1, 'the four walls should close into exactly one room');
  assert.equal(canonical.openings.length, 2, 'both openings should attach to a host wall');

  const room = canonical.rooms[0];
  // 4m x 3m room = 12 m^2 = 12,000,000 mm^2, well within a reasonable tolerance
  // for axis-snapping/junction-closing adjustments.
  assert.ok(room.area > 10e6 && room.area < 14e6, `room area ${room.area} should be roughly 12 m^2`);

  for (const opening of canonical.openings) {
    const hostWall = canonical.walls.find((w: { id: string }) => w.id === opening.hostWallId);
    assert.ok(hostWall, `opening ${opening.id} should reference an existing wall`);
  }

  // Confidence scores must stay within [0, 1] end to end.
  for (const w of canonical.walls) assert.ok(w.confidence >= 0 && w.confidence <= 1);
  for (const o of canonical.openings) assert.ok(o.confidence >= 0 && o.confidence <= 1);
  for (const r of canonical.rooms) assert.ok(r.confidence >= 0 && r.confidence <= 1);
});
