#!/usr/bin/env node
// Sweeps the wall-segment merge heuristic's parameters (plus conf/nmsIou) to
// see how much of the bbox-IoU gap it can actually close.
import fs from 'node:fs/promises';
import { mergeWallSegments } from './merge-wall-segments.mjs';

const CLASS_NAMES = ['wall', 'door', 'window'];
const cache = JSON.parse(await fs.readFile(process.argv[2] ?? 'scripts/.bench-cache/raw_val_200.json', 'utf8'));

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0) + Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}
function nms(boxes, threshold) {
  const kept = [];
  for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
    const candidates = boxes.filter((b) => b.cls === cls).sort((a, b) => b.confidence - a.confidence);
    const suppressed = new Array(candidates.length).fill(false);
    for (let i = 0; i < candidates.length; i++) {
      if (suppressed[i]) continue;
      kept.push(candidates[i]);
      for (let j = i + 1; j < candidates.length; j++) {
        if (!suppressed[j] && iou(candidates[i], candidates[j]) > threshold) suppressed[j] = true;
      }
    }
  }
  return kept;
}
function evaluate(conf, nmsIou, mergeOpts) {
  const totals = CLASS_NAMES.map(() => ({ tp: 0, fp: 0, fn: 0 }));
  for (const item of cache.items) {
    let predicted = nms(item.candidates.filter((b) => b.confidence >= conf), nmsIou);
    if (mergeOpts) predicted = mergeWallSegments(predicted, mergeOpts);
    for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
      const preds = predicted.filter((b) => b.cls === cls).sort((a, b) => b.confidence - a.confidence);
      const truth = item.truth.filter((b) => b.cls === cls);
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
      totals[cls].tp += tp;
      totals[cls].fp += preds.length - tp;
      totals[cls].fn += truth.length - tp;
    }
  }
  return Object.fromEntries(CLASS_NAMES.map((name, index) => {
    const { tp, fp, fn } = totals[index];
    const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
    return [name, { precision, recall, f1: (2 * precision * recall) / (precision + recall) || 0 }];
  }));
}

console.log('Baseline (no merge), conf=0.25 nmsIou=0.45:');
const baseline = evaluate(0.25, 0.45, null);
for (const c of CLASS_NAMES) console.log(`  ${c}: P=${(baseline[c].precision*100).toFixed(1)}% R=${(baseline[c].recall*100).toFixed(1)}% F1=${(baseline[c].f1*100).toFixed(1)}%`);

console.log('\nSweeping merge gapTolerance x minBandOverlap (conf=0.25, nmsIou=0.45):');
const gapGrid = [5, 10, 15, 20, 30, 40, 60];
const bandGrid = [0.15, 0.25, 0.35, 0.5];
const rows = [];
for (const gapTolerance of gapGrid) {
  for (const minBandOverlap of bandGrid) {
    const result = evaluate(0.25, 0.45, { gapTolerance, minBandOverlap });
    rows.push({ gapTolerance, minBandOverlap, wall: result.wall, door: result.door, window: result.window });
  }
}
rows.sort((a, b) => b.wall.f1 - a.wall.f1);
console.log('gap  band | wall P/R/F1           | door F1  window F1');
for (const r of rows.slice(0, 15)) {
  console.log(
    `${String(r.gapTolerance).padStart(3)}  ${r.minBandOverlap.toFixed(2)} | ` +
    `${(r.wall.precision*100).toFixed(1)}/${(r.wall.recall*100).toFixed(1)}/${(r.wall.f1*100).toFixed(1)}%  | ` +
    `${(r.door.f1*100).toFixed(1)}%    ${(r.window.f1*100).toFixed(1)}%`
  );
}

const best = rows[0];
console.log(`\nBest wall F1: ${(best.wall.f1*100).toFixed(1)}% at gapTolerance=${best.gapTolerance}, minBandOverlap=${best.minBandOverlap}`);
console.log(`(baseline was ${(baseline.wall.f1*100).toFixed(1)}%, target is 95%)`);
