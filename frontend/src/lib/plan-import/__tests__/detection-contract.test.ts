import { afterEach, describe, expect, it, vi } from 'vitest';
import { stage2_walls, type ImageMeta } from '../pipeline';
import { parseImportSource, parseReconstructionResult } from '../validate';

const meta: ImageMeta = {
  widthPx: 1200, heightPx: 800, orientation: 'landscape', rotationNeeded: 90,
  hasScaleBar: false, hasDimensions: true, quality: 'clear', notes: '',
};

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('wall detection contract', () => {
  it('requests SVG explicitly and preserves signed, decimal and exponential coordinates', async () => {
    const ask = vi.fn(async () => `<svg><line y2 = '2e2' x2='400' y1='-.5' x1='-1e1' id='wall-a'/></svg>`);
    const walls = await stage2_walls(ask, meta, 'test', true);
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('original image frame'), 'svg');
    expect(walls[0]).toMatchObject({ id: 'wall-a', startX: -10, startY: -0.5, endX: 400, endY: 200, confidence: 0.5 });
  });

  it.each([
    '<line id="bad" x1="10" y1="10" x2="400"/>',
    '<line id="bad" x1="10px" y1="10" x2="400" y2="10"/>',
    '<line id="bad" x1="10" y1="10" x2="10" y2="10"/>',
  ])('rejects unusable geometry instead of inventing endpoints: %s', async (svg) => {
    await expect(stage2_walls(async () => svg, meta, 'test', false)).rejects.toThrow('endpoints');
  });

  it('decodes AgentRouter JSON strings and preserves SVG strings', async () => {
    vi.stubEnv('AGENT_ROUTER_API_KEY', 'test');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: '```json\n{"quality":"clear"}\n```' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, result: '<svg />' }) });
    vi.stubGlobal('fetch', fetchMock);
    const { makeAskImageAnalysis } = await import('../agent-router');
    const ask = makeAskImageAnalysis('https://example.test/plan.png');
    expect(await ask('Analyse')).toEqual({ quality: 'clear' });
    expect(await ask('Detect', 'svg')).toBe('<svg />');
  });

});

describe('source and scale contract', () => {
  const source = { kind: 'image', fileName: 'plan.png', url: 'https://example.test/plan.png', width: 1200, height: 800, purpose: 'trace' };
  it('retains trace purpose through payload validation', () => {
    expect(parseImportSource(source).purpose).toBe('trace');
  });
  it.each([0, -1, NaN, Infinity])('rejects invalid calibration %s', (pixelsPerMeter) => {
    expect(() => parseReconstructionResult({
      schemaVersion: 1, source, detections: [], overallConfidence: 0.8,
      scale: { pixelsPerMeter, confidence: 0.8, method: 'manual' },
    })).toThrow('scale');
  });
});
