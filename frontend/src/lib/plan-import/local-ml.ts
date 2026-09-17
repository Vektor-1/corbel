import * as ort from 'onnxruntime-web';
import { enhancePlanPixels } from './image-preprocess';

// Client-side YOLOv8n detection over the corbel-trained ONNX model.
// Classes: 0=wall, 1=door, 2=window. Runs entirely in the browser — no
// server round-trip, no API key.

const MODEL_URL = '/models/corbel-detect.onnx';
const INPUT_SIZE = 640;
const CLASS_NAMES = ['wall', 'door', 'window'] as const;
export type LocalMlClass = (typeof CLASS_NAMES)[number];

export interface RawBox {
  cls: LocalMlClass;
  confidence: number;
  // Pixel coordinates in the ORIGINAL (untransformed) image.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function getSession(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
    sessionPromise = ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
    }).catch((error) => {
      sessionPromise = null;
      throw error;
    });
  }
  return sessionPromise;
}

export async function loadImageBitmap(source: File | Blob | string): Promise<ImageBitmap> {
  if (typeof source === 'string') {
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Failed to fetch plan image (${res.status}).`);
    const blob = await res.blob();
    return createImageBitmap(blob);
  }
  return createImageBitmap(source);
}

export interface Letterbox {
  scaleX: number;
  scaleY: number;
  padX: number;
  padY: number;
  width: number;
  height: number;
}

// Resize into a square canvas preserving aspect ratio (YOLO "letterbox"),
// returning the tensor data plus the transform needed to map boxes back.
function preprocess(bitmap: ImageBitmap, enhance = true): { tensor: Float32Array; letterbox: Letterbox } {
  const canvas = document.createElement('canvas');
  canvas.width = INPUT_SIZE;
  canvas.height = INPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const scale = Math.min(INPUT_SIZE / bitmap.width, INPUT_SIZE / bitmap.height);
  const scaledW = Math.max(1, Math.round(bitmap.width * scale));
  const scaledH = Math.max(1, Math.round(bitmap.height * scale));
  const padX = Math.floor((INPUT_SIZE - scaledW) / 2);
  const padY = Math.floor((INPUT_SIZE - scaledH) / 2);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(bitmap, padX, padY, scaledW, scaledH);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  // Preserve the original file and use enhancement only for the inference tensor.
  const inferencePixels = enhance ? enhancePlanPixels(data, INPUT_SIZE, INPUT_SIZE) : data;
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;

  for (let i = 0; i < plane; i++) {
    tensor[i] = inferencePixels[i * 4] / 255; // R
    tensor[plane + i] = inferencePixels[i * 4 + 1] / 255; // G
    tensor[plane * 2 + i] = inferencePixels[i * 4 + 2] / 255; // B
  }

  return { tensor, letterbox: {
    scaleX: scaledW / bitmap.width, scaleY: scaledH / bitmap.height,
    padX, padY, width: bitmap.width, height: bitmap.height,
  } };
}

// YOLOv8 ONNX output: [1, 4 + numClasses, numAnchors] = [1, 7, 8400].
// Each anchor column is [cx, cy, w, h, classScore0, classScore1, classScore2].
export function decodeDetections(
  output: { dims: readonly number[]; data: ArrayLike<number> },
  letterbox: Letterbox,
  confThreshold: number
): RawBox[] {
  const dims = output.dims; // [1, 7, 8400]
  if (dims.length !== 3 || dims[0] !== 1 || dims[1] !== 4 + CLASS_NAMES.length ||
      !Number.isInteger(dims[2]) || dims[2] <= 0 || output.data.length !== dims[1] * dims[2]) {
    throw new Error('Unsupported detector output: expected [1, 7, anchors] for wall, door and window.');
  }
  if (!Number.isFinite(confThreshold) || confThreshold < 0 || confThreshold > 1) {
    throw new Error('Detection confidence threshold must be between 0 and 1.');
  }
  const numAnchors = dims[2];
  const data = output.data;
  const numClasses = CLASS_NAMES.length;

  const boxes: RawBox[] = [];

  for (let a = 0; a < numAnchors; a++) {
    let bestClass = -1;
    let bestScore = 0;
    for (let c = 0; c < numClasses; c++) {
      const score = data[(4 + c) * numAnchors + a];
      if (Number.isFinite(score) && score <= 1 && score > bestScore) {
        bestScore = score;
        bestClass = c;
      }
    }
    if (bestScore < confThreshold || bestClass < 0) continue;

    const cx = data[0 * numAnchors + a];
    const cy = data[1 * numAnchors + a];
    const w = data[2 * numAnchors + a];
    const h = data[3 * numAnchors + a];
    if (![cx, cy, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;

    // Undo letterbox: model space -> original image space.
    const x0 = Math.max(0, (cx - w / 2 - letterbox.padX) / letterbox.scaleX);
    const y0 = Math.max(0, (cy - h / 2 - letterbox.padY) / letterbox.scaleY);
    const x1 = Math.min(letterbox.width, (cx + w / 2 - letterbox.padX) / letterbox.scaleX);
    const y1 = Math.min(letterbox.height, (cy + h / 2 - letterbox.padY) / letterbox.scaleY);
    if (x1 <= x0 || y1 <= y0) continue;

    boxes.push({ cls: CLASS_NAMES[bestClass], confidence: bestScore, x0, y0, x1, y1 });
  }

  return boxes;
}

function iou(a: RawBox, b: RawBox): number {
  const x0 = Math.max(a.x0, b.x0);
  const y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1);
  const y1 = Math.min(a.y1, b.y1);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
  const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
  return inter / (areaA + areaB - inter);
}

// Per-class greedy NMS.
function nonMaxSuppression(boxes: RawBox[], iouThreshold: number): RawBox[] {
  const kept: RawBox[] = [];
  for (const cls of CLASS_NAMES) {
    const classBoxes = boxes.filter((b) => b.cls === cls).sort((a, b) => b.confidence - a.confidence);
    const used = new Array(classBoxes.length).fill(false);
    for (let i = 0; i < classBoxes.length; i++) {
      if (used[i]) continue;
      kept.push(classBoxes[i]);
      for (let j = i + 1; j < classBoxes.length; j++) {
        if (!used[j] && iou(classBoxes[i], classBoxes[j]) > iouThreshold) used[j] = true;
      }
    }
  }
  return kept;
}

export interface LocalMlResult {
  boxes: RawBox[];
  imageWidth: number;
  imageHeight: number;
}

export async function detectLocalMl(
  source: File | Blob | string,
  options?: { confThreshold?: number; iouThreshold?: number; enhanceImage?: boolean }
): Promise<LocalMlResult> {
  const confThreshold = options?.confThreshold ?? 0.25;
  const iouThreshold = options?.iouThreshold ?? 0.45;

  const bitmap = await loadImageBitmap(source);
  try {
    // The filter is opt-in until it improves the frozen held-out benchmark.
    const { tensor, letterbox } = preprocess(bitmap, options?.enhanceImage === true);

    const session = await getSession();
    const inputTensor = new ort.Tensor('float32', tensor, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const inputName = session.inputNames[0];
    const outputs = await session.run({ [inputName]: inputTensor });
    const output = outputs[session.outputNames[0]];

    const rawBoxes = decodeDetections({ dims: output.dims, data: output.data as Float32Array }, letterbox, confThreshold);
    const boxes = nonMaxSuppression(rawBoxes, iouThreshold);

    return { boxes, imageWidth: bitmap.width, imageHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}
