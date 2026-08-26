/**
 * Import pipeline: Photo → Draft.FloorPlan → Canonical.Floor
 *
 * Orchestrates the six reconstruction stages shared by both upload flows
 * (Reconstruct and Trace-to-Learn — the geometry pipeline is identical,
 * only what happens with the resulting Canonical.Floor differs):
 *
 *   P1  Scene analysis        — decode the image, read dimensions
 *   P2  YOLOv8 detection      — in-browser ONNX inference (walls/doors/windows)
 *   P3  Wall-graph refinement — axis-snap, junction-close, overlap-collapse (local)
 *   P4  OCR                   — Gemini reads room labels + dimension text (network, concurrent with P5's input gathering)
 *   P5  Scale calibration     — Gemini estimates pixels-per-metre from OCR'd dimensions
 *   P6  Validate + lift       — assemble Draft.FloorPlan, run liftFloorPlan() to Canonical.Floor
 *
 * P4 and P5 are a single round trip to /api/plan-import/ocr-scale (the route
 * already runs stage4_ocr then stage5_scale server-side), but P3 (local,
 * synchronous) and that round trip are kicked off together so the network
 * call overlaps with local refinement work instead of waiting on it.
 */

import { Draft, Canonical, Source } from '@/types/schema';
import { liftFloorPlan } from '@/lib/refinement/lift';
import { detectLocalMl, type RawBox } from '@/lib/plan-import/local-ml';
import { refineWalls, reattachOpenings } from '@/lib/plan-import/refine';
import type { RawWall, RawOpening } from '@/lib/plan-import/pipeline';
import { OPENING_CONFIDENCE_THRESHOLD, WALL_CONFIDENCE_THRESHOLD } from '@/lib/trace/confidence';
export { WALL_CONFIDENCE_THRESHOLD, OPENING_CONFIDENCE_THRESHOLD } from '@/lib/trace/confidence';

// ── Stage metadata ────────────────────────────────────────────────────────────

export type StageId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

export interface StageProgress {
  stage: StageId;
  label: string;
  percent: number; // cumulative, 0-100
}

export const STAGE_DEFS: readonly StageProgress[] = [
  { stage: 'P1', label: 'Analysing image', percent: 8 },
  { stage: 'P2', label: 'Detecting geometry (YOLOv8, in-browser)', percent: 38 },
  { stage: 'P3', label: 'Refining wall graph', percent: 55 },
  { stage: 'P4', label: 'Reading labels (Gemini OCR)', percent: 75 },
  { stage: 'P5', label: 'Calibrating scale', percent: 88 },
  { stage: 'P6', label: 'Validating and lifting to canonical', percent: 100 },
];

// ── Confidence thresholds (shared with UploadPage highlighting) ──────────────

export const DEFAULT_PIXELS_PER_METRE = 100;

// ── OCR/scale response shape (mirrors /api/plan-import/ocr-scale) ────────────

export interface OcrLabel {
  id: string;
  text: string;
  x: number;
  y: number;
  role: 'room-name' | 'dimension' | 'note';
  valueMm?: number;
}

export interface OcrScaleResponse {
  labels: OcrLabel[];
  scale: { pixelsPerMeter: number; confidence: number; method: 'dimension-ocr' | 'scale-bar' | 'manual' };
}

// ── Options ────────────────────────────────────────────────────────────────

export interface ImportPipelineOptions {
  /** Run Gemini OCR + scale calibration (P4/P5). Default true. */
  useOcr?: boolean;
  /**
   * Publicly-fetchable URL of the already-uploaded source image. Required for
   * OCR — the server-side Gemini call fetches the image by URL. If omitted,
   * P4/P5 are skipped gracefully and a fixed/default scale is used.
   */
  imageUrl?: string;
  ocrEndpoint?: string; // default '/api/plan-import/ocr-scale'
  fetchImpl?: typeof fetch;
  confThreshold?: number;
  iouThreshold?: number;
  /** Pixels-per-metre to use when OCR is skipped or fails. */
  fixedScale?: number;
  ocrTimeoutMs?: number; // default 20_000
}

