// Compute plan-coordinate bounding boxes for validated elements.
// Used by the validation spotlight overlay to position its cutout, and by
// marquee selection / group scaling to reason about element extents.

import type { DesignObject, FloorPlan, Room, Wall, Door, Window } from '@/types/design';
import { millimetresPerPixel } from './scale';
import { wallQuad } from './wall-joints';
import { pointAlongWall } from './wall-intersections';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';

/** Padding (px) around an element's bounds so the spotlight has breathing room. */
export const SPOTLIGHT_PADDING = 24;

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const toElementBounds = ({ minX, minY, maxX, maxY }: RawBounds): ElementBounds => ({
  x: minX,
  y: minY,
  width: maxX - minX,
  height: maxY - minY,
});

const padded = (bounds: RawBounds): ElementBounds => ({
  x: bounds.minX - SPOTLIGHT_PADDING,
  y: bounds.minY - SPOTLIGHT_PADDING,
  width: bounds.maxX - bounds.minX + SPOTLIGHT_PADDING * 2,
  height: bounds.maxY - bounds.minY + SPOTLIGHT_PADDING * 2,
});

function rawWallBounds(wall: Wall, scale: number | undefined): RawBounds {
  const halfThicknessPx = wall.thickness / 2 / millimetresPerPixel(scale);
  const quad = wallQuad(wall.startPoint, wall.endPoint, halfThicknessPx);
  const points = quad ?? [wall.startPoint, wall.endPoint];
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function rawOpeningBounds(opening: Door | Window, floorPlan: FloorPlan): RawBounds | null {
  const wall = floorPlan.walls.find((w) => w.id === opening.wallId);
  if (!wall) return null;

  const center = pointAlongWall(wall, opening.position.x);
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return { minX: center.x, minY: center.y, maxX: center.x, maxY: center.y };

  const dir = { x: dx / length, y: dy / length };
  const halfWidthPx = opening.width / 2 / millimetresPerPixel(floorPlan.scale);
  const halfThicknessPx = wall.thickness / 2 / millimetresPerPixel(floorPlan.scale);

  // Corners of the opening box: width along the wall, thickness across it.
  const n = { x: -dir.y, y: dir.x };
  const corners = [
    { x: center.x - dir.x * halfWidthPx + n.x * halfThicknessPx, y: center.y - dir.y * halfWidthPx + n.y * halfThicknessPx },
    { x: center.x + dir.x * halfWidthPx + n.x * halfThicknessPx, y: center.y + dir.y * halfWidthPx + n.y * halfThicknessPx },
    { x: center.x + dir.x * halfWidthPx - n.x * halfThicknessPx, y: center.y + dir.y * halfWidthPx - n.y * halfThicknessPx },
    { x: center.x - dir.x * halfWidthPx - n.x * halfThicknessPx, y: center.y - dir.y * halfWidthPx - n.y * halfThicknessPx },
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function rawRoomBounds(room: Room): RawBounds {
  const xs = room.vertices.map((v) => v.x);
  const ys = room.vertices.map((v) => v.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function rawObjectBounds(object: DesignObject): RawBounds | null {
  const asset = OBJECT_CATALOG_BY_ID[object.assetId];
  if (!asset) return null;
  const halfWidth = (asset.dimensions[0] * 100 * object.scale) / 2;
  const halfDepth = (asset.dimensions[2] * 100 * object.scale) / 2;
  // Objects can be rotated; use the rotated corners so the box fully contains the footprint.
  const cos = Math.abs(Math.cos(object.rotation));
  const sin = Math.abs(Math.sin(object.rotation));
  const extentX = halfWidth * cos + halfDepth * sin;
  const extentY = halfWidth * sin + halfDepth * cos;
  return {
    minX: object.position.x - extentX,
    minY: object.position.y - extentY,
    maxX: object.position.x + extentX,
    maxY: object.position.y + extentY,
  };
}

function rawElementBounds(elementId: string, floorPlan: FloorPlan): RawBounds | null {
  const wall = floorPlan.walls.find((w) => w.id === elementId);
  if (wall) return rawWallBounds(wall, floorPlan.scale);

  const door = floorPlan.doors.find((d) => d.id === elementId);
  if (door) return rawOpeningBounds(door, floorPlan);

  const window = floorPlan.windows.find((w) => w.id === elementId);
  if (window) return rawOpeningBounds(window, floorPlan);

  const room = floorPlan.rooms.find((r) => r.id === elementId);
  if (room) return rawRoomBounds(room);

  const object = (floorPlan.objects ?? []).find((o) => o.id === elementId);
  if (object) return rawObjectBounds(object);

  return null;
}

/**
 * Bounding box of a validated element in plan (Konva stage) coordinates,
 * padded for the spotlight overlay. Returns null when the element no longer exists.
 */
export function getElementBounds(elementId: string, floorPlan: FloorPlan | null): ElementBounds | null {
  if (!floorPlan) return null;
  const raw = rawElementBounds(elementId, floorPlan);
  return raw ? padded(raw) : null;
}

/** Unpadded bounds for one element, in plan (Konva stage) coordinates. */
export function getUnpaddedElementBounds(elementId: string, floorPlan: FloorPlan | null): ElementBounds | null {
  if (!floorPlan) return null;
  const raw = rawElementBounds(elementId, floorPlan);
  return raw ? toElementBounds(raw) : null;
}

/** Combined unpadded bounding box across several elements (for a multi-selection). */
export function getCombinedBounds(ids: string[], floorPlan: FloorPlan | null): ElementBounds | null {
  if (!floorPlan) return null;
  const boxes = ids.map((id) => rawElementBounds(id, floorPlan)).filter((b): b is RawBounds => b !== null);
  if (boxes.length === 0) return null;
  const combined: RawBounds = {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
  return toElementBounds(combined);
}

function rectsIntersect(a: ElementBounds, b: ElementBounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Ids of every selectable element whose bounds intersect the given plan-space rectangle (marquee select). */
export function getElementIdsInRect(rect: ElementBounds, floorPlan: FloorPlan | null): string[] {
  if (!floorPlan) return [];
  const candidateIds = [
    ...floorPlan.walls.map((w) => w.id),
    ...floorPlan.rooms.map((r) => r.id),
    ...floorPlan.doors.map((d) => d.id),
    ...floorPlan.windows.map((w) => w.id),
    ...(floorPlan.objects ?? []).map((o) => o.id),
  ];
  return candidateIds.filter((id) => {
    const bounds = getUnpaddedElementBounds(id, floorPlan);
    return bounds !== null && rectsIntersect(rect, bounds);
  });
}
