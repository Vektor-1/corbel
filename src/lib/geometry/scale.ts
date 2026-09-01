/** Default editor geometry: 100 canvas pixels represent one metre. */
export const DEFAULT_PIXELS_PER_METER = 100;

/**
 * Legacy imports used `1` for scale even though their coordinates were drawn
 * at the editor default. Treat implausible values as the legacy default.
 */
export function pixelsPerMeter(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? 0) >= 20 && (value ?? 0) <= 2_000
    ? value!
    : DEFAULT_PIXELS_PER_METER;
}

export function millimetresPerPixel(value: number | undefined): number {
  return 1_000 / pixelsPerMeter(value);
}