export interface ImportPipelineResult {
  draft: Draft.FloorPlan;
  canonical: Canonical.Floor;
  warnings: string[];
  ocrFailed: boolean;
  ocrSkipped: boolean;
  metrics?: Record<string, number>;
}

// ── Pure helpers (unit conversion + assembly) — exported for testing ─────────

export function pxToMm(px: number, pixelsPerMetre: number): number {
  return (px / pixelsPerMetre) * 1000;
}

export interface BuildDraftParams {
  id: string;
  walls: RawWall[];
  openings: RawOpening[];
  labels?: OcrLabel[];
  pixelsPerMetre: number;
  scaleConfidence?: number;
  scaleSource?: string;
}

/**
 * Assemble a Draft.FloorPlan from refined wall/opening geometry (pixel space)
 * plus OCR labels and a calibrated scale. Pure — no I/O, safe to unit test.
 */
export function buildDraftFloorPlan(params: BuildDraftParams): Draft.FloorPlan {
  const { id, walls, openings, labels = [], pixelsPerMetre, scaleConfidence, scaleSource } = params;

  const draftWalls: Draft.Wall[] = walls.map((w) => ({
    id: w.id,
    start: { x: pxToMm(w.startX, pixelsPerMetre), y: pxToMm(w.startY, pixelsPerMetre) },
    end: { x: pxToMm(w.endX, pixelsPerMetre), y: pxToMm(w.endY, pixelsPerMetre) },
    thickness: w.thicknessMm,
    confidence: w.confidence,
    source: Source.AI,
  }));

  const draftOpenings: Draft.Opening[] = openings.map((o) => {
    const hostWall = walls.find((w) => w.id === o.wallId);
    const position = hostWall
      ? {
          x: pxToMm(hostWall.startX + (hostWall.endX - hostWall.startX) * o.offsetRatio, pixelsPerMetre),
          y: pxToMm(hostWall.startY + (hostWall.endY - hostWall.startY) * o.offsetRatio, pixelsPerMetre),
        }
      : { x: 0, y: 0 };
    return {
      id: o.id,
      kind: o.kind,
      position,
      width: o.widthMm,
      height: o.kind === 'door' ? 2100 : 1200,
      confidence: o.confidence,
      source: Source.AI,
    };
  });

  const draftLabels: Draft.Label[] = labels.map((l) => {
    const halfW = pxToMm(30, pixelsPerMetre);
    const halfH = pxToMm(15, pixelsPerMetre);
    const cx = pxToMm(l.x, pixelsPerMetre);
    const cy = pxToMm(l.y, pixelsPerMetre);
    return {
      id: l.id,
      text: l.text,
      boundingBox: { min: { x: cx - halfW, y: cy - halfH }, max: { x: cx + halfW, y: cy + halfH } },
      confidence: 0.85,
      kind: l.role === 'room-name' ? 'room_label' : l.role === 'dimension' ? 'dimension' : 'annotation',
      source: Source.AI,
    };
  });

  const confidences = [...draftWalls.map((w) => w.confidence), ...draftOpenings.map((o) => o.confidence)];
  const overallConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : 0;

  const warnings: Draft.ValidationIssue[] = [];
  for (const w of draftWalls) {
    if (w.confidence < WALL_CONFIDENCE_THRESHOLD) {
      warnings.push({
        id: `warn-wall-${w.id}`,
        severity: w.confidence < 0.4 ? 'error' : 'warning',
        message: `Wall ${w.id} detected at low confidence (${Math.round(w.confidence * 100)}%).`,
        elementIds: [w.id],
        suggestion: 'Review thickness and endpoints, or remove if spurious.',
      });
    }
  }
  for (const o of draftOpenings) {
    if (o.confidence < OPENING_CONFIDENCE_THRESHOLD) {
      warnings.push({
        id: `warn-opening-${o.id}`,
        severity: 'warning',
        message: `${o.kind} ${o.id} detected at low confidence (${Math.round(o.confidence * 100)}%).`,
        elementIds: [o.id],
        suggestion: 'Confirm width and position, or remove.',
      });
    }
  }

  return {
    id,
    elevation: 0,
    walls: draftWalls,
    openings: draftOpenings,
    labels: draftLabels,
    scale: {
      pixelsPerMetre,
      source: scaleSource ?? (scaleConfidence !== undefined ? 'ocr-dimension' : 'default-fallback'),
      confidence: scaleConfidence ?? 0.3,
    },
    warnings,
    overallConfidence,
  };
}

