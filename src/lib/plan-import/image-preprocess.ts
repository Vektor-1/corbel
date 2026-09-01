/**
 * Signal-preserving preprocessing for line-drawing detection.
 *
 * The source upload is never changed. This produces a temporary RGB buffer for
 * ONNX inference: robust contrast normalisation makes faded scans legible and a
 * small luminance-only unsharp mask strengthens edges without replacing the
 * drawing with a thresholded (information-losing) black-and-white image.
 */

export interface ImageEnhancementOptions {
  contrastStrength?: number;
  sharpenStrength?: number;
}

const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

function percentileFromHistogram(histogram: Uint32Array, total: number, percentile: number): number {
  const target = total * percentile;
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value++) {
    cumulative += histogram[value];
    if (cumulative >= target) return value;
  }
  return 255;
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/**
 * Return an enhanced copy of RGBA pixels. The 2nd/98th luminance percentiles
 * prevent a few paper highlights or black annotations from dominating the
 * contrast window. Alpha is copied unchanged.
 */
export function enhancePlanPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  options: ImageEnhancementOptions = {}
): Uint8ClampedArray {
  if (pixels.length !== width * height * 4) throw new Error('Pixel buffer dimensions do not match image dimensions.');

  const contrastStrength = options.contrastStrength ?? 0.65;
  const sharpenStrength = options.sharpenStrength ?? 0.45;
  const histogram = new Uint32Array(256);
  const luma = new Float32Array(width * height);

  for (let index = 0; index < luma.length; index++) {
    const offset = index * 4;
    const value = luminance(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    luma[index] = value;
    histogram[Math.round(value)]++;
  }

  const low = percentileFromHistogram(histogram, luma.length, 0.02);
  const high = percentileFromHistogram(histogram, luma.length, 0.98);
  // A nearly uniform image has no recoverable edge signal; return an exact copy.
  if (high - low < 8) return new Uint8ClampedArray(pixels);

  const normalised = new Float32Array(luma.length);
  for (let index = 0; index < luma.length; index++) {
    const stretched = clampByte(((luma[index] - low) * 255) / (high - low));
    normalised[index] = luma[index] * (1 - contrastStrength) + stretched * contrastStrength;
  }

  const output = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const offset = index * 4;
      let neighbourTotal = 0;
      let neighbourCount = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        neighbourTotal += normalised[ny * width + nx];
        neighbourCount++;
      }

      const localAverage = neighbourTotal / Math.max(1, neighbourCount);
      const enhancedLuma = clampByte(normalised[index] + sharpenStrength * (normalised[index] - localAverage));
      // Apply only the luminance delta to retain the source colour relationships.
      const delta = enhancedLuma - luma[index];
      output[offset] = clampByte(pixels[offset] + delta);
      output[offset + 1] = clampByte(pixels[offset + 1] + delta);
      output[offset + 2] = clampByte(pixels[offset + 2] + delta);
      output[offset + 3] = pixels[offset + 3];
    }
  }

  return output;
}
