import type { Wall } from '@/types/design';

export interface PlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  diagonal: number;
}

/** Room footprint bounds in world (metres) space, from plan-pixel wall
 * endpoints. Shared by Roof (sizing/positioning the roof plane) and the
 * camera-framing/orbit-limit logic in SceneContent, so both agree on the
 * same room extent instead of computing it independently. */
export function getPlanBounds(walls: Wall[], pixelsPerMetre: number): PlanBounds | null {
  if (walls.length === 0) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.startPoint.x, wall.endPoint.x);
    maxX = Math.max(maxX, wall.startPoint.x, wall.endPoint.x);
    minZ = Math.min(minZ, wall.startPoint.y, wall.endPoint.y);
    maxZ = Math.max(maxZ, wall.startPoint.y, wall.endPoint.y);
  }

  const width = (maxX - minX) / pixelsPerMetre;
  const depth = (maxZ - minZ) / pixelsPerMetre;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2 / pixelsPerMetre,
    centerZ: (minZ + maxZ) / 2 / pixelsPerMetre,
    width,
    depth,
    diagonal: Math.hypot(width, depth),
  };
}
