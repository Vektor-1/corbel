import * as THREE from 'three';

const WARNING_COLOR = '#f59e0b';

/**
 * Blends a base element colour toward a warning tone as AI-extraction
 * confidence drops, so the "validation" colour preset visually flags
 * uncertain reconstructions without a separate report -- shared by the 2D
 * (Konva) and 3D (Three.js) renderers, since `THREE.Color` is just a colour
 * math utility here, not a rendering dependency. User-authored elements
 * (no confidence value, or confidence 1) are never tinted.
 */
export function tintForConfidence(baseColor: string, confidence: number | undefined): string {
  if (confidence === undefined || confidence >= 1) return baseColor;
  // Capped at 0.7 so even a 0-confidence element still reads as its base
  // role colour, not a flat warning swatch.
  const amount = THREE.MathUtils.clamp(1 - confidence, 0, 1) * 0.7;
  return new THREE.Color(baseColor).lerp(new THREE.Color(WARNING_COLOR), amount).getStyle();
}
