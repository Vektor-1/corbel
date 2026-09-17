import { describe, expect, it } from 'vitest';
import { decodeDetections, type Letterbox } from '../local-ml';

const letterbox: Letterbox = { scaleX: 0.5, scaleY: 0.5, padX: 0, padY: 160, width: 1280, height: 640 };
// Anchor columns contain cx, cy, width, height, and three class scores.
function output(anchors: number[][]) {
  return { dims: [1, 7, anchors.length], data: Float32Array.from(
    Array.from({ length: 7 }, (_, row) => anchors.map(anchor => anchor[row])).flat()
  ) };
}

describe('image detector decoding', () => {
  it('maps detections back to the original rectangular image', () => {
    const boxes = decodeDetections(output([[200, 260, 100, 20, 0.9, 0.1, 0.1]]), letterbox, 0.25);
    expect(boxes[0]).toMatchObject({ cls: 'wall', x0: 300, y0: 180, x1: 500, y1: 220 });
  });

  it('discards padding-only detections and clips those crossing the image border', () => {
    const boxes = decodeDetections(output([
      [100, 50, 50, 20, 0.9, 0, 0],
      [10, 170, 40, 40, 0.8, 0, 0],
      [100, 600, 50, 20, 0.9, 0, 0],
    ]), letterbox, 0.25);
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toMatchObject({ x0: 0, y0: 0, x1: 60, y1: 60 });
  });

  it('uses the actual rounded resize on each axis', () => {
    const boxes = decodeDetections(output([[200, 260, 100, 20, 0, 0.9, 0]]), {
      ...letterbox, scaleY: 321 / 641, height: 641,
    }, 0.25);
    expect(boxes[0].y0).toBeCloseTo(90 / (321 / 641));
  });

  it('rejects malformed boxes, scores and detections below threshold', () => {
    const boxes = decodeDetections(output([
      [100, 260, -10, 20, 0.9, 0, 0],
      [NaN, 260, 10, 20, 0.9, 0, 0],
      [100, 260, 10, 20, Infinity, 0, 0],
      [100, 260, 10, 20, 1.2, 0, 0],
      [100, 260, 10, 20, 0.1, 0.2, 0.1],
    ]), letterbox, 0.25);
    expect(boxes).toEqual([]);
  });

  it('fails explicitly if a different model output layout is loaded', () => {
    expect(() => decodeDetections({ dims: [1, 84, 8400], data: [] }, letterbox, 0.25)).toThrow('Unsupported detector output');
  });
});
