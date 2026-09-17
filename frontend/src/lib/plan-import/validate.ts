import type { ImportSource, PlanDetection, ReconstructionResultV1 } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown): value is { x: number; y: number } =>
  isRecord(value) && isNumber(value.x) && isNumber(value.y);

export function parseImportSource(value: unknown): ImportSource {
  if (!isRecord(value)) throw new Error('Invalid import source.');
  if (value.kind !== 'image' && value.kind !== 'pdf') throw new Error('Unsupported source type.');
  if (typeof value.fileName !== 'string' || !value.fileName.trim()) throw new Error('A file name is required.');
  if (typeof value.url !== 'string') throw new Error('A source URL is required.');
  if (!isNumber(value.width) || value.width <= 0 || !isNumber(value.height) || value.height <= 0) {
    throw new Error('Positive source dimensions are required.');
  }

  const source: ImportSource = {
    kind: value.kind,
    fileName: value.fileName,
    url: value.url,
    width: value.width,
    height: value.height,
  };
  if (isNumber(value.page) && value.page >= 1) source.page = Math.floor(value.page);
  if (value.purpose === 'trace' || value.purpose === 'reconstruct') source.purpose = value.purpose;
  return source;
}

function parseDetection(value: unknown): PlanDetection {
  if (!isRecord(value)) throw new Error('Invalid detection.');
  if (typeof value.id !== 'string' || !value.id) throw new Error('Detection id is required.');
  if (!isNumber(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    throw new Error(`Detection ${value.id} has invalid confidence.`);
  }

  const base = { id: value.id, confidence: value.confidence, accepted: value.accepted !== false };

  if (value.kind === 'wall') {
    if (!isPoint(value.start) || !isPoint(value.end)) throw new Error(`Wall ${value.id} needs endpoints.`);
    return {
      ...base,
      kind: 'wall',
      start: value.start,
      end: value.end,
      thicknessMm: isNumber(value.thicknessMm) ? value.thicknessMm : undefined,
      role: value.role === 'partition' ? 'partition' : 'loadBearing',
    };
  }

  if (value.kind === 'door' || value.kind === 'window') {
    if (typeof value.wallId !== 'string' || !isNumber(value.offsetRatio) || !isNumber(value.widthMm)) {
      throw new Error(`Opening ${value.id} is incomplete.`);
    }
    return {
      ...base,
      kind: value.kind,
      wallId: value.wallId,
      offsetRatio: value.offsetRatio,
      widthMm: value.widthMm,
      heightMm: isNumber(value.heightMm) ? value.heightMm : undefined,
      sillHeightMm: isNumber(value.sillHeightMm) ? value.sillHeightMm : undefined,
      swing: value.swing === 'right' ? 'right' : 'left',
    };
  }

  if (value.kind === 'room') {
    if (!Array.isArray(value.polygon) || !value.polygon.every(isPoint)) {
      throw new Error(`Room ${value.id} needs a polygon.`);
    }
    return { ...base, kind: 'room', polygon: value.polygon, name: typeof value.name === 'string' ? value.name : undefined };
  }

  if (value.kind === 'label') {
    if (typeof value.text !== 'string' || !isPoint(value.position)) throw new Error(`Label ${value.id} is incomplete.`);
    const role = value.role === 'room-name' || value.role === 'note' ? value.role : 'unknown';
    return { ...base, kind: 'label', text: value.text, position: value.position, role };
  }

  if (value.kind === 'dimension') {
    if (!isPoint(value.start) || !isPoint(value.end) || !isNumber(value.valueMm) || typeof value.text !== 'string') {
      throw new Error(`Dimension ${value.id} is incomplete.`);
    }
    return { ...base, kind: 'dimension', start: value.start, end: value.end, valueMm: value.valueMm, text: value.text };
  }

  throw new Error(`Unsupported detection kind for ${value.id}.`);
}

export function parseReconstructionResult(value: unknown): ReconstructionResultV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Unsupported reconstruction result.');
  if (!isRecord(value.scale) || !isNumber(value.scale.pixelsPerMeter) || !isNumber(value.scale.confidence)) {
    throw new Error('Invalid scale estimate.');
  }
  if (value.scale.pixelsPerMeter <= 0 || value.scale.confidence < 0 || value.scale.confidence > 1) {
    throw new Error('Invalid scale estimate.');
  }
  if (!Array.isArray(value.detections) || !isNumber(value.overallConfidence)) {
    throw new Error('Invalid reconstruction payload.');
  }

  const method = value.scale.method;
  if (method !== 'dimension-ocr' && method !== 'scale-bar' && method !== 'manual') {
    throw new Error('Invalid scale method.');
  }

  return {
    schemaVersion: 1,
    source: parseImportSource(value.source),
    scale: {
      pixelsPerMeter: value.scale.pixelsPerMeter,
      confidence: value.scale.confidence,
      method,
      calibratedValueMm: isNumber(value.scale.calibratedValueMm) ? value.scale.calibratedValueMm : undefined,
    },
    detections: value.detections.map(parseDetection),
    overallConfidence: value.overallConfidence,
    warnings: Array.isArray(value.warnings) ? value.warnings.filter((item): item is string => typeof item === 'string') : undefined,
  };
}
