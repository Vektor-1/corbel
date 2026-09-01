#!/usr/bin/env node
/**
 * Reproducible held-out evaluator for Corbel's local YOLO detector.
 *
 * Runs the shipped ONNX model against YOLO labels in the external dataset and
 * reports macro F1 at IoU 0.50. It mirrors the local detector's 640px
 * letterbox, optional enhancement, decoding and class-wise greedy NMS.
 *
 * Example:
 * node --experimental-strip-types scripts/benchmark-local-yolo.ts --n 120 --enhance true
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_DATASET = path.resolve(ROOT, '../datasets/dataset');
const INPUT_SIZE = 640;
const CLASS_NAMES = ['wall', 'door', 'window'] as const;

interface Box { cls: number; confidence: number; x0: number; y0: number; x1: number; y1: number; }
interface Counts { tp: number; fp: number; fn: number; }

// Node 26 can strip and load the source TypeScript file directly. Constructing
// the extension keeps this Node-only runner out of the web app's TypeScript
// module-resolution rules.
const preprocessorModulePath = '../src/lib/plan-import/image-preprocess' + '.ts';
const { enhancePlanPixels } = await import(preprocessorModulePath) as typeof import('../src/lib/plan-import/image-preprocess');

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function iou(a: Box, b: Box): number {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = Math.max(0, a.x1 - a.x0) * Math.max(0, a.y1 - a.y0) + Math.max(0, b.x1 - b.x0) * Math.max(0, b.y1 - b.y0) - intersection;
  return union > 0 ? intersection / union : 0;
}

function nms(boxes: Box[], threshold = 0.45): Box[] {
  const kept: Box[] = [];
  for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
    const candidates = boxes.filter((box) => box.cls === cls).sort((a, b) => b.confidence - a.confidence);
    const suppressed = new Array(candidates.length).fill(false);
    for (let index = 0; index < candidates.length; index++) {
      if (suppressed[index]) continue;
      kept.push(candidates[index]);
      for (let next = index + 1; next < candidates.length; next++) {
        if (iou(candidates[index], candidates[next]) > threshold) suppressed[next] = true;
      }
    }
  }
  return kept;
}

function parseLabels(contents: string, width: number, height: number): Box[] {
  return contents.trim().split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const [classId, cx, cy, boxWidth, boxHeight] = line.trim().split(/\s+/).map(Number);
    if (![classId, cx, cy, boxWidth, boxHeight].every(Number.isFinite)) return [];
    const w = boxWidth * width, h = boxHeight * height;
    return [{ cls: classId, confidence: 1, x0: cx * width - w / 2, y0: cy * height - h / 2, x1: cx * width + w / 2, y1: cy * height + h / 2 }];
  });
}

function updateCounts(predictions: Box[], truth: Box[], totals: Counts[]): void {
  for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
    const predicted = predictions.filter((box) => box.cls === cls).sort((a, b) => b.confidence - a.confidence);
    const expected = truth.filter((box) => box.cls === cls);
    const matched = new Set<number>();
    let tp = 0;
    for (const candidate of predicted) {
      let bestIndex = -1, bestIou = 0;
      expected.forEach((target, index) => {
        if (!matched.has(index) && iou(candidate, target) > bestIou) { bestIou = iou(candidate, target); bestIndex = index; }
      });
      if (bestIndex >= 0 && bestIou >= 0.5) { matched.add(bestIndex); tp++; }
    }
    totals[cls].tp += tp;
    totals[cls].fp += predicted.length - tp;
    totals[cls].fn += expected.length - tp;
  }
}

async function makeTensor(imagePath: string, enhance: boolean): Promise<{ tensor: ort.Tensor; scale: number; padX: number; padY: number; width: number; height: number }> {
  const source = sharp(imagePath).rotate();
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Cannot read dimensions: ${imagePath}`);
  const width = metadata.width, height = metadata.height;
  const scale = Math.min(INPUT_SIZE / width, INPUT_SIZE / height);
  const resizedWidth = Math.round(width * scale), resizedHeight = Math.round(height * scale);
  const padX = Math.floor((INPUT_SIZE - resizedWidth) / 2), padY = Math.floor((INPUT_SIZE - resizedHeight) / 2);
  const { data } = await source
    .resize(resizedWidth, resizedHeight, { fit: 'fill' })
    .extend({ top: padY, bottom: INPUT_SIZE - resizedHeight - padY, left: padX, right: INPUT_SIZE - resizedWidth - padX, background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  const inferencePixels = enhance ? enhancePlanPixels(pixels, INPUT_SIZE, INPUT_SIZE) : pixels;
  const plane = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * plane);
  for (let index = 0; index < plane; index++) {
    tensor[index] = inferencePixels[index * 4] / 255;
    tensor[plane + index] = inferencePixels[index * 4 + 1] / 255;
    tensor[plane * 2 + index] = inferencePixels[index * 4 + 2] / 255;
  }
  return { tensor: new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]), scale, padX, padY, width, height };
}

function decode(output: ort.Tensor, scale: number, padX: number, padY: number, confidenceThreshold: number, nmsIou: number): Box[] {
  const [, attributes, anchors] = output.dims;
  const data = output.data as Float32Array;
  const boxes: Box[] = [];
  for (let anchor = 0; anchor < anchors; anchor++) {
    let cls = -1, confidence = 0;
    for (let candidate = 0; candidate < attributes - 4; candidate++) {
      const score = data[(4 + candidate) * anchors + anchor];
      if (score > confidence) { confidence = score; cls = candidate; }
    }
    if (confidence < confidenceThreshold || cls < 0) continue;
    const cx = data[anchor], cy = data[anchors + anchor], width = data[anchors * 2 + anchor], height = data[anchors * 3 + anchor];
    boxes.push({ cls, confidence, x0: (cx - width / 2 - padX) / scale, y0: (cy - height / 2 - padY) / scale, x1: (cx + width / 2 - padX) / scale, y1: (cy + height / 2 - padY) / scale });
  }
  return nms(boxes, nmsIou);
}

async function main() {
  const dataset = path.resolve(arg('--dataset', DEFAULT_DATASET));
  const split = arg('--split', 'test');
  const sampleCount = Number(arg('--n', '120'));
  const seed = Number(arg('--seed', '13'));
  const enhance = arg('--enhance', 'true') !== 'false';
  const confidenceThreshold = Number(arg('--conf', '0.25'));
  const nmsIou = Number(arg('--nms-iou', '0.45'));
  const outputPath = arg('--out', path.join(ROOT, 'scripts/.bench-cache/yolo_heldout.json'));
  const imageDirectory = path.join(dataset, 'images', split);
  const labelDirectory = path.join(dataset, 'labels', split);
  const imageNames = (await fs.readdir(imageDirectory)).filter((name) => name.endsWith('.png'));
  // The dataset audit verifies one label file per held-out image; retain only
  // that paired set so a missing annotation can never inflate the score.
  const pairedNames: string[] = [];
  for (const name of imageNames) {
    try {
      await fs.access(path.join(labelDirectory, `${path.basename(name, '.png')}.txt`));
      pairedNames.push(name);
    } catch {
      // Skip unlabelled images rather than treating them as empty ground truth.
    }
  }
  const samples = seededShuffle(pairedNames, seed).slice(0, sampleCount);
  const session = await ort.InferenceSession.create(path.join(ROOT, 'public/models/corbel-detect.onnx'), { executionProviders: ['wasm'] });
  const totals: Counts[] = CLASS_NAMES.map(() => ({ tp: 0, fp: 0, fn: 0 }));
  const latencies: number[] = [];

  for (const [index, name] of samples.entries()) {
    const imagePath = path.join(imageDirectory, name);
    const labelPath = path.join(labelDirectory, `${path.basename(name, '.png')}.txt`);
    const input = await makeTensor(imagePath, enhance);
    const labelContents = await fs.readFile(labelPath, 'utf8');
    const started = performance.now();
    const outputs = await session.run({ [session.inputNames[0]]: input.tensor });
    latencies.push(performance.now() - started);
    updateCounts(decode(outputs[session.outputNames[0]], input.scale, input.padX, input.padY, confidenceThreshold, nmsIou), parseLabels(labelContents, input.width, input.height), totals);
    if ((index + 1) % 20 === 0) console.error(`evaluated ${index + 1}/${samples.length}`);
  }

  const perClass = Object.fromEntries(CLASS_NAMES.map((name, index) => {
    const { tp, fp, fn } = totals[index];
    const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
    return [name, { precision, recall, f1: (2 * precision * recall) / (precision + recall) || 0, tp, fp, fn }];
  }));
  const overallF1 = Object.values(perClass).reduce((sum, metric) => sum + metric.f1, 0) / CLASS_NAMES.length;
  const result = { config: { dataset, split, n: samples.length, seed, enhance, confidenceThreshold, nmsIou, matchIou: 0.5 }, summary: { overallF1, perClass, meanInferenceMs: latencies.reduce((sum, value) => sum + value, 0) / latencies.length }, sampleIds: samples.map((name) => path.basename(name, '.png')) };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

void main();
