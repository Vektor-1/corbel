#!/usr/bin/env node
// Checks whether wall bbox-IoU misses are a fragmentation problem (many small
// predicted boxes covering one true wall) or a genuine localization problem
// (predictions just don't align with the wall at all), using the cached
// low-threshold raw detections.
import fs from 'node:fs/promises';

const cache = JSON.parse(await fs.readFile(process.argv[2] ?? 'scripts/.bench-cache/raw_val_200.json', 'utf8'));
const CONF = 0.25;

function iou(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0) + Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0) - inter;
  return union > 0 ? inter / union : 0;
}
function unionBox(boxes) {
  return { x0: Math.min(...boxes.map(b=>b.x0)), y0: Math.min(...boxes.map(b=>b.y0)), x1: Math.max(...boxes.map(b=>b.x1)), y1: Math.max(...boxes.map(b=>b.y1)) };
}

let missedEntirely = 0, singleBoxLowIou = 0, fragmentedHelped = 0, fragmentedNotEnough = 0, alreadyGood = 0, totalWalls = 0;
let sampleGood = [], sampleFrag = [], sampleMiss = [];

for (const item of cache.items) {
  const preds = item.candidates.filter(b => b.cls === 0 && b.confidence >= CONF);
  const truthWalls = item.truth.filter(t => t.cls === 0);
  for (const truth of truthWalls) {
    totalWalls++;
    const overlapping = preds.filter(p => iou(p, truth) > 0.01);
    if (overlapping.length === 0) { missedEntirely++; if (sampleMiss.length<3) sampleMiss.push({id:item.id, truth}); continue; }
    const bestSingle = Math.max(...overlapping.map(p => iou(p, truth)));
    if (bestSingle >= 0.5) { alreadyGood++; if (sampleGood.length<3) sampleGood.push({id:item.id, truth, bestSingle}); continue; }
    if (overlapping.length === 1) { singleBoxLowIou++; continue; }
    const merged = unionBox(overlapping);
    const mergedIou = iou(merged, truth);
    if (mergedIou >= 0.5) { fragmentedHelped++; if (sampleFrag.length<3) sampleFrag.push({id:item.id, truth, n:overlapping.length, bestSingle, mergedIou}); }
    else fragmentedNotEnough++;
  }
}

console.log(`Total ground-truth wall boxes: ${totalWalls}`);
console.log(`  Already IoU>=0.5 with best single prediction: ${alreadyGood} (${(alreadyGood/totalWalls*100).toFixed(1)}%)`);
console.log(`  Missed entirely (no overlapping prediction):  ${missedEntirely} (${(missedEntirely/totalWalls*100).toFixed(1)}%)`);
console.log(`  One overlapping box but IoU<0.5 (bad box, not fragmentation): ${singleBoxLowIou} (${(singleBoxLowIou/totalWalls*100).toFixed(1)}%)`);
console.log(`  Fragmented (2+ overlapping boxes) AND merging their union would reach IoU>=0.5: ${fragmentedHelped} (${(fragmentedHelped/totalWalls*100).toFixed(1)}%)  <-- merge heuristic upside`);
console.log(`  Fragmented but even merged union still <0.5 IoU: ${fragmentedNotEnough} (${(fragmentedNotEnough/totalWalls*100).toFixed(1)}%)`);

console.log('\nSample "fragmented, merging would help" cases:');
for (const s of sampleFrag) console.log(`  ${s.id}: ${s.n} overlapping boxes, best single IoU=${s.bestSingle.toFixed(2)}, merged IoU=${s.mergedIou.toFixed(2)}`);
console.log('\nSample "missed entirely" cases:');
for (const s of sampleMiss) console.log(`  ${s.id}: truth wall box ${JSON.stringify(s.truth)}`);
