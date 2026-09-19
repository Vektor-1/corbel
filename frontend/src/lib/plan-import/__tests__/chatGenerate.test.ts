import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateFloorPlanFromPrompt } from '../chatGenerate';

/**
 * `generateFloorPlanFromPrompt` is the one part of the AI-chat-creates-plans
 * feature that talks to a real external LLM. These tests mock `fetch`
 * entirely (no network calls) and focus on two things: that a well-formed
 * response is mapped into a valid `ReconstructionResultV1`, and that the
 * function degrades to a clear, user-facing error message rather than a raw
 * technical one for every plausible way a JSON-mode model's output can be
 * slightly wrong (a missing key, a malformed wall, non-JSON prose, etc.).
 */

const ORIGINAL_ENV = { ...process.env };

function setEnv(overrides: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function mockFetchOnce(body: unknown, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function rodiumResponse(content: string) {
  return { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } };
}

beforeEach(() => {
  setEnv({ RODIUM_AI_API_KEY: 'test-key', RODIUM_AI_BASE_URL: undefined, RODIUM_AI_MODEL: undefined });
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe('generateFloorPlanFromPrompt — input validation', () => {
  it('rejects an empty prompt without calling the network', async () => {
    const fetchMock = mockFetchOnce(rodiumResponse('{}'));
    await expect(generateFloorPlanFromPrompt('   ')).rejects.toThrow(/describe a floor plan/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a prompt over the length limit without calling the network', async () => {
    const fetchMock = mockFetchOnce(rodiumResponse('{}'));
    await expect(generateFloorPlanFromPrompt('x'.repeat(501))).rejects.toThrow(/under 500 characters/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generateFloorPlanFromPrompt — configuration', () => {
  it('rejects clearly when RODIUM_AI_API_KEY is not set, rather than an unhandled exception', async () => {
    setEnv({ RODIUM_AI_API_KEY: undefined });
    mockFetchOnce(rodiumResponse('{}'));
    await expect(generateFloorPlanFromPrompt('a small studio apartment')).rejects.toThrow(
      /RODIUM_AI_API_KEY/
    );
  });
});

describe('generateFloorPlanFromPrompt — successful generation', () => {
  it('maps a well-formed model response into a valid ReconstructionResultV1', async () => {
    mockFetchOnce(
      rodiumResponse(
        JSON.stringify({
          walls: [
            { id: 'w1', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thicknessMm: 225, role: 'loadBearing' },
            { id: 'w2', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thicknessMm: 225, role: 'loadBearing' },
          ],
          rooms: [{ id: 'r1', name: 'Studio', polygon: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }] }],
          doors: [{ id: 'd1', wallId: 'w1', offsetRatio: 0.5, widthMm: 900 }],
          windows: [{ id: 'win1', wallId: 'w2', offsetRatio: 0.5, widthMm: 1200 }],
        })
      )
    );

    const result = await generateFloorPlanFromPrompt('a small one-room studio');

    expect(result.schemaVersion).toBe(1);
    expect(result.scale).toEqual({ pixelsPerMeter: 100, confidence: 1, method: 'manual' });
    const kinds = result.detections.map((d) => d.kind).sort();
    expect(kinds).toEqual(['door', 'room', 'wall', 'wall', 'window']);
    expect(result.detections.find((d) => d.id === 'd1')).toMatchObject({ kind: 'door', wallId: 'w1' });
  });

  it('computes source width/height from the walls bounding box plus padding', async () => {
    mockFetchOnce(
      rodiumResponse(
        JSON.stringify({
          walls: [{ id: 'w1', start: { x: 100, y: 100 }, end: { x: 500, y: 100 }, thicknessMm: 225, role: 'loadBearing' }],
        })
      )
    );

    const result = await generateFloorPlanFromPrompt('a single wall');

    // bounding box is x:[100,500] y:[100,100], padding is 200 on each side.
    expect(result.source.width).toBe(500 - 100 + 400);
    expect(result.source.height).toBeGreaterThanOrEqual(400); // floored at the 400 minimum
  });

  it('succeeds when the model omits rooms/doors/windows keys entirely, not just empty arrays', async () => {
    // Regression test: an earlier version of this function called .map() on
    // these without a null-check and threw a raw TypeError here.
    mockFetchOnce(
      rodiumResponse(JSON.stringify({ walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 300, y: 0 } }] }))
    );

    const result = await generateFloorPlanFromPrompt('a single wall, nothing else');
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].kind).toBe('wall');
  });

  it('drops a malformed wall (missing endpoint) but still succeeds using the remaining valid walls', async () => {
    // Regression test: a wall with a missing/invalid start or end point used
    // to crash the bounding-box computation with a raw property-access error
    // before reaching the friendlier validation layer.
    mockFetchOnce(
      rodiumResponse(
        JSON.stringify({
          walls: [
            { id: 'w1', start: { x: 0, y: 0 }, end: { x: 300, y: 0 } },
            { id: 'w2', start: { x: 300, y: 0 } }, // missing `end`
          ],
        })
      )
    );

    const result = await generateFloorPlanFromPrompt('two walls, one malformed');
    expect(result.detections).toHaveLength(1);
    expect(result.detections[0].id).toBe('w1');
  });
});

describe('generateFloorPlanFromPrompt — model output failures degrade to clear messages', () => {
  it('rejects with a specific message when the model returns zero walls', async () => {
    mockFetchOnce(rodiumResponse(JSON.stringify({ walls: [] })));
    await expect(generateFloorPlanFromPrompt('nothing describable')).rejects.toThrow(/generated no walls/i);
  });

  it('rejects with a friendly message, not a raw parser error, for non-JSON prose output', async () => {
    mockFetchOnce(rodiumResponse('Sorry, I cannot generate that as JSON.'));
    await expect(generateFloorPlanFromPrompt('a house')).rejects.toThrow(/invalid floor plan data/i);
  });

  it('rejects with a friendly message when every wall is malformed', async () => {
    mockFetchOnce(rodiumResponse(JSON.stringify({ walls: [{ id: 'w1' }] })));
    await expect(generateFloorPlanFromPrompt('a house')).rejects.toThrow(/generated no walls/i);
  });

  it('surfaces an HTTP error from the provider without an unhandled rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('server error', { status: 500 })));
    await expect(generateFloorPlanFromPrompt('a house')).rejects.toThrow();
  });
});
