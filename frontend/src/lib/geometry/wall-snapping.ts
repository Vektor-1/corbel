/**
 * Advanced Wall Snapping System
 * Handles joints, endpoints, grid snapping, and angle constraints
 */

import { Canonical } from '@/types/schema';

export interface SnapPoint {
  x: number;
  y: number;
  type: 'endpoint' | 'intersection' | 'grid' | 'midpoint';
  snapDistance: number; // How close to snap
  targetId?: string; // Wall/room ID this snap point belongs to
}

export interface SnapResult {
  snapped: boolean;
  x: number;
  y: number;
  snapPoint: SnapPoint | null;
  angleSnapped: boolean;
  snapAngle?: number; // 0, 45, 90, 135, 180, etc.
}

const SNAP_DISTANCE = 200; // mm - distance to snap
const GRID_SIZE = 100; // mm - grid snap spacing
const ANGLE_SNAP_DEGREES = 15; // Snap to angles within this range

/**
 * Find all potential snap points in the floor plan
 */
export function getSnapPoints(floor: Canonical.Floor): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  // Endpoint snap points
  floor.walls.forEach(wall => {
    snapPoints.push({
      x: wall.start.x,
      y: wall.start.y,
      type: 'endpoint',
      snapDistance: SNAP_DISTANCE,
      targetId: wall.id,
    });
    snapPoints.push({
      x: wall.end.x,
      y: wall.end.y,
      type: 'endpoint',
      snapDistance: SNAP_DISTANCE,
      targetId: wall.id,
    });
  });

  // Intersection snap points (where walls cross)
  for (let i = 0; i < floor.walls.length; i++) {
    for (let j = i + 1; j < floor.walls.length; j++) {
      const intersection = getLineIntersection(floor.walls[i], floor.walls[j]);
      if (intersection) {
        snapPoints.push({
          x: intersection.x,
          y: intersection.y,
          type: 'intersection',
          snapDistance: SNAP_DISTANCE,
          targetId: `${floor.walls[i].id}-${floor.walls[j].id}`,
        });
      }
    }
  }

  // Grid snap points (optional, use sparingly)
  const minX = Math.min(...floor.walls.map(w => Math.min(w.start.x, w.end.x)));
  const maxX = Math.max(...floor.walls.map(w => Math.max(w.start.x, w.end.x)));
  const minY = Math.min(...floor.walls.map(w => Math.min(w.start.y, w.end.y)));
  const maxY = Math.max(...floor.walls.map(w => Math.max(w.start.y, w.end.y)));

  for (let x = Math.floor(minX / GRID_SIZE) * GRID_SIZE; x <= maxX; x += GRID_SIZE) {
    for (let y = Math.floor(minY / GRID_SIZE) * GRID_SIZE; y <= maxY; y += GRID_SIZE) {
      snapPoints.push({
        x,
        y,
        type: 'grid',
        snapDistance: SNAP_DISTANCE / 2, // Lower priority for grid
      });
    }
  }

  return snapPoints;
}

/**
 * Snap a point to the nearest snap point
 */
export function snapPoint(
  x: number,
  y: number,
  floor: Canonical.Floor,
  snapPoints?: SnapPoint[]
): SnapResult {
  const points = snapPoints || getSnapPoints(floor);

  let nearestPoint: SnapPoint | null = null;
  let minDist = Infinity;

  for (const point of points) {
    const dx = point.x - x;
    const dy = point.y - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < minDist && dist < point.snapDistance) {
      minDist = dist;
      nearestPoint = point;
    }
  }

  // Also check angle snapping
  const angleSnap = snapAngle(x, y, floor);

  const result: SnapResult = {
    snapped: nearestPoint !== null,
    x: nearestPoint?.x ?? x,
    y: nearestPoint?.y ?? y,
    snapPoint: nearestPoint,
    angleSnapped: angleSnap.snapped,
    snapAngle: angleSnap.angle,
  };

  return result;
}

/**
 * Snap wall endpoint angles to common angles (0°, 45°, 90°, etc.)
 */
