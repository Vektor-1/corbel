// Sheet-origin helpers.
//
// Corbel stores plan geometry in sheet coordinates whose (0,0) is the CENTER of
// the drawing sheet (plan.width × plan.height in mm), so x ∈ [-W/2, +W/2] and
// y ∈ [-H/2, +H/2] in plan units. Legacy data (pre-center-origin) anchored the
// origin at the sheet's top-left corner; centerizeFloorPlan shifts it.

import type { FloorPlan } from '@/types/design';
import { millimetresPerPixel } from './scale';

export interface PlanCenter {
  x: number;
  y: number;
}

/** The sheet's center expressed in plan units (px). */
export function planCenterPx(plan: FloorPlan | null | undefined): PlanCenter {
  if (!plan) return { x: 0, y: 0 };
  const mmPerPx = millimetresPerPixel(plan.scale);
  return {
    x: plan.width / mmPerPx / 2,
    y: plan.height / mmPerPx / 2,
  };
}

/**
 * Shift every ABSOLUTE plan coordinate by (dx, dy).
 *
 * Door/window `position` is a distance along the host wall, not an absolute
 * coordinate, so it is intentionally left untouched. Only walls, rooms and
 * objects carry sheet-space positions.
 */
export function shiftPlanCoordinates(plan: FloorPlan, dx: number, dy: number): FloorPlan {
  return {
    ...plan,
    walls: plan.walls.map((wall) => ({
      ...wall,
      startPoint: { x: wall.startPoint.x + dx, y: wall.startPoint.y + dy },
      endPoint: { x: wall.endPoint.x + dx, y: wall.endPoint.y + dy },
    })),
    rooms: plan.rooms.map((room) => ({
      ...room,
      vertices: room.vertices.map((point) => ({ x: point.x + dx, y: point.y + dy })),
    })),
    objects: (plan.objects ?? []).map((object) => ({
      ...object,
      position: { x: object.position.x + dx, y: object.position.y + dy },
    })),
  };
}

/** Convert a top-left-anchored legacy plan to the centered sheet convention. */
export function centerizeFloorPlan(plan: FloorPlan): FloorPlan {
  const center = planCenterPx(plan);
  return shiftPlanCoordinates(plan, -center.x, -center.y);
}

/** Reverse of centerizeFloorPlan: shift centered coords back to top-left anchor. */
export function decenterizeFloorPlan(plan: FloorPlan): FloorPlan {
  const center = planCenterPx(plan);
  return shiftPlanCoordinates(plan, center.x, center.y);
}
