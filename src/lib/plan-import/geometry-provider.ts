import { detectLocalMl, type RawBox } from './local-ml';
import { refineWalls, reattachOpenings } from './refine';
import type { RawWall, RawOpening } from './pipeline';
import type { ImportDiagnostic } from './types';
import { decodeSegmentation, loadImageBitmap, preprocess as preprocessSeg, runSegInference, unletterboxSegmentationVector } from './local-ml-seg';
import { vectorizeMasks } from './vectorize';

// Owns DEFAULT_PIXELS_PER_METRE (moved here from importPipeline.ts, which
// re-exports it for backward compatibility) so importPipeline.ts can
// import detectSegmentationPixelSpace()/segmentationVectorToGeometry()
// from this module without a circular dependency.
export const DEFAULT_PIXELS_PER_METRE = 100;

// Day 6 of docs/corbel-custom-geometry-model-plan.md: a minimal boundary so
// the legacy YOLO-box detector and the experimental segmentation model can
// be compared without entangling their decoders. Both providers produce the
// same RawWall[]/RawOpening[] contract that buildDraftFloorPlan() /
// liftFloorPlan() already consume -- everything downstream is untouched.
//
// Geometry stays in pixel space (RawWall.startX/startY/endX/endY) until OCR
// or a manual scale resolves; only thicknessMm/widthMm are physical-unit
// values at this stage, matching the existing local pipeline's convention
// (see refine.ts's millimetresPerPixel and importPipeline.ts's re-run of
// refineWalls once the final pixelsPerMetre is known).

export type GeometryDiagnostic = ImportDiagnostic;

export interface GeometryOptions {
  confThreshold?: number;
  iouThreshold?: number;
  enhanceImage?: boolean;
  /** Pixels-per-metre used to compute thicknessMm/widthMm before the real
   * scale is known; re-run with the calibrated value once OCR resolves,
   * same pattern as the existing box pipeline in importPipeline.ts. */
  pixelsPerMetre?: number;
}

export interface GeometryArtifactV1 {
  schemaVersion: 1;
  model: { id: string; version: string; backend: 'webgpu' | 'wasm'; inputSize: number };
  source: { width: number; height: number; imageHash?: string };
  walls: RawWall[];
  openings: RawOpening[];
  diagnostics: GeometryDiagnostic[];
  timings: Record<string, number>; // load, preprocess, inference, vectorize
}

export interface GeometryProvider {
  id: 'custom-seg' | 'yolo-box';
  infer(file: File, options?: GeometryOptions): Promise<GeometryArtifactV1>;
}

// ── yolo-box: wraps the existing, already-shipped detector + refinement ─────

export const yoloBoxProvider: GeometryProvider = {
  id: 'yolo-box',

  async infer(file, options = {}) {
    const pixelsPerMetre = options.pixelsPerMetre ?? DEFAULT_PIXELS_PER_METRE;
    const tLoadStart = performance.now();

    const detection = await detectLocalMl(file, {
      confThreshold: options.confThreshold,
      iouThreshold: options.iouThreshold,
      enhanceImage: options.enhanceImage,
    });
    const tInference = performance.now();

    const walls = refineWalls(detection.boxes, pixelsPerMetre);
    const openings = reattachOpenings(detection.boxes, walls, pixelsPerMetre);
    const tVectorize = performance.now();

    const diagnostics: GeometryDiagnostic[] = [];
    if (walls.length === 0) {
      diagnostics.push({ id: 'no-walls', severity: 'error', message: 'No walls detected.' });
    }

    return {
      schemaVersion: 1,
      model: { id: 'corbel-detect', version: 'yolov8n', backend: 'wasm', inputSize: 640 },
      source: { width: detection.imageWidth, height: detection.imageHeight },
      walls,
      openings,
      diagnostics,
      timings: {
        inference: tInference - tLoadStart,
        vectorize: tVectorize - tInference,
        total: tVectorize - tLoadStart,
      },
    };
  },
};

// ── custom-seg: pure conversion logic, real and tested; not yet wired to
// live in-browser inference (that's Day 7's WASM/WebGPU benchmark work) ────

