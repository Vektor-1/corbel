#!/usr/bin/env node
// Hypothesis: the wall bbox-IoU gap is a label-granularity mismatch, not a
// model-quality problem. Test by splitting each ground-truth wall box at
// every point where another wall's box crosses through its middle (a
// T-junction/crossing), then re-scoring the model's UNCHANGED predictions
// against these segment-level boxes. No retraining, no model change.
import fs from 'node:fs/promises';

const cache = JSON.parse(await fs.readFile(process.argv[2] ?? 'scripts/.bench-cache/raw_val_200.json', 'utf8'));
const CONF = 0.25;
const END_MARGIN = 0.15; // ignore crossings within 15% of either end (real corners, not T-junctions)

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0) + Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}
function nms(boxes, threshold) {
  const kept = [];
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const suppressed = new Array(sorted.length).fill(false);
  for (let i = 0; i < sorted.length; i++) {
    if (suppressed[i]) continue;
    kept.push(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      if (!suppressed[j] && iou(sorted[i], sorted[j]) > threshold) suppressed[j] = true;
    }
  }
  return kept;
}
function orientation(box) {
  return box.x1 - box.x0 >= box.y1 - box.y0 ? 'h' : 'v';
}

// Split `wall` at every point another wall's box crosses its band, away from its own ends.
function splitAtJunctions(wall, allWalls) {
  const orient = orientation(wall);
  const [run0, run1, band0, band1] = orient === 'h' ? [wall.x0, wall.x1, wall.y0, wall.y1] : [wall.y0, wall.y1, wall.x0, wall.x1];
  const runLength = run1 - run0;
  if (runLength < 1) return [wall];
  const cuts = new Set();
  for (const other of allWalls) {
    if (other === wall) continue;
    const otherOrient = orientation(other);
    if (otherOrient === orient) continue; // only perpendicular crossings split a run
    const [oRun0, oRun1, oBand0, oBand1] = otherOrient === 'h' ? [other.x0, other.x1, other.y0, other.y1] : [other.y0, other.y1, other.x0, other.x1];
    // Does `other`'s run-axis extent land inside `wall`'s band (i.e. other touches this wall)?
    const bandHit = Math.min(oRun1, band1) - Math.max(oRun0, band0) > 0;
    if (!bandHit) continue;
    // Where along `wall`'s own run does this crossing sit?
    const crossCenter = (oBand0 + oBand1) / 2;
    const t = (crossCenter - run0) / runLength;
    if (t <= END_MARGIN || t >= 1 - END_MARGIN) continue; // near an end = real corner, not a T-junction
    cuts.add(crossCenter);
  }
  const points = [run0, ...[...cuts].sort((a, b) => a - b), run1];
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (b - a < 2) continue;
    segments.push(orient === 'h'
      ? { cls: wall.cls, x0: a, y0: band0, x1: b, y1: band1 }
      : { cls: wall.cls, y0: a, x0: band0, y1: b, x1: band1 });
  }
  return segments.length ? segments : [wall];
}

function scoreWalls(preds, truth) {
  const matched = new Set();
  let tp = 0;
  for (const candidate of preds) {
    let bestIndex = -1, bestIou = 0;
    truth.forEach((target, index) => {
      if (!matched.has(index)) {
        const value = iou(candidate, target);
        if (value > bestIou) { bestIou = value; bestIndex = index; }
      }
    });
    if (bestIndex >= 0 && bestIou >= 0.5) { matched.add(bestIndex); tp++; }
  }
  return { tp, fp: preds.length - tp, fn: truth.length - tp };
}

let wholeRun = { tp: 0, fp: 0, fn: 0 };
let segmentLevel = { tp: 0, fp: 0, fn: 0 };
let totalSegments = 0, totalWholeRuns = 0;

for (const item of cache.items) {
  const preds = nms(item.candidates.filter((b) => b.cls === 0 && b.confidence >= CONF), 0.45);
  const truthWalls = item.truth.filter((t) => t.cls === 0);
  totalWholeRuns += truthWalls.length;
  const splitTruth = truthWalls.flatMap((w) => splitAtJunctions(w, truthWalls));
  totalSegments += splitTruth.length;

  const a = scoreWalls(preds, truthWalls);
  const b = scoreWalls(preds, splitTruth);
  wholeRun.tp += a.tp; wholeRun.fp += a.fp; wholeRun.fn += a.fn;
  segmentLevel.tp += b.tp; segmentLevel.fp += b.fp; segmentLevel.fn += b.fn;
}

function report(name, { tp, fp, fn }) {
  const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
  const f1 = (2 * precision * recall) / (precision + recall) || 0;
  console.log(`${name}: P=${(precision * 100).toFixed(1)}% R=${(recall * 100).toFixed(1)}% F1=${(f1 * 100).toFixed(1)}%`);
}

console.log(`Whole-run ground truth: ${totalWholeRuns} boxes. Segment-split ground truth: ${totalSegments} boxes (${(totalSegments / totalWholeRuns).toFixed(2)}x).\n`);
report('Scored against whole-run truth   (current metric)', wholeRun);
report('Scored against segment-split truth (same, unmodified predictions)', segmentLevel);
