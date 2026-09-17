/**
 * Grid snapping and geometry utilities.
 * Imported by roomTool and CanvasEditor for snap-to-grid behavior.
 * Adapted from Pascal Editor's wall-snap-geometry with extended priority modes.
 */

export const GRID_SIZE = 100; // mm
export const ENDPOINT_SNAP_DISTANCE = 16; // px
export const MIDPOINT_SNAP_DISTANCE = 12; // px
export const CROSSING_SNAP_DISTANCE = 12; // px
export const WALL_BODY_SNAP_DISTANCE = 10; // px
export const ANGLE_LOCK_STEP = 15; // degrees

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function pointInBounds(
  point: { x: number; y: number },
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectangleCollision(
  rect1: { x: number; y: number; width: number; height: number },
  rect2: { x: number; y: number; width: number; height: number }
): boolean {
  return !(
    rect1.x + rect1.width < rect2.x ||
    rect2.x + rect2.width < rect1.x ||
    rect1.y + rect1.height < rect2.y ||
    rect2.y + rect2.height < rect1.y
  );
}

export function distanceToPoint(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

export function distanceSquared(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return dx * dx + dy * dy;
}

export interface Wall {
  startPoint: { x: number; y: number };
  endPoint: { x: number; y: number };
  id?: string;
}

/** Snap result with extended priority modes. */
export type PlanSnapKind = 'endpoint' | 'midpoint' | 'crossing' | 'angle' | 'wall' | 'axis' | 'grid';

export interface PlanSnapOptions {
  /** Grid spacing in the current canvas coordinate system. */
  gridSize: number;
  /** Existing walls for special-point detection (endpoints, midpoints, crossings, body snaps). */
  walls?: readonly Wall[];
  /** Existing wall endpoints. A hit takes priority over the grid. */
  endpoints?: readonly { x: number; y: number }[];
  endpointTolerance?: number;
  /** The first point of a new wall. Near-horizontal/vertical gestures align to it. */
  axisOrigin?: { x: number; y: number };
  axisTolerance?: number;
  /** Enable angle-lock snapping to 15° increments from axisOrigin. */
  angleLock?: boolean;
  /** Wall ID to exclude from snap detection (for the current wall being drawn). */
  excludeWallId?: string;
}

/** Compute the midpoint of a wall. */
export function wallMidpoint(wall: Wall): { x: number; y: number } {
  return {
    x: (wall.startPoint.x + wall.endPoint.x) / 2,
    y: (wall.startPoint.y + wall.endPoint.y) / 2,
  };
}

/** Project a point onto a line segment. Returns null if projection is outside segment bounds. */
export function projectPointOntoWall(
  point: { x: number; y: number },
  wall: Wall,
): { x: number; y: number } | null {
  const { startPoint: p1, endPoint: p2 } = wall;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared < 1e-6) return null;

  const t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSquared;
  if (t < 0 || t > 1) return null;

  return {
    x: p1.x + dx * t,
    y: p1.y + dy * t,
  };
}

/** Find intersection of two line segments. */
export function segmentIntersection(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } | null {
  const ax = a2.x - a1.x;
  const ay = a2.y - a1.y;
  const bx = b2.x - b1.x;
  const by = b2.y - b1.y;
  const denom = ax * by - ay * bx;

  if (Math.abs(denom) < 1e-6) return null; // parallel / collinear

  const dx = b1.x - a1.x;
  const dy = b1.y - a1.y;
  const t = (dx * by - dy * bx) / denom;
  const u = (dx * ay - dy * ax) / denom;

  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: a1.x + ax * t,
    y: a1.y + ay * t,
  };
}

