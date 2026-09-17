import { afterEach, expect, it, vi } from 'vitest';
import { runImportPipeline } from '../importPipeline';

vi.mock('@/lib/plan-import/local-ml', () => ({
  detectLocalMl: async () => ({ boxes: [
    { cls: 'wall', x0: 0, y0: 0, x1: 800, y1: 40, confidence: 0.9 },
    { cls: 'door', x0: 300, y0: 0, x1: 480, y1: 40, confidence: 0.9 },
  ], imageWidth: 1000, imageHeight: 800 }),
}));

afterEach(() => vi.unstubAllGlobals());

it.each(['ocr', 'fixed'] as const)('uses the final %s calibration for detected physical sizes', async (mode) => {
  vi.stubGlobal('createImageBitmap', async () => ({ width: 1000, height: 800, close() {} }));
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
    labels: [], scale: { pixelsPerMeter: 200, confidence: 0.9, method: 'dimension-ocr' },
  }), { status: 200 }));
  const result = await runImportPipeline(new File(['fixture'], 'plan.png'), {
    useOcr: mode === 'ocr', imageUrl: 'https://example.test/plan.png',
    fixedScale: mode === 'fixed' ? 200 : 100, fetchImpl,
  });
  expect(result.draft.walls[0].thickness).toBe(200);
  expect(result.draft.openings[0].width).toBe(900);
  expect(result.draft.walls[0].end.x - result.draft.walls[0].start.x).toBe(4000);
});
