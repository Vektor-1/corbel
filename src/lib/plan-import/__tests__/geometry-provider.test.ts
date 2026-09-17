import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'vitest';

import { buildDraftFloorPlan } from '@/lib/services/importPipeline';
import { liftFloorPlan } from '@/lib/refinement/lift';
import { refineWalls, reattachOpenings } from '../refine';
import { segmentationVectorToGeometry, type SegmentationVector } from '../geometry-provider';
import type { RawBox } from '../local-ml';

// Day 6 of docs/corbel-custom-geometry-model-plan.md: proves the
// GeometryProvider boundary works -- legacy YOLO boxes and the experimental
// segmentation vectorizer both produce a RawWall[]/RawOpening[] geometry
// that buildDraftFloorPlan()/liftFloorPlan() accept identically, with no
// changes to either downstream function. This is a contract-equivalence
// test, not a numeric-equivalence one -- the two fixtures describe
// different scenes, so the point is that both paths produce a structurally
// valid plan, not that they produce the same plan.

const PIXELS_PER_METRE = 100;

// A small, hand-authored RawBox[] -- what P2 (YOLOv8) would hand P3
// (refinement) for a simple 4m x 3m room with one door and one window,
// exercising the exact refineWalls/reattachOpenings code path
// yoloBoxProvider.infer() calls internally.
const BOXES: RawBox[] = [
  { cls: 'wall', confidence: 0.9, x0: 40, y0: 30, x1: 440, y1: 50 },
  { cls: 'wall', confidence: 0.85, x0: 420, y0: 40, x1: 440, y1: 340 },
  { cls: 'wall', confidence: 0.88, x0: 40, y0: 330, x1: 440, y1: 350 },
  { cls: 'wall', confidence: 0.82, x0: 40, y0: 40, x1: 60, y1: 340 },
  { cls: 'door', confidence: 0.75, x0: 200, y0: 330, x1: 280, y1: 350 },
  { cls: 'window', confidence: 0.7, x0: 420, y0: 150, x1: 440, y1: 250 },
];

// Real subset of G0's actual predicted-and-vectorized output on a CubiCasa5k
// validation image (ml/evaluate_vectorizer.py's fixture-export path,
// docs/corbel-custom-geometry-model-plan.md's Day 5 result) -- not
// hand-authored, so this test also catches shape mismatches between what
// the Python vectorizer actually emits and what this TS conversion expects.
const segFixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/seg-vectorizer-sample.json'), 'utf-8')
) as {
  walls: { points: [number, number][]; thicknessPx: number }[];
  doors: { cls: 'door'; centroid: [number, number]; bboxPx: [number, number, number, number]; hostWallIndex: number | null }[];
  windows: { cls: 'window'; centroid: [number, number]; bboxPx: [number, number, number, number]; hostWallIndex: number | null }[];
  imageWidth: number;
  imageHeight: number;
};
const SEG_VECTOR: SegmentationVector = segFixture;

test('segmentationVectorToGeometry produces the same RawWall/RawOpening shape refineWalls/reattachOpenings do', () => {
  const { walls, openings } = segmentationVectorToGeometry(SEG_VECTOR, PIXELS_PER_METRE);

  assert.ok(walls.length > 0, 'fixture should yield at least one wall');
  assert.ok(openings.length > 0, 'fixture should yield at least one opening');

  for (const w of walls) {
    assert.ok(Number.isFinite(w.startX) && Number.isFinite(w.startY));
    assert.ok(Number.isFinite(w.endX) && Number.isFinite(w.endY));
    assert.ok(w.thicknessMm >= 75, 'thickness should respect the same >=75mm floor refineWalls uses');
    assert.equal(w.role, 'partition');
    assert.ok(w.confidence >= 0 && w.confidence <= 1);
  }
  for (const o of openings) {
    assert.ok(walls.some((w) => w.id === o.wallId), `opening ${o.id} should reference a wall present in the output`);
    assert.ok(o.offsetRatio >= 0 && o.offsetRatio <= 1);
    assert.ok(o.widthMm > 0);
  }
});