/** Mirrors ml/vectorize.py's WallSegment: a polyline in pixel space plus the
 * mean thickness (px) measured from the mask's distance transform. */
export interface SegWallSegment {
  points: [number, number][];
  thicknessPx: number;
}

/** Mirrors ml/vectorize.py's Opening: an extracted door/window instance,
 * already attached to its nearest wall segment (by index) if any. */
export interface SegOpening {
  cls: 'door' | 'window';
  centroid: [number, number];
  bboxPx: [number, number, number, number];
  hostWallIndex: number | null;
}

export interface SegmentationVector {
  imageWidth: number;
  imageHeight: number;
  walls: SegWallSegment[];
  doors: SegOpening[];
  windows: SegOpening[];
}

function millimetresPerPixel(pixelsPerMetre: number): number {
  if (!Number.isFinite(pixelsPerMetre) || pixelsPerMetre <= 0) {
    throw new Error('A positive pixels-per-metre calibration is required.');
  }
  return 1000 / pixelsPerMetre;
}

function pointLineDistance(
  point: [number, number],
  start: [number, number],
  end: [number, number]
): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared;
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

/** Removes sampling jitter without flattening a real corner in a traced wall. */
function collapseCollinearPoints(points: [number, number][], tolerance = 2): [number, number][] {
  if (points.length <= 2) return points;
  const collapsed: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    if (pointLineDistance(current, collapsed[collapsed.length - 1], next) > tolerance) {
      collapsed.push(current);
    }
  }
  collapsed.push(points[points.length - 1]);
  return collapsed;
}

/**
 * Converts the deterministic vectorizer's output (a polyline per wall,
 * already topologically clean -- no axis-snapping/junction-closing needed
 * the way raw YOLO boxes require, since medial_axis skeleton tracing
 * produces that structure directly) into the same RawWall[]/RawOpening[]
 * contract the box path produces. A multi-point polyline becomes one
 * RawWall per consecutive point pair, since RawWall is a straight 2-point
 * segment.
 */
export function segmentationVectorToGeometry(
  vector: SegmentationVector,
  pixelsPerMetre: number
): { walls: RawWall[]; openings: RawOpening[] } {
  const mmPerPixel = millimetresPerPixel(pixelsPerMetre);

  // Map each original wall index to the ids of the RawWall sub-segments it
  // was split into, plus their pixel-space endpoints, so openings (which
  // reference a wall by its original index) can be re-projected correctly.
  const subSegmentsByWallIndex: { id: string; startX: number; startY: number; endX: number; endY: number }[][] = [];
  const walls: RawWall[] = [];

  vector.walls.forEach((wall, wallIndex) => {
    const subs: (typeof subSegmentsByWallIndex)[number] = [];
    const points = collapseCollinearPoints(wall.points);
    for (let i = 0; i < points.length - 1; i++) {
      const [startX, startY] = points[i];
      const [endX, endY] = points[i + 1];
      if (startX === endX && startY === endY) continue;
      const id = `seg-w${wallIndex}-${i}`;
      walls.push({
        id,
        startX, startY, endX, endY,
        thicknessMm: Math.max(75, Math.round(wall.thicknessPx * mmPerPixel)),
        role: 'partition',
        confidence: 0.6, // segmentation mask has no per-instance detection score; a fixed mid confidence flags it for review like any other model output would
      });
      subs.push({ id, startX, startY, endX, endY });
    }
    subSegmentsByWallIndex.push(subs);
  });

  const openings: RawOpening[] = [];
  let openingIndex = 0;
  for (const opening of [...vector.doors, ...vector.windows]) {
    if (opening.hostWallIndex === null) continue;
    const subs = subSegmentsByWallIndex[opening.hostWallIndex];
    if (!subs || subs.length === 0) continue;

    // Project the opening's centroid onto whichever sub-segment of its host
    // wall it's closest to, to get an offsetRatio along that specific segment.
    let best = { id: '', offsetRatio: 0.5, dist: Infinity };
    for (const seg of subs) {
      const dx = seg.endX - seg.startX;
      const dy = seg.endY - seg.startY;
      const len2 = dx * dx + dy * dy;
      if (len2 <= 0) continue;
      const t = Math.max(0, Math.min(1,
        ((opening.centroid[0] - seg.startX) * dx + (opening.centroid[1] - seg.startY) * dy) / len2
      ));
      const px = seg.startX + t * dx;
      const py = seg.startY + t * dy;
      const dist = Math.hypot(opening.centroid[0] - px, opening.centroid[1] - py);
      if (dist < best.dist) best = { id: seg.id, offsetRatio: t, dist };
    }
    if (!best.id) continue;

    const [x0, y0, x1, y1] = opening.bboxPx;
    const widthPx = Math.max(x1 - x0, y1 - y0);
    openings.push({
      id: `seg-o${openingIndex++}`,
      kind: opening.cls,
      wallId: best.id,
      offsetRatio: best.offsetRatio,
      widthMm: Math.round(widthPx * mmPerPixel),
      confidence: 0.6,
    });
  }

  return { walls, openings };
}

