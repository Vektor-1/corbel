#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const DATASET = path.resolve(ROOT, '../datasets/dataset');
const cache = JSON.parse(await fs.readFile(process.argv[2] ?? 'scripts/.bench-cache/raw_val_200.json', 'utf8'));
const CONF = 0.25;
const outDir = path.join(ROOT, 'benchmark_out/wall-failure-viz');
await fs.mkdir(outDir, { recursive: true });

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

// Pick a handful of images with a mix of wall outcomes.
const picks = cache.items.slice(0, 6);

for (const item of picks) {
  const preds = nms(item.candidates.filter((b) => b.cls === 0 && b.confidence >= CONF), 0.45);
  const truthWalls = item.truth.filter((t) => t.cls === 0);
  const imagePath = path.join(DATASET, 'images', cache.split, `${item.id}.png`);
  const source = await fs.readFile(imagePath);

  const predRects = preds.map((p) => `<rect x="${p.x0}" y="${p.y0}" width="${p.x1 - p.x0}" height="${p.y1 - p.y0}" fill="none" stroke="red" stroke-width="2"/>`).join('');
  const truthRects = truthWalls.map((t) => `<rect x="${t.x0}" y="${t.y0}" width="${t.x1 - t.x0}" height="${t.y1 - t.y0}" fill="none" stroke="lime" stroke-width="2" stroke-dasharray="4,2"/>`).join('');
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${item.width}" height="${item.height}">${predRects}${truthRects}</svg>`);

  const outPath = path.join(outDir, `${item.id}.png`);
  await sharp(source).composite([{ input: svg }]).png().toFile(outPath);
  console.log(`${item.id}: ${preds.length} pred walls (red), ${truthWalls.length} truth walls (green dashed) -> ${outPath}`);
}
