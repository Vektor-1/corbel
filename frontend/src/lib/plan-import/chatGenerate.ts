import type { ReconstructionResultV1, PlanDetection, ImportSource } from './types';
import { extractJson } from './pipeline';
import { parseReconstructionResult } from './validate';
import { resolveRodiumModel } from './rodium-ai';

function client() {
  const key = process.env.RODIUM_AI_API_KEY;
  if (!key) throw new Error('RODIUM_AI_API_KEY is not set.');
  const baseUrl = process.env.RODIUM_AI_BASE_URL || 'https://api.rodiumai.io/v1';
  return { apiKey: key, baseUrl };
}

interface RodiumAIRequest {
  model: string;
  messages: Array<{ role: 'user' | 'system'; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
}

interface RodiumAIResponse {
  choices: Array<{ message: { content: string } }>;
  usage: { prompt_tokens: number; completion_tokens: number };
}

async function makeRodiumRequest(request: RodiumAIRequest): Promise<string> {
  const { apiKey, baseUrl } = client();
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`Rodium AI error (${response.status}): ${await response.text()}`);
  const data = (await response.json()) as RodiumAIResponse;
  return data.choices[0]?.message?.content || '';
}

const MAX_PROMPT_LENGTH = 500;

interface GeneratedPlan {
  walls: Array<{ id: string; start: { x: number; y: number }; end: { x: number; y: number }; thicknessMm: number; role: 'loadBearing' | 'partition' }>;
  rooms: Array<{ id: string; name?: string; polygon: Array<{ x: number; y: number }> }>;
  doors: Array<{ id: string; wallId: string; offsetRatio: number; widthMm: number }>;
  windows: Array<{ id: string; wallId: string; offsetRatio: number; widthMm: number }>;
}

