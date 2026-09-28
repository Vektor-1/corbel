import * as THREE from 'three';
import type { PlanBounds } from './plan-bounds';

/** Exact "fit to frustum" camera pose for a room's bounding box, at a fixed
 * three-quarter azimuth/elevation (matching this viewer's previous static
 * [14, 11, 14] position, just no longer blind to room size). For every
 * corner of the room's box (footprint x/z, floor-to-wall-top y), computes
 * the minimum camera distance along the view direction that keeps that
 * corner inside the FOV frustum, accounting for aspect ratio, then takes
 * the max across all 8 corners -- so the whole room fits in frame at any
 * size, not just the original hardcoded room this scene was tuned for.
 * Adapted (single-box, no site/item framing) from the corner-fit technique
 * in pascal/packages/viewer/src/lib/hero-pose.ts's heroCameraPose(). */
export function fitCameraToRoom(
  bounds: PlanBounds,
  wallHeightM: number,
  aspect: number,
  {
    fovDeg = 45,
    azimuthRad = Math.PI / 4,
    elevationRad = Math.atan2(11, Math.hypot(14, 14)),
    padding = 1.15,
    minDistance = 4,
  }: { fovDeg?: number; azimuthRad?: number; elevationRad?: number; padding?: number; minDistance?: number } = {},
): { position: [number, number, number]; target: [number, number, number] } {
  const tanVertical = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const tanHorizontal = tanVertical * aspect;

  const dir = new THREE.Vector3(
    Math.sin(azimuthRad) * Math.cos(elevationRad),
    Math.sin(elevationRad),
    Math.cos(azimuthRad) * Math.cos(elevationRad),
  );
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);

  const target = new THREE.Vector3(bounds.centerX, wallHeightM / 2, bounds.centerZ);
  const halfW = bounds.width / 2;
  const halfD = bounds.depth / 2;
  const halfH = wallHeightM / 2;

  let distance = minDistance;
  const offset = new THREE.Vector3();
  for (const x of [-halfW, halfW]) {
    for (const y of [-halfH, halfH]) {
      for (const z of [-halfD, halfD]) {
        offset.set(x, y, z);
        const lateral = offset.dot(right);
        const vertical = offset.dot(up);
        const depth = offset.dot(forward);
        distance = Math.max(
          distance,
          (Math.abs(lateral) / tanHorizontal - depth) * padding,
          (Math.abs(vertical) / tanVertical - depth) * padding,
        );
      }
    }
  }

  return {
    position: [target.x + dir.x * distance, target.y + dir.y * distance, target.z + dir.z * distance],
    target: [target.x, target.y, target.z],
  };
}
