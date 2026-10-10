import type { Wall } from '@/types/design';

const DEFAULT_WALL_HEIGHT_M = 2.7;

function pointToSegmentDistance(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq < 1e-9) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * A placed roof object has no host-wall reference (unlike doors/windows, which
 * store a `wallId`) -- it's a free-floating structure-category furniture item.
 * Its resting height is inferred instead from whichever walls are actually
 * underneath it: the tallest wall whose segment passes within a search radius
 * of the roof's own footprint, so the roof clears every wall it covers rather
 * than sitting at a build-time guess of "the" wall height. Falls back to the
 * tallest wall on the floor, then Corbel's default wall height, so a roof
 * dropped on an empty canvas still lands somewhere sane.
 */
export function computeRoofBaseHeightM(
  walls: Wall[],
  roofWorldX: number,
  roofWorldZ: number,
  footprintWidthM: number,
  footprintDepthM: number,
  pixelsPerMetre: number,
): number {
  const searchRadius = (Math.max(footprintWidthM, footprintDepthM) / 2) * 1.5;
  let coveredHeightMm = 0;
  let tallestOnFloorMm = 0;

  for (const wall of walls) {
    tallestOnFloorMm = Math.max(tallestOnFloorMm, wall.height);

    const distance = pointToSegmentDistance(
      roofWorldX,
      roofWorldZ,
      wall.startPoint.x / pixelsPerMetre,
      wall.startPoint.y / pixelsPerMetre,
      wall.endPoint.x / pixelsPerMetre,
      wall.endPoint.y / pixelsPerMetre,
    );
    if (distance <= searchRadius) {
      coveredHeightMm = Math.max(coveredHeightMm, wall.height);
    }
  }

  const heightMm = coveredHeightMm || tallestOnFloorMm;
  return heightMm > 0 ? heightMm / 1000 : DEFAULT_WALL_HEIGHT_M;
}