/** Find nearest endpoint snap from raw cursor position. */
function findEndpointSnap(
  point: { x: number; y: number },
  walls: readonly Wall[],
  tolerance: number,
  excludeWallId?: string,
): { point: { x: number; y: number }; wallIds: string[] } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  const hitWallIds: Set<string> = new Set();

  for (const wall of walls) {
    if (excludeWallId && wall.id === excludeWallId) continue;

    for (const corner of [wall.startPoint, wall.endPoint]) {
      const d = distanceToPoint(point, corner);
      if (d <= tolerance && d < bestDistance) {
        best = corner;
        bestDistance = d;
        hitWallIds.clear();
        if (wall.id) hitWallIds.add(wall.id);
      } else if (d === bestDistance && d <= tolerance && wall.id) {
        hitWallIds.add(wall.id);
      }
    }
  }

  return best ? { point: best, wallIds: Array.from(hitWallIds) } : null;
}

/** Find nearest midpoint snap from raw cursor position. */
function findMidpointSnap(
  point: { x: number; y: number },
  walls: readonly Wall[],
  tolerance: number,
  excludeWallId?: string,
): { point: { x: number; y: number }; wallIds: string[] } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  const hitWallIds: Set<string> = new Set();

  for (const wall of walls) {
    if (excludeWallId && wall.id === excludeWallId) continue;

    const mid = wallMidpoint(wall);
    const d = distanceToPoint(point, mid);
    if (d <= tolerance && d < bestDistance) {
      best = mid;
      bestDistance = d;
      hitWallIds.clear();
      if (wall.id) hitWallIds.add(wall.id);
    } else if (d === bestDistance && d <= tolerance && wall.id) {
      hitWallIds.add(wall.id);
    }
  }

  return best ? { point: best, wallIds: Array.from(hitWallIds) } : null;
}

/** Find nearest crossing snap from raw cursor position. */
function findCrossingSnap(
  point: { x: number; y: number },
  walls: readonly Wall[],
  tolerance: number,
  excludeWallId?: string,
): { point: { x: number; y: number }; wallIds: string[] } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  const hitWallIds: Set<string> = new Set();

  for (let i = 0; i < walls.length; i++) {
    const wall1 = walls[i];
    if (excludeWallId && wall1.id === excludeWallId) continue;

    for (let j = i + 1; j < walls.length; j++) {
      const wall2 = walls[j];
      if (excludeWallId && wall2.id === excludeWallId) continue;

      const crossing = segmentIntersection(
        wall1.startPoint,
        wall1.endPoint,
        wall2.startPoint,
        wall2.endPoint,
      );
      if (!crossing) continue;

      const d = distanceToPoint(point, crossing);
      if (d <= tolerance && d < bestDistance) {
        best = crossing;
        bestDistance = d;
        hitWallIds.clear();
        if (wall1.id) hitWallIds.add(wall1.id);
        if (wall2.id) hitWallIds.add(wall2.id);
      } else if (d === bestDistance && d <= tolerance) {
        if (wall1.id) hitWallIds.add(wall1.id);
        if (wall2.id) hitWallIds.add(wall2.id);
      }
    }
  }

  return best ? { point: best, wallIds: Array.from(hitWallIds) } : null;
}

/** Find nearest wall body snap from raw cursor position. */
function findWallBodySnap(
  point: { x: number; y: number },
  walls: readonly Wall[],
  tolerance: number,
  excludeWallId?: string,
): { point: { x: number; y: number }; wallIds: string[] } | null {
  let best: { x: number; y: number } | null = null;
  let bestDistance = Infinity;
  const hitWallIds: Set<string> = new Set();

  for (const wall of walls) {
    if (excludeWallId && wall.id === excludeWallId) continue;

    const projected = projectPointOntoWall(point, wall);
    if (!projected) continue;

    const d = distanceToPoint(point, projected);
    if (d <= tolerance && d < bestDistance) {
      best = projected;
      bestDistance = d;
      hitWallIds.clear();
      if (wall.id) hitWallIds.add(wall.id);
    } else if (d === bestDistance && d <= tolerance && wall.id) {
      hitWallIds.add(wall.id);
    }
  }

  return best ? { point: best, wallIds: Array.from(hitWallIds) } : null;
}

