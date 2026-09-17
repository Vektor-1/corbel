import type * as OrtWebGpu from 'onnxruntime-web/webgpu';
import { loadImageBitmap, type Letterbox } from './local-ml';
import type { SegmentationVector } from './geometry-provider';

// Day 4 of docs/corbel-ship-segmentation-plan.md: real in-browser
// inference for G0. Deliberately NOT merged with local-ml.ts -- the two
// preprocess functions genuinely differ (black padding + no enhancement
// here, vs. white padding + optional enhancement there, matching what
// each model was actually trained/evaluated against), and forcing a
// shared abstraction across two small functions isn't warranted.
//
// onnxruntime-web/webgpu is imported as a TYPE only at module scope, and
// loaded via a runtime dynamic import() instead of a static one: its
// webgpu bundle does import.meta.url-based worker/wasm asset resolution
// at module-evaluation time, which throws ("Invalid URL") when Next.js
// evaluates the module during SSR. A static top-level import (what
// local-ml.ts uses for the plain wasm-only build, which has no such
// eager resolution) pulls it into that SSR evaluation path; a dynamic
// import deferred until this code actually runs in the browser does not.

const MODEL_URL = '/models/corbel-seg-g0.onnx';
export const INPUT_SIZE = 640;

let ortModulePromise: Promise<typeof OrtWebGpu> | null = null;

function getOrt(): Promise<typeof OrtWebGpu> {
  if (!ortModulePromise) {
    ortModulePromise = import('onnxruntime-web/webgpu');
  }
  return ortModulePromise;
}

// Root-caused by direct testing (Day 4, docs/corbel-ship-segmentation-
// plan.md): onnxruntime-web's WebGPU execution provider HANGS (pegs a
// CPU core indefinitely, never throws or resolves) if two session.run()
// calls against the same GPU device overlap -- e.g. React Strict Mode's
// dev-mode double-invoke of a mounting effect firing infer() twice
// concurrently, which is exactly how this was first found. A single,
// non-overlapping call works correctly and fast (~95-125ms, matching Day
// 7's benchmark). A hang can't be caught by try/catch, so every real
// run() call is individually timeout-guarded regardless -- a hasty
// double-click or any other accidental concurrent call in production
// should fall back to WASM instead of hanging the tab, not just the
// known StrictMode case. A single timeout permanently falls back to WASM
// for the rest of the page's lifetime (a "poisoned" WebGPU session is
// not retried).
const WEBGPU_RUN_TIMEOUT_MS = 8000;
const CDN_WASM_PATHS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

let webgpuSessionPromise: Promise<OrtWebGpu.InferenceSession> | null = null;
let wasmSessionPromise: Promise<OrtWebGpu.InferenceSession> | null = null;
let webgpuPoisoned = false;

async function getWasmSession(): Promise<OrtWebGpu.InferenceSession> {
  if (!wasmSessionPromise) {
    wasmSessionPromise = (async () => {
      const ort = await getOrt();
      ort.env.wasm.wasmPaths = CDN_WASM_PATHS;
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
    })().catch((error) => {
      wasmSessionPromise = null;
      throw error;
    });
  }
  return wasmSessionPromise;
}

async function getWebgpuSession(): Promise<OrtWebGpu.InferenceSession | null> {
  if (!webgpuSessionPromise) {
    webgpuSessionPromise = (async () => {
      const ort = await getOrt();
      ort.env.wasm.wasmPaths = CDN_WASM_PATHS;
      return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['webgpu', 'wasm'] });
    })().catch(() => null as unknown as OrtWebGpu.InferenceSession);
  }
  return webgpuSessionPromise;
}

/**
 * Selects a session (WebGPU if available and not yet poisoned, else
 * WASM) and runs inference with the exact fallback-on-hang behavior
 * described above. This is the only way real inference should be
 * invoked -- callers must not call session.run() directly on a session
 * obtained elsewhere, since that has no protection against the
 * confirmed hang.
 */
export async function runSegInference(
  tensorData: Float32Array
): Promise<{ output: OrtWebGpu.Tensor; backend: 'webgpu' | 'wasm' }> {
  const webgpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
  const dims: readonly number[] = [1, 3, INPUT_SIZE, INPUT_SIZE];
  const ort = await getOrt();

  if (webgpuAvailable && !webgpuPoisoned) {
    const session = await getWebgpuSession();
    if (session) {
      try {
        const inputTensor = new ort.Tensor('float32', tensorData, dims);
        const inputName = session.inputNames[0];
        const outputs = await withTimeout(session.run({ [inputName]: inputTensor }), WEBGPU_RUN_TIMEOUT_MS);
        return { output: outputs[session.outputNames[0]], backend: 'webgpu' };
      } catch {
        webgpuPoisoned = true; // don't retry WebGPU for the rest of this page's lifetime
      }
    } else {
      webgpuPoisoned = true; // session creation itself failed
    }
  }

  const wasmSession = await getWasmSession();
  const inputTensor = new ort.Tensor('float32', tensorData, dims);
  const inputName = wasmSession.inputNames[0];
  const outputs = await wasmSession.run({ [inputName]: inputTensor });
  return { output: outputs[wasmSession.outputNames[0]], backend: 'wasm' };
}