test('segmentationVectorToGeometry does not split a collinear polyline into short walls', () => {
  const vector: SegmentationVector = {
    imageWidth: 120,
    imageHeight: 40,
    walls: [{ points: [[10, 20], [55, 20.5], [110, 20]], thicknessPx: 10 }],
    doors: [],
    windows: [],
  };

  const { walls } = segmentationVectorToGeometry(vector, PIXELS_PER_METRE);
  assert.equal(walls.length, 1, 'a nearly straight polyline should yield one editor wall');
  assert.ok(Math.hypot(walls[0].endX - walls[0].startX, walls[0].endY - walls[0].startY) >= 99);
});

test('both the box path and the segmentation path feed buildDraftFloorPlan() into an equally valid Draft.FloorPlan', () => {
  const boxWalls = refineWalls(BOXES, PIXELS_PER_METRE);
  const boxOpenings = reattachOpenings(BOXES, boxWalls, PIXELS_PER_METRE);
  const boxDraft = buildDraftFloorPlan({
    id: 'draft-yolo-box', walls: boxWalls, openings: boxOpenings, pixelsPerMetre: PIXELS_PER_METRE,
  });

  const { walls: segWalls, openings: segOpenings } = segmentationVectorToGeometry(SEG_VECTOR, PIXELS_PER_METRE);
  const segDraft = buildDraftFloorPlan({
    id: 'draft-custom-seg', walls: segWalls, openings: segOpenings, pixelsPerMetre: PIXELS_PER_METRE,
  });

  for (const draft of [boxDraft, segDraft]) {
    assert.ok(draft.walls.length > 0, `${draft.id} should have walls`);
    for (const w of draft.walls) {
      assert.ok(Number.isFinite(w.start.x) && Number.isFinite(w.start.y));
      assert.ok(Number.isFinite(w.end.x) && Number.isFinite(w.end.y));
      assert.ok(w.thickness > 0);
      assert.ok(w.confidence >= 0 && w.confidence <= 1);
    }
    for (const o of draft.openings) {
      assert.ok(o.width > 0);
      assert.ok(o.confidence >= 0 && o.confidence <= 1);
    }
    assert.ok(draft.overallConfidence >= 0 && draft.overallConfidence <= 1);
  }
});

test('both the box path and the segmentation path lift to an equally valid Canonical.Floor', () => {
  const boxWalls = refineWalls(BOXES, PIXELS_PER_METRE);
  const boxOpenings = reattachOpenings(BOXES, boxWalls, PIXELS_PER_METRE);
  const boxDraft = buildDraftFloorPlan({
    id: 'draft-yolo-box', walls: boxWalls, openings: boxOpenings, pixelsPerMetre: PIXELS_PER_METRE,
  });
  const boxCanonical = liftFloorPlan(boxDraft);

  const { walls: segWalls, openings: segOpenings } = segmentationVectorToGeometry(SEG_VECTOR, PIXELS_PER_METRE);
  const segDraft = buildDraftFloorPlan({
    id: 'draft-custom-seg', walls: segWalls, openings: segOpenings, pixelsPerMetre: PIXELS_PER_METRE,
  });
  const segCanonical = liftFloorPlan(segDraft);

  // The box fixture is a hand-authored closed rectangle -- it should close
  // into exactly one room, same as importPipeline.test.ts's equivalent case.
  assert.equal(boxCanonical.rooms.length, 1, 'the closed box fixture should form one room');
  assert.ok(boxCanonical.openings.length > 0);

  // The segmentation fixture is a real but trimmed (7-of-185 walls) subset
  // of an actual vectorizer run -- it is not a closed loop, so 0 rooms is
  // the correct, honest outcome. The contract-equivalence claim under test
  // is that liftFloorPlan() runs to completion and returns well-formed
  // walls/openings either way, not that an intentionally partial wall graph
  // closes into a room.
  for (const canonical of [boxCanonical, segCanonical]) {
    assert.ok(canonical.walls.length > 0);
    for (const w of canonical.walls) assert.ok(w.confidence >= 0 && w.confidence <= 1);
    for (const o of canonical.openings) {
      assert.ok(o.confidence >= 0 && o.confidence <= 1);
      const hostWall = canonical.walls.find((w: { id: string }) => w.id === o.hostWallId);
      assert.ok(hostWall, `opening ${o.id} should reference an existing wall`);
    }
    for (const r of canonical.rooms) assert.ok(r.confidence >= 0 && r.confidence <= 1);
  }
});
