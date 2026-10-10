import type * as THREE from 'three';
import type { Shading } from '@/lib/viewer/theme';

/** Swaps `meshLambertMaterial` (solid) for `meshStandardMaterial` (rendered)
 * so every procedural-architecture renderer shares one place to change how
 * `shading` affects appearance. `roughness`/`metalness` only apply to the
 * rendered mode -- Lambert has no specular term to tune. */
export function ElementMaterial({
  color,
  shading,
  roughness = 0.85,
  metalness = 0.02,
  transparent,
  opacity,
  side,
}: {
  color: string;
  shading: Shading;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
}) {
  return shading === 'solid' ? (
    <meshLambertMaterial color={color} transparent={transparent} opacity={opacity} side={side} />
  ) : (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      transparent={transparent}
      opacity={opacity}
      side={side}
    />
  );
}