export interface SegPixelSpaceResult {
  vector: SegmentationVector;
  backend: 'webgpu' | 'wasm';
  sourceWidth: number;
  sourceHeight: number;
  timings: { load: number; preprocess: number; inference: number; vectorize: number };
}

/**
 * Day 5 of docs/corbel-ship-segmentation-plan.md: the inference-only half
 * of what customSegProvider.infer() does, without the final scale-
 * dependent segmentationVectorToGeometry() conversion or GeometryArtifactV1
 * wrapping -- exactly mirroring detectLocalMl()'s relationship to
 * refineWalls()/reattachOpenings() for the box path. This is what lets
 * importPipeline.ts run inference once (expensive, ~1-1.7s) and re-derive
 * RawWall[]/RawOpening[] cheaply at whatever pixelsPerMetre OCR eventually
 * resolves, instead of re-running inference or serializing it after the
 * OCR round trip.
 */
export async function detectSegmentationPixelSpace(file: File): Promise<SegPixelSpaceResult> {
  const tLoadStart = performance.now();
  const bitmap = await loadImageBitmap(file);
  const tLoadEnd = performance.now();
  try {
    const { tensor, letterbox } = preprocessSeg(bitmap);
    const tPreprocess = performance.now();

    const { output, backend } = await runSegInference(tensor);
    const tInference = performance.now();

    const { wallMask, doorMask, windowMask } = decodeSegmentation({ dims: output.dims, data: output.data as Float32Array });
    const rawVector = vectorizeMasks(wallMask, doorMask, windowMask, 640, 640);
    const vector = unletterboxSegmentationVector(rawVector, letterbox);
    const tVectorize = performance.now();

    return {
      vector,
      backend,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      timings: {
        load: tLoadEnd - tLoadStart,
        preprocess: tPreprocess - tLoadEnd,
        inference: tInference - tPreprocess,
        vectorize: tVectorize - tInference,
      },
    };
  } finally {
    bitmap.close();
  }
}

export const customSegProvider: GeometryProvider = {
  id: 'custom-seg',

  async infer(file, options = {}) {
    const pixelsPerMetre = options.pixelsPerMetre ?? DEFAULT_PIXELS_PER_METRE;
    const pixelSpace = await detectSegmentationPixelSpace(file);
    const tConvertStart = performance.now();
    const { walls, openings } = segmentationVectorToGeometry(pixelSpace.vector, pixelsPerMetre);
    const tConvertEnd = performance.now();

    const diagnostics: GeometryDiagnostic[] = [];
    if (walls.length === 0) {
      diagnostics.push({ id: 'no-walls', severity: 'error', message: 'No walls detected.' });
    }

    const { load, preprocess, inference, vectorize } = pixelSpace.timings;
    return {
      schemaVersion: 1,
      model: { id: 'corbel-seg-g0', version: 'g0', backend: pixelSpace.backend, inputSize: 640 },
      source: { width: pixelSpace.sourceWidth, height: pixelSpace.sourceHeight },
      walls,
      openings,
      diagnostics,
      timings: {
        load,
        preprocess,
        inference,
        vectorize: vectorize + (tConvertEnd - tConvertStart),
        total: load + preprocess + inference + vectorize + (tConvertEnd - tConvertStart),
      },
    };
  },
};