/** Snap a point to the nearest 15° angle increment from origin. */
function snapToAngle(
  point: { x: number; y: number },
  origin: { x: number; y: number },
): { x: number; y: number } {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.1) return point;

  const angleRad = Math.atan2(dy, dx);
  const angleDeg = (angleRad * 180) / Math.PI;
  const snappedAngleDeg = Math.round(angleDeg / ANGLE_LOCK_STEP) * ANGLE_LOCK_STEP;
  const snappedAngleRad = (snappedAngleDeg * Math.PI) / 180;

  return {
    x: origin.x + distance * Math.cos(snappedAngleRad),
    y: origin.y + distance * Math.sin(snappedAngleRad),
  };
}

/**
 * Snap editor geometry predictably: preserve exact shared junctions first,
 * then help the student draw precisely with extended priority modes.
 * Priority: endpoint → midpoint → crossing → angle(if locked) → wall-body → axis → grid.
 */
export function snapPlanPoint(
  point: { x: number; y: number },
  options: PlanSnapOptions,
): { point: { x: number; y: number }; kind: PlanSnapKind } {
  const tolerance = options.endpointTolerance ?? ENDPOINT_SNAP_DISTANCE;
  const walls = options.walls ?? [];
  const excludeWallId = options.excludeWallId;

  // Priority 1: Endpoint snap (strongest intent — closing a polygon or attaching to a corner)
  // `endpoints` supports callers that have geometry points but not complete Wall records.
  const explicitEndpoint = (options.endpoints ?? [])
    .map((endpoint) => ({ endpoint, distance: distanceToPoint(point, endpoint) }))
    .filter((candidate) => candidate.distance <= tolerance)
    .sort((a, b) => a.distance - b.distance)[0];
  if (explicitEndpoint) return { point: explicitEndpoint.endpoint, kind: 'endpoint' };

  if (walls.length > 0) {
    const endpointSnap = findEndpointSnap(point, walls, tolerance, excludeWallId);
    if (endpointSnap) return { point: endpointSnap.point, kind: 'endpoint' };
  }

  // Priority 2: Midpoint snap
  if (walls.length > 0) {
    const midpointSnap = findMidpointSnap(
      point,
      walls,
      options.endpointTolerance ?? MIDPOINT_SNAP_DISTANCE,
      excludeWallId,
    );
    if (midpointSnap) return { point: midpointSnap.point, kind: 'midpoint' };
  }

  // Priority 3: Crossing snap
  if (walls.length > 1) {
    const crossingSnap = findCrossingSnap(
      point,
      walls,
      options.endpointTolerance ?? CROSSING_SNAP_DISTANCE,
      excludeWallId,
    );
    if (crossingSnap) return { point: crossingSnap.point, kind: 'crossing' };
  }

  // Priority 4: Angle lock snap (15° increments from origin)
  const origin = options.axisOrigin;
  if (options.angleLock && origin) {
    return { point: snapToAngle(point, origin), kind: 'angle' };
  }

  // Priority 5: Wall body snap (magnetic alignment to existing wall geometry)
  if (walls.length > 0) {
    const wallBodySnap = findWallBodySnap(
      point,
      walls,
      options.endpointTolerance ?? WALL_BODY_SNAP_DISTANCE,
      excludeWallId,
    );
    if (wallBodySnap) return { point: wallBodySnap.point, kind: 'wall' };
  }

  // Priority 6: Axis snap (horizontal/vertical alignment from origin)
  const gridPoint = {
    x: Math.round(point.x / options.gridSize) * options.gridSize,
    y: Math.round(point.y / options.gridSize) * options.gridSize,
  };
  const axisTolerance = options.axisTolerance ?? tolerance;

  if (origin) {
    const nearVertical = Math.abs(point.x - origin.x) <= axisTolerance;
    const nearHorizontal = Math.abs(point.y - origin.y) <= axisTolerance;
    if (nearVertical || nearHorizontal) {
      return {
        point: {
          x: nearVertical ? origin.x : gridPoint.x,
          y: nearHorizontal ? origin.y : gridPoint.y,
        },
        kind: 'axis',
      };
    }
  }

  // Priority 7: Grid snap
  return { point: gridPoint, kind: 'grid' };
}
