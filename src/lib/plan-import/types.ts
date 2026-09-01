import type { FloorPlan, Point } from '@/types/design';

export type ImportSourceKind = 'image' | 'pdf';
export type ImportJobStatus = 'queued' | 'processing' | 'review' | 'completed' | 'failed';
export type DetectionKind = 'wall' | 'door' | 'window' | 'room' | 'label' | 'dimension';

export interface ImportSource {
  kind: ImportSourceKind;
  fileName: string;
  url: string;
  /** Trace baselines favour faithful reference geometry over speculative completion. */
  purpose?: 'reconstruct' | 'trace';
  page?: number;
  width: number;
  height: number;
}

export interface ScaleEstimate {
  pixelsPerMeter: number;
  confidence: number;
  method: 'dimension-ocr' | 'scale-bar' | 'manual';
  calibratedValueMm?: number;
}

export interface DetectionBase {
  id: string;
  confidence: number;
  accepted?: boolean;
}

export interface DetectedWall extends DetectionBase {
  kind: 'wall';
  start: Point;
  end: Point;
  thicknessMm?: number;
  role?: 'loadBearing' | 'partition';
}

export interface DetectedOpening extends DetectionBase {
  kind: 'door' | 'window';
  wallId: string;
  offsetRatio: number;
  widthMm: number;
  heightMm?: number;
  sillHeightMm?: number;
  swing?: 'left' | 'right';
}

export interface DetectedRoom extends DetectionBase {
  kind: 'room';
  polygon: Point[];
  name?: string;
}

export interface DetectedLabel extends DetectionBase {
  kind: 'label';
  text: string;
  position: Point;
  role: 'room-name' | 'note' | 'unknown';
}

export interface DetectedDimension extends DetectionBase {
  kind: 'dimension';
  start: Point;
  end: Point;
  valueMm: number;
  text: string;
}

export type PlanDetection =
  | DetectedWall
  | DetectedOpening
  | DetectedRoom
  | DetectedLabel
  | DetectedDimension;

export interface ReconstructionResultV1 {
  schemaVersion: 1;
  source: ImportSource;
  scale: ScaleEstimate;
  detections: PlanDetection[];
  overallConfidence: number;
  warnings?: string[];
}

export interface ImportDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  detectionId?: string;
}

export interface PlanImportResult {
  floorPlan: FloorPlan;
  source: ImportSource;
  detections: PlanDetection[];
  diagnostics: ImportDiagnostic[];
  overallConfidence: number;
}

export interface ImportJob {
  id: string;
  status: ImportJobStatus;
  source: ImportSource;
  progress: number;
  providerJobId?: string;
  result?: ReconstructionResultV1;
  error?: string;
  createdAt: string;
  updatedAt: string;
}
