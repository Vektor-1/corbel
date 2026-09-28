import type { BuildingSection, FloorPlan, Point, Wall } from '@/types/design';

export interface ElevationWall {
  wallId: string;
  distance: number;
  width: number;
  height: number;
  openingCount: number;
}

export interface GeneratedElevation {
  sectionId: string;
  label: string;
  length: number;
  walls: ElevationWall[];
}

const cross = (first: Point, second: Point) => first.x * second.y - first.y * second.x;

function intersectionDistance(section: BuildingSection, wall: Wall): number | null {
  const r = { x: section.endPoint.x - section.startPoint.x, y: section.endPoint.y - section.startPoint.y };
  const s = { x: wall.endPoint.x - wall.startPoint.x, y: wall.endPoint.y - wall.startPoint.y };
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 0.0001) return null;
  const delta = { x: wall.startPoint.x - section.startPoint.x, y: wall.startPoint.y - section.startPoint.y };
  const t = cross(delta, s) / denominator;
  const u = cross(delta, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t * Math.hypot(r.x, r.y);
}

export function generateElevation(floorPlan: FloorPlan, section: BuildingSection): GeneratedElevation {
  const walls = floorPlan.walls.flatMap((wall) => {
    const distance = intersectionDistance(section, wall);
    if (distance === null) return [];
    return [{
      wallId: wall.id,
      distance,
      width: wall.thickness,
      height: wall.height,
      openingCount: floorPlan.doors.filter((door) => door.wallId === wall.id).length + floorPlan.windows.filter((window) => window.wallId === wall.id).length,
    }];
  }).sort((first, second) => first.distance - second.distance);
  return { sectionId: section.id, label: section.label, length: Math.hypot(section.endPoint.x - section.startPoint.x, section.endPoint.y - section.startPoint.y), walls };
}
