import { describe, expect, it } from 'vitest';
import { runDetectionPipeline, type AskFn } from '../pipeline';

describe('Trace-to-Learn baseline detection', () => {
  it('asks the vision provider to preserve visible source geometry and flag uncertainty', async () => {
    const prompts: string[] = [];
    const ask: AskFn = async (prompt) => {
      prompts.push(prompt);
      if (prompt.includes('Analyse this architectural floor plan')) {
        return { widthPx: 1200, heightPx: 800, orientation: 'landscape', rotationNeeded: 0, hasScaleBar: false, hasDimensions: false, quality: 'clear', notes: 'clear plan' };
      }
      if (prompt.includes('Detect every wall segment')) {
        return `<svg width="1200" height="800"><line id="w1" x1="0" y1="0" x2="400" y2="0" stroke-width="225" class="loadBearing" data-confidence="0.9" /></svg>`;
      }
      if (prompt.includes('Now detect all doors and windows')) return [];
      if (prompt.includes('Extract all visible text annotations')) return [];
      if (prompt.includes('Estimate the scale')) return { pixelsPerMeter: 100, confidence: 0.8, method: 'manual', notes: 'fixture scale' };
      if (prompt.includes('verify the reconstruction')) return [];
      throw new Error(`Unexpected prompt: ${prompt}`);
    };

    await runDetectionPipeline(ask, {
      kind: 'image',
      fileName: 'reference.png',
      url: 'https://example.test/reference.png',
      width: 1200,
      height: 800,
      purpose: 'trace',
    }, 'trace-test');

    expect(prompts.some((prompt) => prompt.includes('Preserve the source layout faithfully'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('do not treat a plausible guess as confirmed'))).toBe(true);
  });
});
