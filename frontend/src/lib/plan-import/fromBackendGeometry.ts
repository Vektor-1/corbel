import type { ImportSource } from './types';
import type { PlanDetection, ReconstructionResultV1 } from './types';

// Shape of backend/app/fusion.py's Segment-based output as returned by
// GET /v1/inference-jobs/{id} -> result.geometry. Field names already match
// this file's DetectedWall/DetectedOpening one-for-one, so this is a
// straight mapping, not a transform.
export interface BackendWall {
  id: string;
  kind: 'wall';
  confidence: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  thicknessMm?: number;
  thicknessPx?: number;
  role?: 'loadBearing' | 'partition';
}

export interface BackendOpening {
  id: string;
  kind: 'door' | 'window';
  confidence: number;
  wallId: string;
  offsetRatio: number;
  widthMm?: number;
  widthPx?: number;
  heightMm?: number | null;
  sillHeightMm?: number | null;
  swing?: 'left' | 'right';
}

export interface BackendGeometry {
  walls: BackendWall[];
  openings: BackendOpening[];
}

// Matches /api/plan-import/ocr-scale's response shape (runGeminiOcrAndScale).
export interface OcrScaleResult {
  labels: { id: string; text: string; x: number; y: number; role: 'room-name' | 'dimension' | 'note' }[];
  scale: { pixelsPerMeter: number; confidence: number; method: 'dimension-ocr' | 'scale-bar' | 'manual' };
}

function pixelsToMillimetres(valuePx: number, pixelsPerMeter: number): number {
  return Math.round((valuePx * 1000) / pixelsPerMeter);
}

function resolveMeasurementMm(
  valueMm: number | undefined,
  valuePx: number | undefined,
  pixelsPerMeter: number,
  name: string
): number {
  if (typeof valuePx === 'number' && Number.isFinite(valuePx) && valuePx > 0) {
    return pixelsToMillimetres(valuePx, pixelsPerMeter);
  }
  if (typeof valueMm === 'number' && Number.isFinite(valueMm) && valueMm > 0) return valueMm;
  throw new Error(`Backend ${name} is missing a valid pixel or millimetre measurement.`);
}

/**
 * Assembles a ReconstructionResultV1 from the self-hosted backend's geometry
 * plus Corbel's existing (unmodified) OCR/scale call -- the backend never
 * computes scale itself, so this is the merge point. Once built, the result
 * feeds straight into the existing reconstructFloorPlan(), same as the
 * hosted-vision-LLM path.
 */
export function fromBackendGeometry(
  source: ImportSource,
  geometry: BackendGeometry,
  ocr: OcrScaleResult
): ReconstructionResultV1 {
  const detections: PlanDetection[] = [
    ...geometry.walls.map(
      (w): PlanDetection => ({
        id: w.id,
        kind: 'wall',
        confidence: w.confidence,
        start: w.start,
        end: w.end,
        thicknessMm: w.thicknessPx === undefined
          ? w.thicknessMm
          : resolveMeasurementMm(undefined, w.thicknessPx, ocr.scale.pixelsPerMeter, `wall ${w.id} thickness`),
        role: w.role ?? 'partition',
      })
    ),
    ...geometry.openings.map(
      (o): PlanDetection => ({
        id: o.id,
        kind: o.kind,
        confidence: o.confidence,
        wallId: o.wallId,
        offsetRatio: Math.max(0, Math.min(1, o.offsetRatio)),
        widthMm: resolveMeasurementMm(o.widthMm, o.widthPx, ocr.scale.pixelsPerMeter, `opening ${o.id} width`),
        heightMm: o.heightMm ?? undefined,
        sillHeightMm: o.sillHeightMm ?? undefined,
        swing: o.swing,
      })
    ),
    ...ocr.labels
      .filter((label) => label.role === 'room-name')
      .map(
        (label): PlanDetection => ({
          id: label.id,
          kind: 'label',
          confidence: 0.85,
          text: label.text,
          position: { x: label.x, y: label.y },
          role: 'room-name',
        })
      ),
  ];

  const confidences = [
    ...geometry.walls.map((w) => w.confidence),
    ...geometry.openings.map((o) => o.confidence),
  ];
  const overallConfidence = confidences.length
    ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 100) / 100
    : 0.7;

  return {
    schemaVersion: 1,
    source,
    scale: ocr.scale,
    detections,
    overallConfidence,
  };
}
