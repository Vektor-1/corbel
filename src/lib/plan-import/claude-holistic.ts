import Anthropic from '@anthropic-ai/sdk';
import type { ImportSource, ReconstructionResultV1 } from './types';
import { extractJson, submitPipelineJob, getPipelineJob, type AskFn, type RawWall, type RawOpening, type RawLabel } from './pipeline';

function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');
  return new Anthropic({ apiKey: key });
}

const MODEL = () => process.env.CLAUDE_MODEL ?? 'claude-sonnet-5';

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status}).`);
  const buffer = await res.arrayBuffer();
  const mediaType = (res.headers.get('content-type') ?? 'image/png').split(';')[0] as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  return {
    data: Buffer.from(buffer).toString('base64'),
    mediaType,
  };
}

const HOLISTIC_PROMPT = `You are a floor plan analysis engine. Extract the complete architectural structure from this floor plan image.

Return ONLY valid JSON (no markdown, no prose, no code blocks):
{
  "walls": [
    {"id": "w1", "start": [x1, y1], "end": [x2, y2], "thickness_px": 10, "role": "loadBearing", "confidence": 0.95}
  ],
  "doors": [
    {"id": "d1", "wall_id": "w1", "position_along_wall": 0.3, "width_px": 36, "swing": "left", "confidence": 0.85}
  ],
  "windows": [
    {"id": "wn1", "wall_id": "w1", "position_along_wall": 0.6, "width_px": 48, "confidence": 0.80}
  ],
  "rooms": [
    {"id": "r1", "name": "Bedroom", "bounded_by": ["w1", "w2", "w3", "w4"], "centroid": [250, 200], "area_px2": 45000, "confidence": 0.88}
  ]
}

RULES - CRITICAL:
1. STRUCTURE-FIRST: Define walls first, then rooms reference wall IDs, then openings attach to walls
2. Walls: line segments with start/end points. Thickness in pixels. role: "loadBearing" (perimeter) or "partition" (interior)
3. Doors/Windows: MUST reference existing wall_id. position_along_wall 0.0-1.0 (start to end of wall)
4. Rooms: MUST list wall IDs that bound it. Rooms must form closed loops (all walls referenced are connected)
5. All coordinates in image pixels, origin top-left
6. Confidence 0.5-1.0 based on clarity in image
7. Return ONLY JSON object, no other text`;

export function makeHolisticAsk(imageData: { data: string; mediaType: string }): AskFn {
  return async (prompt: string) => {
    const anthropic = client();
    const message = await anthropic.messages.create({
      model: MODEL(),
      max_tokens: 8192,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: imageData.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: imageData.data,
              },
            },
            {
              type: 'text',
              text: prompt,
            },
          ],
        },
      ],
      system:
        'You are a floor plan analysis engine. Respond with pure JSON only — no prose, no markdown code blocks, no fenced code blocks. Structure-first: walls before rooms before openings.',
    });

    let text = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        text = block.text;
        break;
      }
    }
    if (!text) throw new Error('Claude API returned no text response.');
    return extractJson(text);
  };
}

interface HolisticOutput {
  walls: Array<{ id: string; start: [number, number]; end: [number, number]; thickness_px: number; role: string; confidence: number }>;
  doors: Array<{ id: string; wall_id: string; position_along_wall: number; width_px: number; swing?: string; confidence: number }>;
  windows: Array<{ id: string; wall_id: string; position_along_wall: number; width_px: number; confidence: number }>;
  rooms: Array<{ id: string; name: string; bounded_by: string[]; centroid: [number, number]; area_px2: number; confidence: number }>;
}

function holisticToRawWalls(output: HolisticOutput, source: ImportSource): RawWall[] {
  return output.walls.map((w) => ({
    id: w.id,
    startX: w.start[0],
    startY: w.start[1],
    endX: w.end[0],
    endY: w.end[1],
    thicknessMm: Math.round((w.thickness_px / source.width) * 2500), // rough estimate: assume 2.5m typical width
    role: (w.role === 'loadBearing' ? 'loadBearing' : 'partition') as 'loadBearing' | 'partition',
    confidence: w.confidence,
  }));
}

function holisticToRawOpenings(output: HolisticOutput): RawOpening[] {
  const openings: RawOpening[] = [];

  output.doors.forEach((d) => {
    openings.push({
      id: d.id,
      kind: 'door',
      wallId: d.wall_id,
      offsetRatio: d.position_along_wall,
      widthMm: Math.round(d.width_px * 25.4), // rough: assume ~1px = 25.4mm
      swing: (d.swing as 'left' | 'right' | undefined) ?? 'left',
      confidence: d.confidence,
    });
  });

  output.windows.forEach((wn) => {
    openings.push({
      id: wn.id,
      kind: 'window',
      wallId: wn.wall_id,
      offsetRatio: wn.position_along_wall,
      widthMm: Math.round(wn.width_px * 25.4),
      confidence: wn.confidence,
    });
  });

  return openings;
}

function holisticToRawLabels(output: HolisticOutput): RawLabel[] {
  return output.rooms.map((r) => ({
    id: r.id,
    text: r.name,
    x: r.centroid[0],
    y: r.centroid[1],
    role: 'room-name' as const,
  }));
}

export async function runClaudeHolisticDetection(source: ImportSource): Promise<ReconstructionResultV1> {
  const imageData = await fetchImageAsBase64(source.url);
  const ask = makeHolisticAsk(imageData);

  const prompt = HOLISTIC_PROMPT;
  const response = (await ask(prompt)) as HolisticOutput;

  // Convert holistic output to pipeline format
  const walls = holisticToRawWalls(response, source);
  const openings = holisticToRawOpenings(response);
  const labels = holisticToRawLabels(response);

  // Simple scale estimate from image dimensions
  const scale = {
    pixelsPerMeter: Math.round((source.width + source.height) / 8), // rough estimate
    confidence: 0.5,
    method: 'manual' as const,
    notes: 'Estimated from image dimensions and typical room sizes',
  };

  // Assemble result (mirrors pipeline.ts assembly logic)
  const detections = [
    ...walls.map((w) => ({
      id: w.id,
      kind: 'wall' as const,
      confidence: w.confidence,
      start: { x: w.startX, y: w.startY },
      end: { x: w.endX, y: w.endY },
      thicknessMm: w.thicknessMm,
      role: w.role,
    })),
    ...openings.map((o) => ({
      id: o.id,
      kind: o.kind,
      confidence: o.confidence,
      wallId: o.wallId,
      offsetRatio: Math.max(0, Math.min(1, o.offsetRatio)),
      widthMm: o.widthMm,
      ...(o.kind === 'window' ? { heightMm: Math.round(o.widthMm * 0.8) } : {}),
      ...(o.swing && o.kind === 'door' ? { swing: o.swing } : {}),
    })),
    ...labels.map((l) => ({
      id: l.id,
      kind: 'label' as const,
      confidence: 0.88,
      text: l.text,
      position: { x: l.x, y: l.y },
      role: 'room-name' as const,
    })),
  ];

  const confidences = [...walls.map((w) => w.confidence), ...openings.map((o) => o.confidence)];
  const overallConfidence = confidences.length ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0.7;

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
    warnings: [],
  };

  // Validate via existing schema
  const { parseReconstructionResult } = await import('./validate');
  return parseReconstructionResult(result);
}

export function submitClaudeHolisticJob(source: ImportSource): string {
  return submitPipelineJob(
    source,
    'claude-holistic',
    async (src) => makeHolisticAsk(await fetchImageAsBase64(src.url))
  );
}

export function getClaudeHolisticJob(id: string) {
  return getPipelineJob(id);
}