export function snapAngle(
  x: number,
  y: number,
  floor: Canonical.Floor
): { snapped: boolean; angle?: number } {
  // Find the most recent wall being drawn
  const recentWall = floor.walls[floor.walls.length - 1];
  if (!recentWall) return { snapped: false };

  const dx = x - recentWall.start.x;
  const dy = y - recentWall.start.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);

  // Normalize to 0-360
  if (angle < 0) angle += 360;

  // Common architectural angles
  const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315];

  for (const snapAngleDeg of snapAngles) {
    const diff = Math.abs(angle - snapAngleDeg);
    if (diff < ANGLE_SNAP_DEGREES || diff > 360 - ANGLE_SNAP_DEGREES) {
      // Calculate snapped endpoint
      const distance = Math.sqrt(dx * dx + dy * dy);
      const snapAngleRad = (snapAngleDeg * Math.PI) / 180;
      const snappedX = recentWall.start.x + distance * Math.cos(snapAngleRad);
      const snappedY = recentWall.start.y + distance * Math.sin(snapAngleRad);

      return {
        snapped: true,
        angle: snapAngleDeg,
      };
    }
  }

  return { snapped: false };
}

/**
 * Get intersection point of two walls (if they cross)
 */
function getLineIntersection(wall1: Canonical.Wall, wall2: Canonical.Wall): { x: number; y: number } | null {
  const x1 = wall1.start.x,
    y1 = wall1.start.y;
  const x2 = wall1.end.x,
    y2 = wall1.end.y;
  const x3 = wall2.start.x,
    y3 = wall2.start.y;
  const x4 = wall2.end.x,
    y4 = wall2.end.y;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // Parallel lines

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection is within both line segments
  if (t >= -0.01 && t <= 1.01 && u >= -0.01 && u <= 1.01) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
}

/**
 * Create wall joint constraint (lock endpoints together)
 */
export function createWallJoint(wallId1: string, wallId2: string, point: 'start' | 'end') {
  return {
    wall1: wallId1,
    wall2: wallId2,
    joint: point,
    locked: true,
  };
}

/**
 * Validate wall can connect (check for impossible joints)
 */
export function canConnectWalls(wall1: Canonical.Wall, wall2: Canonical.Wall): boolean {
  // Check if endpoints are close enough
  const endpoints = [
    { p1: wall1.start, p2: wall2.start },
    { p1: wall1.start, p2: wall2.end },
    { p1: wall1.end, p2: wall2.start },
    { p1: wall1.end, p2: wall2.end },
  ];

  for (const ep of endpoints) {
    const dx = ep.p1.x - ep.p2.x;
    const dy = ep.p1.y - ep.p2.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < SNAP_DISTANCE * 2) {
      return true;
    }
  }

  return false;
}

/**
 * Apply constraints when wall endpoint moved
 * Updates connected walls to maintain joints
 */
export function applyJointConstraints(
  floor: Canonical.Floor,
  movedWallId: string,
  endpoint: 'start' | 'end'
): Canonical.Floor {
  const movedWall = floor.walls.find(w => w.id === movedWallId);
  if (!movedWall) return floor;

  const movedPoint = endpoint === 'start' ? movedWall.start : movedWall.end;

  // Find walls connected to this endpoint
  const updated = { ...floor };
  updated.walls = floor.walls.map(wall => {
    if (wall.id === movedWallId) return wall;

    // Check if this wall's start connects
    const startDist = Math.sqrt(
      Math.pow(wall.start.x - movedPoint.x, 2) + Math.pow(wall.start.y - movedPoint.y, 2)
    );
    if (startDist < SNAP_DISTANCE * 2) {
      return {
        ...wall,
        start: movedPoint,
      };
    }

    // Check if this wall's end connects
    const endDist = Math.sqrt(
      Math.pow(wall.end.x - movedPoint.x, 2) + Math.pow(wall.end.y - movedPoint.y, 2)
    );
    if (endDist < SNAP_DISTANCE * 2) {
      return {
        ...wall,
        end: movedPoint,
      };
    }

    return wall;
  });

  return updated;
}
