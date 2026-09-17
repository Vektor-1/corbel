#!/usr/bin/env node
/**
 * Reproducible held-out evaluator for Corbel's local YOLO detector.
 *
 * Runs the shipped ONNX model against YOLO labels in the external dataset and
 * reports macro F1 at IoU 0.50, plus:
 *  - bootstrap 95% confidence intervals (image-level resampling)
 *  - latency broken into model-only vs full-pipeline timing, with warm-up
 *    samples excluded and mean/p50/p95/max reported
 *  - an IoU threshold sweep (0.50-0.95) approximating mAP50-95 per class,
 *    computed from a single inference pass (no extra model calls)
 *  - a confidence-threshold sweep reporting each class's best achievable F1
 *    and the threshold it occurs at, from a single low-floor decode + NMS
 *  - a breakdown by CubiCasa5k sub-style (colorful / high_quality /
 *    high_quality_architectural), inferred from the sample filename
 *
 * It mirrors the local detector's letterbox, optional enhancement, decoding
 * and class-wise greedy NMS.
 *
 * Example:
 * node --experimental-strip-types scripts/benchmark-local-yolo.ts --n 400 --model ../ml/train_runC.onnx
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_DATASET = path.resolve(ROOT, '../datasets/dataset');
let INPUT_SIZE = 640;
const CLASS_NAMES = ['wall', 'door', 'window'] as const;
const IOU_SWEEP = [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
const CONF_SWEEP = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95];
const CONF_SWEEP_FLOOR = 0.05;
const WARMUP_SAMPLES = 10;
const BOOTSTRAP_REPLICATES = 1000;
const STYLE_PREFIXES = ['high_quality_architectural', 'colorful', 'high_quality'] as const; // longest/most-specific first

interface Box { cls: number; confidence: number; x0: number; y0: number; x1: number; y1: number; }
interface Counts { tp: number; fp: number; fn: number; }
type PerImageCounts = Counts[]; // indexed by class

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

// Separate RNG stream for bootstrap resampling so it never perturbs sample selection.
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
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

// Greedy match (highest-confidence prediction claims its best available ground
// truth first) at a given IoU threshold -- standard convention, matches COCO/VOC.
// Kept for one-off use; the per-image sweep loop uses the matrix-cached path
// below instead, since it evaluates ~30 (confidence, matchIou) combinations
// per image and recomputing box-overlap geometry that many times dominated
// runtime in practice.
function matchCounts(predictions: Box[], truth: Box[], matchIou: number): PerImageCounts {
  const counts: PerImageCounts = CLASS_NAMES.map(() => ({ tp: 0, fp: 0, fn: 0 }));
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
      if (bestIndex >= 0 && bestIou >= matchIou) { matched.add(bestIndex); tp++; }
    }
    counts[cls] = { tp, fp: predicted.length - tp, fn: expected.length - tp };
  }
  return counts;
}

interface ClassMatcher {
  predictions: Box[]; // sorted by confidence desc
  truthCount: number;
  iouMatrix: Float32Array; // flattened [predIndex * truthCount + truthIndex], built once
}

// Precomputes pairwise IoU once per class per image. All (confidenceThreshold,
// matchIou) sweep points then just filter + do cheap array-lookup matching
// instead of recomputing box-overlap geometry per sweep point.
function buildClassMatchers(predictions: Box[], truth: Box[]): ClassMatcher[] {
  return CLASS_NAMES.map((_, cls) => {
    const sorted = predictions.filter((box) => box.cls === cls).sort((a, b) => b.confidence - a.confidence);
    const expected = truth.filter((box) => box.cls === cls);
    const truthCount = expected.length;
    const iouMatrix = new Float32Array(sorted.length * truthCount);
    for (let p = 0; p < sorted.length; p++) {
      for (let t = 0; t < truthCount; t++) iouMatrix[p * truthCount + t] = iou(sorted[p], expected[t]);
    }
    return { predictions: sorted, truthCount, iouMatrix };
  });
}

function matchFromMatchers(matchers: ClassMatcher[], confidenceThreshold: number, matchIou: number): PerImageCounts {
  return matchers.map(({ predictions, truthCount, iouMatrix }) => {
    const matched = new Array(truthCount).fill(false);
    let tp = 0, considered = 0;
    for (let p = 0; p < predictions.length; p++) {
      if (predictions[p].confidence < confidenceThreshold) break; // sorted desc: nothing after this survives either
      considered++;
      let bestIndex = -1, bestIou = 0;
      for (let t = 0; t < truthCount; t++) {
        if (matched[t]) continue;
        const value = iouMatrix[p * truthCount + t];
        if (value > bestIou) { bestIou = value; bestIndex = t; }
      }
      if (bestIndex >= 0 && bestIou >= matchIou) { matched[bestIndex] = true; tp++; }
    }
    return { tp, fp: considered - tp, fn: truthCount - tp };
  });
}

function f1FromCounts(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp / (tp + fp) || 0, recall = tp / (tp + fn) || 0;
  return { precision, recall, f1: (2 * precision * recall) / (precision + recall) || 0 };
}

function sumCounts(list: PerImageCounts[]): Counts[] {
  const totals: Counts[] = CLASS_NAMES.map(() => ({ tp: 0, fp: 0, fn: 0 }));
  for (const perImage of list) {
    for (let cls = 0; cls < CLASS_NAMES.length; cls++) {
      totals[cls].tp += perImage[cls].tp;
      totals[cls].fp += perImage[cls].fp;
      totals[cls].fn += perImage[cls].fn;
    }
  }
  return totals;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor(p * sorted.length));
  return sorted[index];
}

function latencyStats(all: number[]): { mean: number; p50: number; p95: number; max: number; warmupExcluded: number } {
  const steady = all.length > WARMUP_SAMPLES ? all.slice(WARMUP_SAMPLES) : all;
  const sorted = [...steady].sort((a, b) => a - b);
  return {
    mean: steady.reduce((sum, v) => sum + v, 0) / steady.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1] ?? 0,
    warmupExcluded: Math.min(WARMUP_SAMPLES, all.length),
  };
}

// Bootstrap 95% CI on overall (macro) F1 by resampling images with replacement.
function bootstrapOverallF1(perImage: PerImageCounts[], replicates: number, seed: number): [number, number] {
  const rng = makeRng(seed);
  const n = perImage.length;
  if (n === 0) return [0, 0];
  const scores: number[] = [];
  for (let rep = 0; rep < replicates; rep++) {
    const sample: PerImageCounts[] = [];
    for (let i = 0; i < n; i++) sample.push(perImage[Math.floor(rng() * n)]);
    const totals = sumCounts(sample);
    const macroF1 = totals.reduce((sum, { tp, fp, fn }) => sum + f1FromCounts(tp, fp, fn).f1, 0) / CLASS_NAMES.length;
    scores.push(macroF1);
  }
  scores.sort((a, b) => a - b);
  return [percentile(scores, 0.025), percentile(scores, 0.975)];
}

function bootstrapClassF1(perImage: PerImageCounts[], cls: number, replicates: number, seed: number): [number, number] {
  const rng = makeRng(seed + 1000 + cls); // distinct stream per class
  const n = perImage.length;
  if (n === 0) return [0, 0];
  const scores: number[] = [];
  for (let rep = 0; rep < replicates; rep++) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < n; i++) {
      const c = perImage[Math.floor(rng() * n)][cls];
      tp += c.tp; fp += c.fp; fn += c.fn;
    }
    scores.push(f1FromCounts(tp, fp, fn).f1);
  }
  scores.sort((a, b) => a - b);
  return [percentile(scores, 0.025), percentile(scores, 0.975)];
}

function styleOf(sampleId: string): string {
  for (const prefix of STYLE_PREFIXES) if (sampleId.startsWith(prefix)) return prefix;
  return 'other';
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

// Decodes at a low confidence floor and runs NMS once; callers filter the
// returned (already deduplicated) boxes by confidence for threshold sweeps,
// avoiding repeat inference or repeat NMS passes per threshold.
function decode(output: ort.Tensor, scale: number, padX: number, padY: number, confidenceFloor: number, nmsIou: number): Box[] {
  const [, attributes, anchors] = output.dims;
  const data = output.data as Float32Array;
  const boxes: Box[] = [];
  for (let anchor = 0; anchor < anchors; anchor++) {
    let cls = -1, confidence = 0;
    for (let candidate = 0; candidate < attributes - 4; candidate++) {
      const score = data[(4 + candidate) * anchors + anchor];
      if (score > confidence) { confidence = score; cls = candidate; }
    }
    if (confidence < confidenceFloor || cls < 0) continue;
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
  const modelPath = arg('--model', path.join(ROOT, 'public/models/corbel-detect.onnx'));
  const outputPath = arg('--out', path.join(ROOT, 'scripts/.bench-cache/yolo_heldout.json'));
  const bootstrapReplicates = Number(arg('--bootstrap', String(BOOTSTRAP_REPLICATES)));
  INPUT_SIZE = Number(arg('--imgsz', '640'));

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
  const session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] });

  const modelLatencies: number[] = [];
  const pipelineLatencies: number[] = [];
  // Per-image, at the report confidence threshold and matchIou=0.5 -- feeds the headline numbers + bootstrap.
  const perImageDefault: PerImageCounts[] = [];
  // Per-image, at each IoU threshold in the sweep (using the same report-confidence predictions).
  const perImageByIou: PerImageCounts[][] = IOU_SWEEP.map(() => []);
  // Per-image, at each confidence threshold in the sweep (using low-floor decode, matchIou=0.5).
  const perImageByConf: PerImageCounts[][] = CONF_SWEEP.map(() => []);
  const sampleStyles: string[] = [];

  for (const [index, name] of samples.entries()) {
    const imagePath = path.join(imageDirectory, name);
    const labelPath = path.join(labelDirectory, `${path.basename(name, '.png')}.txt`);
    const sampleId = path.basename(name, '.png');
    sampleStyles.push(styleOf(sampleId));

    const pipelineStart = performance.now();
    const input = await makeTensor(imagePath, enhance);
    const labelContents = await fs.readFile(labelPath, 'utf8');

    const modelStart = performance.now();
    const outputs = await session.run({ [session.inputNames[0]]: input.tensor });
    const modelEnd = performance.now();
    modelLatencies.push(modelEnd - modelStart);

    // Low-floor decode + single NMS pass feeds every downstream sweep.
    const lowFloorBoxes = decode(outputs[session.outputNames[0]], input.scale, input.padX, input.padY, CONF_SWEEP_FLOOR, nmsIou);
    const truth = parseLabels(labelContents, input.width, input.height);

    pipelineLatencies.push(performance.now() - pipelineStart);

    // Pairwise IoU computed once per class per image; every sweep point below
    // is then just a filter + cheap array-lookup match, not recomputed geometry.
    const matchers = buildClassMatchers(lowFloorBoxes, truth);

    // Headline: report-confidence-threshold predictions at matchIou=0.5.
    perImageDefault.push(matchFromMatchers(matchers, confidenceThreshold, 0.5));

    // IoU sweep: same report confidence threshold, vary matching IoU.
    IOU_SWEEP.forEach((thresholdIou, sweepIndex) => {
      perImageByIou[sweepIndex].push(matchFromMatchers(matchers, confidenceThreshold, thresholdIou));
    });

    // Confidence sweep: vary the confidence cutoff, fixed matchIou=0.5.
    CONF_SWEEP.forEach((thresholdConf, sweepIndex) => {
      perImageByConf[sweepIndex].push(matchFromMatchers(matchers, thresholdConf, 0.5));
    });

    if ((index + 1) % 20 === 0) console.error(`evaluated ${index + 1}/${samples.length}`);
  }

  // --- Headline per-class + overall, with bootstrap CIs ---
  const defaultTotals = sumCounts(perImageDefault);
  const perClass = Object.fromEntries(CLASS_NAMES.map((name, cls) => {
    const { tp, fp, fn } = defaultTotals[cls];
    const { precision, recall, f1 } = f1FromCounts(tp, fp, fn);
    const ci95 = bootstrapClassF1(perImageDefault, cls, bootstrapReplicates, seed);
    return [name, { precision, recall, f1, tp, fp, fn, ci95 }];
  }));
  const overallF1 = Object.values(perClass).reduce((sum, m) => sum + m.f1, 0) / CLASS_NAMES.length;
  const overallCi95 = bootstrapOverallF1(perImageDefault, bootstrapReplicates, seed);

  // --- IoU sweep: per-class F1 at each threshold + mAP50-95-style average ---
  const iouSweepByClass = Object.fromEntries(CLASS_NAMES.map((name, cls) => {
    const curve = IOU_SWEEP.map((threshold, sweepIndex) => {
      const totals = sumCounts(perImageByIou[sweepIndex]);
      return { threshold, f1: f1FromCounts(totals[cls].tp, totals[cls].fp, totals[cls].fn).f1 };
    });
    const mapLike = curve.reduce((sum, point) => sum + point.f1, 0) / curve.length;
    return [name, { curve, mapLike }];
  }));

  // --- Confidence sweep: per-class best-F1-across-thresholds ---
  const confSweepByClass = Object.fromEntries(CLASS_NAMES.map((name, cls) => {
    const curve = CONF_SWEEP.map((threshold, sweepIndex) => {
      const totals = sumCounts(perImageByConf[sweepIndex]);
      return { threshold, f1: f1FromCounts(totals[cls].tp, totals[cls].fp, totals[cls].fn).f1 };
    });
    const best = curve.reduce((best, point) => (point.f1 > best.f1 ? point : best), curve[0]);
    return [name, { curve, best }];
  }));

  // --- Per-style breakdown ---
  const styles = [...new Set(sampleStyles)];
  const byStyle = Object.fromEntries(styles.map((style) => {
    const indices = sampleStyles.map((s, i) => (s === style ? i : -1)).filter((i) => i >= 0);
    const subset = indices.map((i) => perImageDefault[i]);
    const totals = sumCounts(subset);
    const perClassStyle = Object.fromEntries(CLASS_NAMES.map((name, cls) => [name, f1FromCounts(totals[cls].tp, totals[cls].fp, totals[cls].fn).f1]));
    const overall = Object.values(perClassStyle).reduce((sum, f1) => sum + f1, 0) / CLASS_NAMES.length;
    return [style, { n: subset.length, overallF1: overall, perClass: perClassStyle }];
  }));

  const result = {
    config: { modelPath, dataset, split, n: samples.length, seed, enhance, confidenceThreshold, nmsIou, matchIou: 0.5, bootstrapReplicates },
    summary: {
      overallF1,
      overallCi95,
      perClass,
      latency: {
        modelMs: latencyStats(modelLatencies),
        pipelineMs: latencyStats(pipelineLatencies),
      },
    },
    iouSweep: iouSweepByClass,
    confidenceSweep: confSweepByClass,
    byStyle,
    sampleIds: samples.map((name) => path.basename(name, '.png')),
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

void main();
