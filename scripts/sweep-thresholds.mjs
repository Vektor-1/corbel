#!/usr/bin/env node
/**
 * Sweeps confidence/NMS-IoU thresholds against a cached raw-detection dump
 * (see cache-raw-detections.ts) — no re-inference, so a full grid runs in
 * milliseconds. Reports the per-class and macro F1 at IoU>=0.5 for each combo.
 *
 * node scripts/sweep-thresholds.mjs scripts/.bench-cache/raw_val_200.json
 */
import fs from 'node:fs/promises';

const CLASS_NAMES = ['wall', 'door', 'window'];
const cachePath = process.argv[2] ?? 'scripts/.bench-cache/raw_val_200.json';
const cache = JSON.parse(await fs.readFile(cachePath, 'utf8'));

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

function evaluate(conf, nmsIou, matchIou = 0.5, postProcess = null) {
  const totals = CLASS_NAMES.map(() => ({ tp: 0, fp: 0, fn: 0 }));
  for (const item of cache.items) {
    let predicted = nms(item.candidates.filter((b) => b.confidence >= conf), nmsIou);
    if (postProcess) predicted = postProcess(predicted, item);
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
        if (bestIndex >= 0 && bestIou >= matchIou) { matched.add(bestIndex); tp++; }
      }
      totals[cls].tp += tp;
      totals[cls].fp += preds.length - tp;
      totals[cls].fn += truth.length - tp;
    }
  }
  const perClass = Object.fromEntries(CLASS_NAMES.map((name, index) => {
    const { tp, fp, fn } = totals[index];
    const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
    const f1 = (2 * precision * recall) / (precision + recall) || 0;
    return [name, { precision, recall, f1, tp, fp, fn }];
  }));
  return perClass;
}

const confGrid = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
const iouGrid = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];

const rows = [];
for (const conf of confGrid) {
  for (const nmsIou of iouGrid) {
    const perClass = evaluate(conf, nmsIou);
    const macro = CLASS_NAMES.reduce((s, c) => s + perClass[c].f1, 0) / CLASS_NAMES.length;
    const worst = Math.min(...CLASS_NAMES.map((c) => perClass[c].f1));
    rows.push({ conf, nmsIou, macro, worst, perClass });
  }
}

rows.sort((a, b) => b.worst - a.worst);
console.log(`Loaded ${cache.items.length} images from ${cache.split} split (seed ${cache.seed}, enhance=${cache.enhance})`);
console.log('\nTop 10 combos by worst-class F1 (the bottleneck for "all three at 95%"):');
console.log('conf  nmsIou | wall F1  door F1  window F1 | macro | worst');
for (const r of rows.slice(0, 10)) {
  console.log(
    `${r.conf.toFixed(2)}  ${r.nmsIou.toFixed(2)}   | ` +
    `${(r.perClass.wall.f1 * 100).toFixed(1)}%    ${(r.perClass.door.f1 * 100).toFixed(1)}%    ${(r.perClass.window.f1 * 100).toFixed(1)}%     | ` +
    `${(r.macro * 100).toFixed(1)}%  ${(r.worst * 100).toFixed(1)}%`
  );
}

rows.sort((a, b) => b.macro - a.macro);
console.log('\nTop 5 combos by macro F1:');
for (const r of rows.slice(0, 5)) {
  console.log(
    `${r.conf.toFixed(2)}  ${r.nmsIou.toFixed(2)}   | ` +
    `${(r.perClass.wall.f1 * 100).toFixed(1)}%    ${(r.perClass.door.f1 * 100).toFixed(1)}%    ${(r.perClass.window.f1 * 100).toFixed(1)}%     | ` +
    `${(r.macro * 100).toFixed(1)}%  ${(r.worst * 100).toFixed(1)}%`
  );
}

console.log('\nCurrent shipped default (conf=0.25, nmsIou=0.45):');
const current = evaluate(0.25, 0.45);
for (const c of CLASS_NAMES) console.log(`  ${c}: P=${(current[c].precision*100).toFixed(1)}% R=${(current[c].recall*100).toFixed(1)}% F1=${(current[c].f1*100).toFixed(1)}%`);