export async function generateFloorPlanFromPrompt(prompt: string): Promise<ReconstructionResultV1> {
  const trimmedPrompt = prompt.trim();

  if (!trimmedPrompt) {
    throw new Error('Please describe a floor plan to generate.');
  }

  if (trimmedPrompt.length > MAX_PROMPT_LENGTH) {
    throw new Error(`Description must be under ${MAX_PROMPT_LENGTH} characters.`);
  }

  const systemPrompt = `You are an architectural floor plan generator. Your task is to generate a 2D floor plan as JSON based on a natural-language description.

COORDINATE SYSTEM:
- All coordinates use a fixed unit where 100 units = 1 metre (so a 4m-wide room = 400 units wide)
- Origin is at (0, 0)
- X increases to the right, Y increases downward
- Walls must form closed, sensible room boundaries

JSON SCHEMA (REQUIRED - output ONLY valid JSON, no prose):
{
  "walls": [
    {
      "id": "w1",
      "start": {"x": 0, "y": 0},
      "end": {"x": 500, "y": 0},
      "thicknessMm": 225,
      "role": "loadBearing"
    }
  ],
  "rooms": [
    {
      "id": "r1",
      "name": "Living Room",
      "polygon": [{"x": 0, "y": 0}, {"x": 500, "y": 0}, ...]
    }
  ],
  "doors": [
    {
      "id": "d1",
      "wallId": "w1",
      "offsetRatio": 0.5,
      "widthMm": 900
    }
  ],
  "windows": [
    {
      "id": "win1",
      "wallId": "w1",
      "offsetRatio": 0.3,
      "widthMm": 1200
    }
  ]
}

INSTRUCTIONS:
1. Generate wall geometries that form closed rooms appropriate to the description
2. Walls must have unique IDs starting with "w" (e.g., w1, w2, w3)
3. Rooms must have unique IDs starting with "r" (e.g., r1, r2, r3) and valid polygon vertices
4. Doors must reference valid wall IDs via wallId field
5. Windows must reference valid wall IDs via wallId field
6. offsetRatio is 0..1 along the wall (0 = start point, 1 = end point)
7. Use realistic room dimensions and wall thicknesses (typical: loadBearing=225mm, partition=115mm)
8. If description is vague, still produce a reasonable small floor plan (do not refuse)
9. Return ONLY the JSON object - no markdown, no prose, no explanation

BE PRAGMATIC: Generate something sensible, even if the description is incomplete.`;

  const userMessage = `Generate a floor plan from this description: ${trimmedPrompt}`;

  try {
    const responseText = await makeRodiumRequest({
      model: resolveRodiumModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.4,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const parsed = extractJson(responseText) as GeneratedPlan;

    // JSON-mode models often omit a key entirely rather than emit an empty
    // array for "no doors here" -- default each to [] so `.map()` below
    // doesn't throw a raw TypeError for an otherwise-valid, sparse response.
    parsed.rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
    parsed.doors = Array.isArray(parsed.doors) ? parsed.doors : [];
    parsed.windows = Array.isArray(parsed.windows) ? parsed.windows : [];

    // A wall missing (or malformed) start/end points is a real, if rare,
    // model mistake -- drop just that wall rather than let one bad entry
    // crash the whole generation with a raw property-access error, or fail
    // parseReconstructionResult's stricter check below for the entire batch.
    const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
    const isValidPoint = (point: unknown): point is { x: number; y: number } =>
      typeof point === 'object' && point !== null && isFiniteNumber((point as { x?: unknown }).x) && isFiniteNumber((point as { y?: unknown }).y);
    const validWalls = Array.isArray(parsed.walls)
      ? parsed.walls.filter((wall) => wall && typeof wall.id === 'string' && isValidPoint(wall.start) && isValidPoint(wall.end))
      : [];

    if (validWalls.length === 0) {
      throw new Error('The AI generated no walls. Try describing the layout more specifically.');
    }
    parsed.walls = validWalls;

    // Compute bounding box with padding
    const PADDING = 200;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const wall of parsed.walls) {
      minX = Math.min(minX, wall.start.x, wall.end.x);
      maxX = Math.max(maxX, wall.start.x, wall.end.x);
      minY = Math.min(minY, wall.start.y, wall.end.y);
      maxY = Math.max(maxY, wall.start.y, wall.end.y);
    }

    const sourceWidth = Math.max(400, maxX - minX + PADDING * 2);
    const sourceHeight = Math.max(400, maxY - minY + PADDING * 2);

    // Build detections array from generated plan
    const detections: PlanDetection[] = [
      ...parsed.walls.map((wall) => ({
        id: wall.id,
        kind: 'wall' as const,
        confidence: 1,
        start: wall.start,
        end: wall.end,
        thicknessMm: wall.thicknessMm,
        role: wall.role,
      })),
      ...parsed.rooms.map((room) => ({
        id: room.id,
        kind: 'room' as const,
        confidence: 1,
        polygon: room.polygon,
        name: room.name,
      })),
      ...parsed.doors.map((door) => ({
        id: door.id,
        kind: 'door' as const,
        confidence: 1,
        wallId: door.wallId,
        offsetRatio: door.offsetRatio,
        widthMm: door.widthMm,
      })),
      ...parsed.windows.map((window) => ({
        id: window.id,
        kind: 'window' as const,
        confidence: 1,
        wallId: window.wallId,
        offsetRatio: window.offsetRatio,
        widthMm: window.widthMm,
      })),
    ];

    const source: ImportSource = {
      kind: 'image',
      fileName: 'ai-generated-plan.png',
      url: '',
      width: sourceWidth,
      height: sourceHeight,
    };

    const result: ReconstructionResultV1 = {
      schemaVersion: 1,
      source,
      scale: { pixelsPerMeter: 100, confidence: 1, method: 'manual' },
      detections,
      overallConfidence: 1,
    };

    // Validate before returning
    return parseReconstructionResult(result);
  } catch (error) {
    if (error instanceof Error) {
      // If it's a JSON parsing error from extractJson or parseReconstructionResult, pass it through
      if (error.message.includes('JSON parse failed') || error.message.includes('Unsupported') || error.message.includes('Invalid')) {
        throw new Error('The AI generated invalid floor plan data. Try a different description.');
      }
      throw error;
    }
    throw new Error('The AI plan generator encountered an error.');
  }
}