/**
 * Apply user-entered overrides (thickness/width/height per element) before
 * re-lifting. Draft carries overrideThickness/overrideWidth/overrideHeight —
 * this folds them into the effective value the lift algorithm consumes.
 */
export function applyDraftOverrides(draft: Draft.FloorPlan): Draft.FloorPlan {
  return {
    ...draft,
    walls: draft.walls.map((w) => ({
      ...w,
      thickness: w.overrideThickness ?? w.thickness,
      confidence: w.overrideConfidence ?? w.confidence,
    })),
    openings: draft.openings.map((o) => ({
      ...o,
      width: o.overrideWidth ?? o.width,
      height: o.overrideHeight ?? o.height,
    })),
  };
}

// ── Orchestrator (browser-only: uses ONNX + fetch + canvas) ──────────────────

/**
 * Run the full P1–P6 pipeline against an uploaded image file and return both
 * the Draft (for review/correction UI) and the lifted Canonical.Floor.
 *
 * Errors are thrown with a "P<n> failed: ..." prefix so the UI can attribute
 * the failure to a stage. OCR failures (VLM timeout, network error, missing
 * imageUrl) degrade gracefully rather than throwing — geometry detection is
 * still usable with a manually-confirmed scale.
 */
export async function runImportPipeline(
  file: File,
  options: ImportPipelineOptions = {},
  onProgress?: (progress: StageProgress) => void
): Promise<ImportPipelineResult> {
  const report = (i: number) => onProgress?.(STAGE_DEFS[i]);
  const metrics: Record<string, number> = {};

  // P1: scene analysis — decode the image, read its dimensions.
  report(0);
  const startP1 = performance.now();
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    bitmap.close();
    metrics['P1'] = performance.now() - startP1;
    console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P1', durationMs: metrics['P1'], success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TELEMETRY] import_pipeline_error`, { stage: 'P1', error: errorMsg });
    throw new Error(
      `P1 failed: unable to decode image (${errorMsg}). ` +
        'Ensure the file is a valid PNG, JPEG, or WebP.'
    );
  }

  // P2: YOLOv8 detection, entirely in-browser via onnxruntime-web wasm.
  report(1);
  const startP2 = performance.now();
  let boxes: RawBox[];
  try {
    const detection = await detectLocalMl(file, {
      confThreshold: options.confThreshold,
      iouThreshold: options.iouThreshold,
    });
    boxes = detection.boxes;
    metrics['P2'] = performance.now() - startP2;
    console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P2', durationMs: metrics['P2'], success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TELEMETRY] import_pipeline_error`, { stage: 'P2', error: errorMsg });
    throw new Error(`P2 failed: ONNX inference error — ${errorMsg}`);
  }
  if (boxes.filter((b) => b.cls === 'wall').length === 0) {
    console.error(`[TELEMETRY] import_pipeline_error`, { stage: 'P2', error: 'No walls detected' });
    throw new Error('P2 failed: no walls detected. Try a clearer, higher-resolution photo.');
  }

  // P3 (local refinement) and P4/P5 (network OCR+scale) run concurrently —
  // P3 has no dependency on OCR output, so we fire both and join.
  report(2);
  const startP3 = performance.now();
  const refinementPromise = Promise.resolve().then(() => {
    const refinedWalls = refineWalls(boxes);
    const openings = reattachOpenings(boxes, refinedWalls);
    const duration = performance.now() - startP3;
    metrics['P3'] = duration;
    console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P3', durationMs: duration, success: true });
    return { refinedWalls, openings };
  });

  const ocrEnabled = options.useOcr !== false && !!options.imageUrl;
  const ocrSkippedForMissingUrl = options.useOcr !== false && !options.imageUrl;
  report(3);
  const startOcr = performance.now();
  const ocrPromise: Promise<{ ocr: OcrScaleResponse | null; ocrFailed: boolean }> = ocrEnabled
    ? runOcrAndScale(file, width, height, options).then((res) => {
        const duration = performance.now() - startOcr;
        metrics['P4'] = duration;
        metrics['P5'] = duration;
        console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P4_P5', durationMs: duration, success: !res.ocrFailed });
        if (res.ocrFailed) {
          console.error(`[TELEMETRY] import_pipeline_error`, { stage: 'P4_P5', error: 'OCR/Scale failed or timed out' });
        }
        return res;
      })
    : Promise.resolve({ ocr: null, ocrFailed: false }).then((res) => {
        metrics['P4'] = 0;
        metrics['P5'] = 0;
        console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P4_P5', durationMs: 0, skipped: true });
        return res;
      });

  const [{ refinedWalls, openings }, { ocr, ocrFailed }] = await Promise.all([refinementPromise, ocrPromise]);

  // P5: scale calibration — already resolved by the OCR round trip; fall
  // back to a fixed/default scale when OCR was skipped or failed.
  report(4);
  const pixelsPerMetre = ocr?.scale.pixelsPerMeter ?? options.fixedScale ?? DEFAULT_PIXELS_PER_METRE;

  // P6: assemble Draft.FloorPlan, then lift to Canonical.Floor.
  report(5);
  const startP6 = performance.now();
  const draft = buildDraftFloorPlan({
    id: `draft_${Date.now()}`,
    walls: refinedWalls,
    openings,
    labels: ocr?.labels,
    pixelsPerMetre,
    scaleConfidence: ocr?.scale.confidence,
    scaleSource: ocr?.scale.method,
  });

  let canonical: Canonical.Floor;
  try {
    canonical = liftFloorPlan(draft);
    metrics['P6'] = performance.now() - startP6;
    console.log(`[METRIC] import_pipeline_stage_duration`, { stage: 'P6', durationMs: metrics['P6'], success: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TELEMETRY] import_pipeline_error`, { stage: 'P6', error: errorMsg });
    throw new Error(`P6 failed: lift algorithm error — ${errorMsg}`);
  }

  const warnings = draft.warnings.map((w) => w.message);
  if (canonical.rooms.length === 0) {
    warnings.push('No enclosed rooms were detected — walls may be disconnected. Check the review panel.');
  }
  if (ocrFailed) {
    warnings.push('OCR/scale calibration timed out or failed — using a default scale. Confirm it manually before accepting.');
  } else if (ocrSkippedForMissingUrl) {
    warnings.push('OCR/scale calibration skipped (image not uploaded to a fetchable URL) — using a default scale.');
  } else if (options.useOcr === false) {
    warnings.push('OCR/scale calibration was turned off — using a default scale. Confirm it manually before accepting.');
  }

  return { draft, canonical, warnings, ocrFailed, ocrSkipped: ocrSkippedForMissingUrl || options.useOcr === false, metrics };
}

async function runOcrAndScale(
  file: File,
  width: number,
  height: number,
  options: ImportPipelineOptions
): Promise<{ ocr: OcrScaleResponse | null; ocrFailed: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.ocrTimeoutMs ?? 20_000);
  try {
    const res = await fetchImpl(options.ocrEndpoint ?? '/api/plan-import/ocr-scale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: { kind: 'image', fileName: file.name, url: options.imageUrl, width, height },
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ocr: null, ocrFailed: true };
    const ocr = (await res.json()) as OcrScaleResponse;
    return { ocr, ocrFailed: false };
  } catch {
    // VLM timeout, network error, or abort — degrade gracefully.
    return { ocr: null, ocrFailed: true };
  } finally {
    clearTimeout(timeout);
  }
}