/**
 * Centered letterbox into a 640x640 canvas, black-filled (matches
 * albumentations.PadIfNeeded's border_mode=0/fill=0 default, the exact
 * preprocessing G0 was trained and gated against -- confirmed by
 * inspecting the installed albumentations version directly, not
 * assumed). No enhancePlanPixels: neither Python evaluator applies it.
 */
export function preprocess(bitmap: ImageBitmap): { tensor: Float32Array; letterbox: Letterbox } {
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

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(bitmap, padX, padY, scaledW, scaledH);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const tensor = new Float32Array(3 * INPUT_SIZE * INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  for (let i = 0; i < plane; i++) {
    tensor[i] = data[i * 4] / 255;
    tensor[plane + i] = data[i * 4 + 1] / 255;
    tensor[plane * 2 + i] = data[i * 4 + 2] / 255;
  }

  return {
    tensor,
    letterbox: {
      scaleX: scaledW / bitmap.width, scaleY: scaledH / bitmap.height,
      padX, padY, width: bitmap.width, height: bitmap.height,
    },
  };
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export interface SegmentationOutputTensor {
  dims: readonly number[];
  data: ArrayLike<number>;
}

/**
 * Sigmoid + threshold per channel (wall=0, door=1, window=2), same math
 * as ml/evaluate_masks.py's decode. Pure and DOM-free -- the one
 * testable seam in this module, matching local-ml.ts's decodeDetections.
 */
export function decodeSegmentation(
  output: SegmentationOutputTensor,
  threshold = 0.5
): { wallMask: Uint8Array; doorMask: Uint8Array; windowMask: Uint8Array } {
  const dims = output.dims;
  if (dims.length !== 4 || dims[0] !== 1 || dims[1] !== 3) {
    throw new Error('Unsupported segmentation output: expected [1, 3, H, W] for wall, door and window.');
  }
  const height = dims[2];
  const width = dims[3];
  const plane = height * width;
  if (output.data.length !== 3 * plane) {
    throw new Error('Segmentation output data length does not match its declared dims.');
  }

  const wallMask = new Uint8Array(plane);
  const doorMask = new Uint8Array(plane);
  const windowMask = new Uint8Array(plane);
  for (let i = 0; i < plane; i++) {
    wallMask[i] = sigmoid(output.data[i]) > threshold ? 1 : 0;
    doorMask[i] = sigmoid(output.data[plane + i]) > threshold ? 1 : 0;
    windowMask[i] = sigmoid(output.data[plane * 2 + i]) > threshold ? 1 : 0;
  }
  return { wallMask, doorMask, windowMask };
}

/**
 * Maps a SegmentationVector's points (wall polylines, opening centroids
 * and bboxes) from the padded 640x640 letterbox space back to original
 * -image pixel space -- the inverse of the transform `preprocess()`
 * applied, same semantics as local-ml.ts's decodeDetections() undoing
 * its letterbox for boxes. Pure, unit-testable.
 */
export function unletterboxSegmentationVector(vector: SegmentationVector, letterbox: Letterbox): SegmentationVector {
  const unletterboxPoint = ([x, y]: [number, number]): [number, number] => [
    (x - letterbox.padX) / letterbox.scaleX,
    (y - letterbox.padY) / letterbox.scaleY,
  ];

  return {
    imageWidth: letterbox.width,
    imageHeight: letterbox.height,
    walls: vector.walls.map((wall) => ({
      points: wall.points.map(unletterboxPoint),
      thicknessPx: wall.thicknessPx / ((letterbox.scaleX + letterbox.scaleY) / 2),
    })),
    doors: vector.doors.map((opening) => ({
      ...opening,
      centroid: unletterboxPoint(opening.centroid),
      bboxPx: [
        ...unletterboxPoint([opening.bboxPx[0], opening.bboxPx[1]]),
        ...unletterboxPoint([opening.bboxPx[2], opening.bboxPx[3]]),
      ] as [number, number, number, number],
    })),
    windows: vector.windows.map((opening) => ({
      ...opening,
      centroid: unletterboxPoint(opening.centroid),
      bboxPx: [
        ...unletterboxPoint([opening.bboxPx[0], opening.bboxPx[1]]),
        ...unletterboxPoint([opening.bboxPx[2], opening.bboxPx[3]]),
      ] as [number, number, number, number],
    })),
  };
}

export { loadImageBitmap };
