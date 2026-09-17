import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { decodeSegmentation, unletterboxSegmentationVector } from '../local-ml-seg';
import type { Letterbox } from '../local-ml';
import type { SegmentationVector } from '../geometry-provider';

// Day 4 of docs/corbel-ship-segmentation-plan.md. These are the two
// pure, DOM-free seams in local-ml-seg.ts (sigmoid+threshold decode, and
// the inverse-letterbox coordinate transform) -- the orchestrating
// infer() path (canvas, fetch, a real ONNX session) has no Node-safe
// test seam, same limitation local-ml.ts's detectLocalMl already has;
// local-ml.test.ts only tests decodeDetections for the same reason.

function logit(p: number): number {
  return Math.log(p / (1 - p));
}

test('decodeSegmentation: thresholds each channel independently via sigmoid', () => {
  // A 1x1 "image" (H=1, W=1) with wall=high, door=low, window=exactly at threshold.
  const dims = [1, 3, 1, 1];
  const data = Float32Array.from([logit(0.9), logit(0.1), logit(0.5)]);
  const { wallMask, doorMask, windowMask } = decodeSegmentation({ dims, data }, 0.5);

  assert.equal(wallMask[0], 1, 'high-probability wall pixel should be foreground');
  assert.equal(doorMask[0], 0, 'low-probability door pixel should be background');
  assert.equal(windowMask[0], 0, 'exactly-at-threshold pixel should not pass a strict ">" threshold');
});

test('decodeSegmentation: rejects an output shape that is not [1,3,H,W]', () => {
  assert.throws(() => decodeSegmentation({ dims: [1, 7, 8400], data: [] }), /Unsupported segmentation output/);
});

test('decodeSegmentation: rejects data whose length does not match dims', () => {
  assert.throws(
    () => decodeSegmentation({ dims: [1, 3, 2, 2], data: new Float32Array(5) }),
    /does not match its declared dims/
  );
});

test('unletterboxSegmentationVector: maps padded-space points back to original-image space', () => {
  // A 1280x640 original image, scaled to fit 640x640 (scale=0.5), so it
  // becomes 640x320 and gets centered with 160px of vertical padding.
  const letterbox: Letterbox = { scaleX: 0.5, scaleY: 0.5, padX: 0, padY: 160, width: 1280, height: 640 };
  const vector: SegmentationVector = {
    imageWidth: 640,
    imageHeight: 640,
    walls: [{ points: [[100, 160], [300, 160]], thicknessPx: 10 }],
    doors: [{ cls: 'door', centroid: [200, 160], bboxPx: [190, 150, 210, 170], hostWallIndex: null }],
    windows: [],
  };

  const result = unletterboxSegmentationVector(vector, letterbox);

  assert.equal(result.imageWidth, 1280);
  assert.equal(result.imageHeight, 640);
  assert.deepEqual(result.walls[0].points, [[200, 0], [600, 0]]);
  assert.equal(result.walls[0].thicknessPx, 20, 'thickness should be scaled back up by the inverse letterbox scale');
  assert.deepEqual(result.doors[0].centroid, [400, 0]);
  assert.deepEqual(result.doors[0].bboxPx, [380, -20, 420, 20]);
});
