import type { ImportJobStatus, ImportSource, ReconstructionResultV1 } from './types';
import { parseReconstructionResult } from './validate';

// A provider supplies an ask function with the plan image already bound.
// It receives a stage prompt and must return parsed JSON.
export type AskFn = (prompt: string) => Promise<unknown>;

// Robust JSON extraction shared by providers whose models may wrap output
// in fences or prose.
export function extractJson(text: string): unknown {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    raw = fence[1].trim();
  } else {
    const s = raw.indexOf('{');
    const sa = raw.indexOf('[');
    const start = s === -1 ? sa : sa === -1 ? s : Math.min(s, sa);
    const e = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    if (start !== -1 && e > start) raw = raw.slice(start, e + 1);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON parse failed at stage. Raw (500): ${text.slice(0, 500)}`);
  }
}

// ── Stage types ───────────────────────────────────────────────────────────────

export interface ImageMeta {
  widthPx: number;
  heightPx: number;
  orientation: 'portrait' | 'landscape' | 'square';
  rotationNeeded: 0 | 90 | 180 | 270;
  hasScaleBar: boolean;
  hasDimensions: boolean;
  quality: 'clear' | 'moderate' | 'poor';
  notes: string;
}

export interface RawWall {
  id: string;
  startX: number; startY: number;
  endX: number; endY: number;
  thicknessMm: number;
  role: 'loadBearing' | 'partition';
  confidence: number;
}

export interface RawOpening {
  id: string;
  kind: 'door' | 'window';
  wallId: string;
  offsetRatio: number;
  widthMm: number;
  heightMm?: number;
  sillHeightMm?: number;
  swing?: 'left' | 'right';
  confidence: number;
}

export interface RawLabel {
  id: string;
  text: string;
  x: number; y: number;
  role: 'room-name' | 'dimension' | 'note';
  valueMm?: number;
}

export interface ScaleResult {
  pixelsPerMeter: number;
  confidence: number;
  method: 'dimension-ocr' | 'scale-bar' | 'manual';
  notes: string;
}

export interface ValidationIssue {
  kind: 'disconnected-wall' | 'door-outside-wall' | 'missing-room' | 'label-mismatch' | 'other';
  elementId: string;
  message: string;
}

// ── Stage 1: Image analysis ───────────────────────────────────────────────────

async function stage1_analyse(ask: AskFn, source: ImportSource, tag: string): Promise<ImageMeta> {
  console.log(`[${tag}] Stage 1: image analysis`);
  const prompt = `Analyse this architectural floor plan image and return a JSON object:
{
  "widthPx": ${source.width},
  "heightPx": ${source.height},
  "orientation": "portrait" | "landscape" | "square",
  "rotationNeeded": 0 | 90 | 180 | 270,
  "hasScaleBar": boolean,
  "hasDimensions": boolean,
  "quality": "clear" | "moderate" | "poor",
  "notes": "brief description of what you see"
}
Return only the JSON object.`;

  const result = await ask(prompt) as ImageMeta;
  console.log(`[${tag}] Stage 1 done:`, result.orientation, 'rotation:', result.rotationNeeded, 'quality:', result.quality);
  return result;
}

// ── Stage 2: Wall skeleton ────────────────────────────────────────────────────

async function stage2_walls(ask: AskFn, meta: ImageMeta, tag: string): Promise<RawWall[]> {
  console.log(`[${tag}] Stage 2: wall detection`);
  const prompt = `This is a floor plan image (${meta.widthPx}×${meta.heightPx}px, quality: ${meta.quality}).
${meta.rotationNeeded !== 0 ? `Note: the image appears rotated ${meta.rotationNeeded}°, interpret coordinates accordingly.` : ''}

Detect every wall segment. Return a JSON array of wall objects:
[{
  "id": "w1",
  "startX": <pixel x>,
  "startY": <pixel y>,
  "endX": <pixel x>,
  "endY": <pixel y>,
  "thicknessMm": <estimated thickness in mm, typically 225 for load-bearing, 115 for partition>,
  "role": "loadBearing" | "partition",
  "confidence": <0.0-1.0>
}]

Rules:
- Use image pixel coordinates, top-left = (0,0).
- Trace each wall as a straight segment between two endpoints.
- Outer/perimeter walls are loadBearing, inner dividers are partition.
- Do not include doors or windows — walls pass straight through openings.
- Return only the JSON array.`;

  const result = await ask(prompt) as RawWall[];
  console.log(`[${tag}] Stage 2 done:`, result.length, 'walls');
  return result;
}

// ── Stage 3: Opening detection ────────────────────────────────────────────────

async function stage3_openings(ask: AskFn, walls: RawWall[], tag: string): Promise<RawOpening[]> {
  console.log(`[${tag}] Stage 3: opening detection`);
  const wallSummary = walls.map(w => `${w.id}: (${w.startX},${w.startY})→(${w.endX},${w.endY})`).join('\n');

  const prompt = `This is a floor plan image. The following walls have been detected:
${wallSummary}

Now detect all doors and windows. Return a JSON array:
[{
  "id": "d1",
  "kind": "door" | "window",
  "wallId": "<id of the wall this opening is in>",
  "offsetRatio": <0.0-1.0, position along the wall from start to end>,
  "widthMm": <width in mm>,
  "heightMm": <height in mm, windows only>,
  "sillHeightMm": <sill height in mm, windows only, typically 900>,
  "swing": "left" | "right",
  "confidence": <0.0-1.0>
}]

Rules:
- A door shows as a gap in the wall with an arc or straight line indicating swing.
- A window shows as a gap with parallel lines or a glazing symbol.
- offsetRatio 0.0 = at the wall start point, 1.0 = at the wall end point.
- Only reference wall IDs from the list above.
- Return only the JSON array.`;

  const result = await ask(prompt) as RawOpening[];
  console.log(`[${tag}] Stage 3 done:`, result.length, 'openings');
  return result;
}

// ── Stage 4: OCR + label mapping ──────────────────────────────────────────────

export async function stage4_ocr(ask: AskFn, tag: string): Promise<RawLabel[]> {
  console.log(`[${tag}] Stage 4: OCR scan`);
  const prompt = `This is a floor plan image. Extract all visible text annotations.
Return a JSON array:
[{
  "id": "l1",
  "text": "<exact text as written>",
  "x": <pixel x of text centre>,
  "y": <pixel y of text centre>,
  "role": "room-name" | "dimension" | "note",
  "valueMm": <numeric value in mm if role is dimension, else omit>
}]

Rules:
- room-name: labels inside rooms (e.g. BEDROOM, KITCHEN, LIVING ROOM).
- dimension: numbers with units or tick marks (e.g. 3600, 4500).
- note: everything else (e.g. SKETCH PLAN, Fig 2, W, D symbols).
- Omit W/D/WC single-letter symbols — they are door/window markers.
- Return only the JSON array.`;

  const result = await ask(prompt) as RawLabel[];
  console.log(`[${tag}] Stage 4 done:`, result.length, 'labels');
  return result;
}

// ── Stage 5: Scale calibration ────────────────────────────────────────────────

export async function stage5_scale(
  ask: AskFn,
  labels: RawLabel[],
  meta: ImageMeta,
  source: ImportSource,
  tag: string
): Promise<ScaleResult> {
  console.log(`[${tag}] Stage 5: scale calibration`);

  const dimensions = labels.filter(l => l.role === 'dimension');
  const dimSummary = dimensions.length
    ? dimensions.map(l => `"${l.text}" at (${l.x},${l.y})${l.valueMm ? ` = ${l.valueMm}mm` : ''}`).join('\n')
    : 'None detected';

  const prompt = `This is a floor plan image (${source.width}×${source.height}px).
${meta.hasScaleBar ? 'A scale bar is visible in the image.' : ''}
${meta.hasDimensions ? 'Dimension annotations are visible.' : ''}

Dimension text found by OCR:
${dimSummary}

Estimate the scale (pixels per meter). Return a JSON object:
{
  "pixelsPerMeter": <number>,
  "confidence": <0.0-1.0>,
  "method": "dimension-ocr" | "scale-bar" | "manual",
  "notes": "<brief explanation>"
}

Rules:
- Use dimension annotations to compute pixels/meter where possible.
- If a dimension says 3600mm and spans X pixels, pixelsPerMeter = X/3.6.
- Typical residential rooms are 3000-5000mm wide.
- If unsure, estimate based on typical room sizes and return low confidence.
- Return only the JSON object.`;

  const result = await ask(prompt) as ScaleResult;
  console.log(`[${tag}] Stage 5 done: scale =`, result.pixelsPerMeter, 'px/m, confidence =', result.confidence);
  return result;
}

// ── Stage 6: Validation rescan ────────────────────────────────────────────────

async function stage6_validate(
  ask: AskFn,
  walls: RawWall[],
  openings: RawOpening[],
  labels: RawLabel[],
  tag: string
): Promise<ValidationIssue[]> {
  console.log(`[${tag}] Stage 6: validation rescan`);

  const summary = {
    walls: walls.length,
    openings: openings.length,
    rooms: labels.filter(l => l.role === 'room-name').map(l => l.text),
    disconnected: walls.filter(w => {
      const eps = 15;
      return !walls.some(other =>
        other.id !== w.id && (
          (Math.abs(other.startX - w.endX) < eps && Math.abs(other.startY - w.endY) < eps) ||
          (Math.abs(other.endX - w.endX) < eps && Math.abs(other.endY - w.endY) < eps)
        )
      );
    }).map(w => w.id),
  };

  const prompt = `This is a floor plan image. A reconstruction has been built:
- ${summary.walls} walls detected
- ${summary.openings} doors/windows detected
- Rooms identified: ${summary.rooms.join(', ') || 'none'}
- Potentially disconnected walls: ${summary.disconnected.join(', ') || 'none'}

Look at the original image and verify the reconstruction. Return a JSON array of issues found:
[{
  "kind": "disconnected-wall" | "door-outside-wall" | "missing-room" | "label-mismatch" | "other",
  "elementId": "<wall/door/label id or empty string>",
  "message": "<what is wrong>"
}]

Return an empty array [] if everything looks correct.
Return only the JSON array.`;

  const result = await ask(prompt) as ValidationIssue[];
  console.log(`[${tag}] Stage 6 done:`, result.length, 'issues');
  return result;
}

// ── Assembly ──────────────────────────────────────────────────────────────────

function assemble(
  source: ImportSource,
  walls: RawWall[],
  openings: RawOpening[],
  labels: RawLabel[],
  scale: ScaleResult,
  issues: ValidationIssue[]
): ReconstructionResultV1 {
  const detections = [
    ...walls.map(w => ({
      id: w.id,
      kind: 'wall' as const,
      confidence: w.confidence,
      start: { x: w.startX, y: w.startY },
      end: { x: w.endX, y: w.endY },
      thicknessMm: w.thicknessMm,
      role: w.role,
    })),
    ...openings.map(o => ({
      id: o.id,
      kind: o.kind,
      confidence: o.confidence,
      wallId: o.wallId,
      offsetRatio: Math.max(0, Math.min(1, o.offsetRatio)),
      widthMm: o.widthMm,
      ...(o.heightMm ? { heightMm: o.heightMm } : {}),
      ...(o.sillHeightMm ? { sillHeightMm: o.sillHeightMm } : {}),
      ...(o.swing ? { swing: o.swing } : {}),
    })),
    ...labels
      .filter(l => l.role === 'room-name')
      .map(l => ({
        id: l.id,
        kind: 'label' as const,
        confidence: 0.88,
        text: l.text,
        position: { x: l.x, y: l.y },
        role: 'room-name' as const,
      })),
  ];

  const confidences = [...walls.map(w => w.confidence), ...openings.map(o => o.confidence)];
  const overallConfidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0.7;

  const warnings = issues.map(i => `[${i.kind}] ${i.message}`);

  const result = {
    schemaVersion: 1 as const,
    source,
    scale: {
      pixelsPerMeter: scale.pixelsPerMeter,
      confidence: scale.confidence,
      method: scale.method,
    },
    detections,
    overallConfidence: Math.round(overallConfidence * 100) / 100,
    warnings,
  };

  return parseReconstructionResult(result);
}

// ── Pipeline runner ───────────────────────────────────────────────────────────

export async function runDetectionPipeline(
  ask: AskFn,
  source: ImportSource,
  tag: string,
  onProgress?: (progress: number) => void
): Promise<ReconstructionResultV1> {
  const STAGE_PROGRESS = { stage1: 10, stage2: 28, stage3: 46, stage5: 78, stage6: 92 } as const;
  const report = (stage: keyof typeof STAGE_PROGRESS) => onProgress?.(STAGE_PROGRESS[stage]);

  report('stage1');
  const meta = await stage1_analyse(ask, source, tag);

  report('stage2');
  const walls = await stage2_walls(ask, meta, tag);
  if (walls.length === 0) throw new Error('No walls detected. Check image quality.');

  report('stage3');
  const [openings, labels] = await Promise.all([
    stage3_openings(ask, walls, tag),
    stage4_ocr(ask, tag),
  ]);

  report('stage5');
  const scale = await stage5_scale(ask, labels, meta, source, tag);

  report('stage6');
  const issues = await stage6_validate(ask, walls, openings, labels, tag);

  return assemble(source, walls, openings, labels, scale, issues);
}

// Lean entry point for the local-ml (YOLO) path: geometry already came from
// the browser-side detector, so only OCR + scale calibration run through the
// VLM. Skips stage1/2/3/6 entirely — cheaper and faster than the full pipeline.
export async function runOcrAndScale(
  ask: AskFn,
  source: ImportSource,
  tag: string
): Promise<{ labels: RawLabel[]; scale: ScaleResult }> {
  const meta: ImageMeta = {
    widthPx: source.width,
    heightPx: source.height,
    orientation: source.width >= source.height ? 'landscape' : 'portrait',
    rotationNeeded: 0,
    hasScaleBar: false,
    hasDimensions: true,
    quality: 'moderate',
    notes: 'Geometry detected locally (YOLO); this call covers OCR and scale only.',
  };

  const labels = await stage4_ocr(ask, tag);
  const scale = await stage5_scale(ask, labels, meta, source, tag);
  return { labels, scale };
}

// ── Shared job store ──────────────────────────────────────────────────────────

const jobs = new Map<string, {
  status: ImportJobStatus;
  progress: number;
  result?: ReconstructionResultV1;
  error?: string;
}>();

export function submitPipelineJob(
  source: ImportSource,
  tag: string,
  makeAsk: (source: ImportSource) => Promise<AskFn>
): string {
  const id = crypto.randomUUID();
  jobs.set(id, { status: 'processing', progress: 5 });

  (async () => {
    const ask = await makeAsk(source);
    const result = await runDetectionPipeline(ask, source, tag, (progress) =>
      jobs.set(id, { ...jobs.get(id)!, progress })
    );
    jobs.set(id, { status: 'review', progress: 100, result });
  })().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : 'Detection failed.';
    console.error(`[${tag}] Pipeline failed:`, message);
    jobs.set(id, { status: 'failed', progress: 100, error: message });
  });

  return id;
}

export function getPipelineJob(id: string) {
  return jobs.get(id) ?? null;
}
