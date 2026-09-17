#!/usr/bin/env node
/**
 * Runs the shipped ONNX detector once per held-out image at a very low
 * confidence floor and caches every surviving candidate box (pre-NMS,
 * pre-threshold) plus the YOLO ground truth. Lets a threshold sweep and
 * post-processing development iterate against real model output without
 * re-running inference (the expensive part) on every attempt.
 *
 * node --experimental-strip-types scripts/cache-raw-detections.ts --n 200 --split val
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-web';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_DATASET = path.resolve(ROOT, '../datasets/dataset');
const INPUT_SIZE = 640;
const CLASS_NAMES = ['wall', 'door', 'window'] as const;
const FLOOR_CONF = 0.05;

const preprocessorModulePath = '../src/lib/plan-import/image-preprocess' + '.ts';
const { enhancePlanPixels } = (await import(preprocessorModulePath)) as typeof import('../src/lib/plan-import/image-preprocess');

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

async function makeTensor(imagePath: string, enhance: boolean) {
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

function decodeAll(output: ort.Tensor, scale: number, padX: number, padY: number, floorConf: number) {
  const [, attributes, anchors] = output.dims;
  const data = output.data as Float32Array;
  const boxes: { cls: number; confidence: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (let anchor = 0; anchor < anchors; anchor++) {
    let cls = -1, confidence = 0;
    for (let candidate = 0; candidate < attributes - 4; candidate++) {
      const score = data[(4 + candidate) * anchors + anchor];
      if (score > confidence) { confidence = score; cls = candidate; }
    }
    if (confidence < floorConf || cls < 0) continue;
    const cx = data[anchor], cy = data[anchors + anchor], width = data[anchors * 2 + anchor], height = data[anchors * 3 + anchor];
    boxes.push({
      cls, confidence,
      x0: (cx - width / 2 - padX) / scale, y0: (cy - height / 2 - padY) / scale,
      x1: (cx + width / 2 - padX) / scale, y1: (cy + height / 2 - padY) / scale,
    });
  }
  return boxes;
}

function parseLabels(contents: string, width: number, height: number) {
  return contents.trim().split(/\r?\n/).filter(Boolean).flatMap((line) => {
    const [classId, cx, cy, boxWidth, boxHeight] = line.trim().split(/\s+/).map(Number);
    if (![classId, cx, cy, boxWidth, boxHeight].every(Number.isFinite)) return [];
    const w = boxWidth * width, h = boxHeight * height;
    return [{ cls: classId, x0: cx * width - w / 2, y0: cy * height - h / 2, x1: cx * width + w / 2, y1: cy * height + h / 2 }];
  });
}

async function main() {
  const dataset = path.resolve(arg('--dataset', DEFAULT_DATASET));
  const split = arg('--split', 'val');
  const sampleCount = Number(arg('--n', '200'));
  const seed = Number(arg('--seed', '13'));
  const enhance = arg('--enhance', 'true') !== 'false';
  const outputPath = arg('--out', path.join(ROOT, `scripts/.bench-cache/raw_${split}_${sampleCount}.json`));
  const imageDirectory = path.join(dataset, 'images', split);
  const labelDirectory = path.join(dataset, 'labels', split);
  const imageNames = (await fs.readdir(imageDirectory)).filter((name) => name.endsWith('.png'));
  const pairedNames: string[] = [];
  for (const name of imageNames) {
    try {
      await fs.access(path.join(labelDirectory, `${path.basename(name, '.png')}.txt`));
      pairedNames.push(name);
    } catch {
      // skip unlabelled
    }
  }
  const samples = seededShuffle(pairedNames, seed).slice(0, sampleCount);
  const session = await ort.InferenceSession.create(path.join(ROOT, 'public/models/corbel-detect.onnx'), { executionProviders: ['wasm'] });

  const items: { id: string; width: number; height: number; candidates: ReturnType<typeof decodeAll>; truth: ReturnType<typeof parseLabels> }[] = [];
  for (const [index, name] of samples.entries()) {
    const imagePath = path.join(imageDirectory, name);
    const labelPath = path.join(labelDirectory, `${path.basename(name, '.png')}.txt`);
    const input = await makeTensor(imagePath, enhance);
    const labelContents = await fs.readFile(labelPath, 'utf8');
    const outputs = await session.run({ [session.inputNames[0]]: input.tensor });
    const candidates = decodeAll(outputs[session.outputNames[0]], input.scale, input.padX, input.padY, FLOOR_CONF);
    const truth = parseLabels(labelContents, input.width, input.height);
    items.push({ id: path.basename(name, '.png'), width: input.width, height: input.height, candidates, truth });
    if ((index + 1) % 25 === 0) console.error(`cached ${index + 1}/${samples.length}`);
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify({ dataset, split, seed, enhance, floorConf: FLOOR_CONF, classNames: CLASS_NAMES, items }));
  console.log(`Cached ${items.length} images to ${outputPath}`);
  console.log(`Mean candidates/image: ${(items.reduce((s, i) => s + i.candidates.length, 0) / items.length).toFixed(0)}`);
}

void main();
