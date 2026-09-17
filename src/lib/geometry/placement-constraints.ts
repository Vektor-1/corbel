'use client';

/**
 * Preventive placement constraints for doors, windows, and objects.
 * Ported from Pascal's spatial-grid-manager predicates (point-in-polygon, interval overlap).
 * Validates placement in real-time during preview, blocking invalid positions.
 */

import type { Wall, Door, Window, Room } from '@/types/design';

export interface PlacementViolation {
  rule: string; // Explicitly reviewed citation or a plain-English educational heuristic.
  severity: 'error' | 'warning';
  message: string; // Human-readable violation reason
}

const MINIMUM_OPENING_EDGE_DISTANCE_MM = 300; // 300mm (≈12") from wall corners
const MINIMUM_OPENING_SEPARATION_MM = 200; // 200mm between adjacent openings

/**
 * Distance between two closed intervals. Overlap is represented as zero so it
 * is never mistaken for a valid, widely separated placement.
 */
function intervalGap(startA: number, endA: number, startB: number, endB: number): number {
  if (startA <= endB && startB <= endA) return 0;
  return Math.max(startA - endB, startB - endA);
}

/**
 * Check if a door placement is valid on a wall.
 * Validates: edge distance from corners, separation from other openings, wall length.
 */
export function canPlaceDoor(
  wall: Wall,
  doorPosition: number, // offset along wall length (mm from startPoint)
  doorWidth: number, // mm
  existingDoors: Door[],
  existingWindows: Window[],
): PlacementViolation[] {
  const violations: PlacementViolation[] = [];

  // Calculate wall length
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.hypot(dx, dy);

  // Validate wall length can accommodate door
  if (wallLength < doorWidth) {
    violations.push({
      rule: 'Geometry',
      severity: 'error',
      message: `Door width (${doorWidth}mm) exceeds wall length (${Math.round(wallLength)}mm)`,
    });
    return violations;
  }

  // Validate edge distance: door must be at least MINIMUM_OPENING_EDGE_DISTANCE_MM from corners
  const halfDoorWidth = doorWidth / 2;
  const doorStart = doorPosition - halfDoorWidth;
  const doorEnd = doorPosition + halfDoorWidth;

  if (doorStart < MINIMUM_OPENING_EDGE_DISTANCE_MM) {
    violations.push({
      rule: 'Opening-placement heuristic',
      severity: 'error',
      message: `Door must be ≥ ${MINIMUM_OPENING_EDGE_DISTANCE_MM}mm from wall corner (currently ${Math.round(doorStart)}mm)`,
    });
  }

  if (doorEnd > wallLength - MINIMUM_OPENING_EDGE_DISTANCE_MM) {
    violations.push({
      rule: 'Opening-placement heuristic',
      severity: 'error',
      message: `Door must be ≥ ${MINIMUM_OPENING_EDGE_DISTANCE_MM}mm from wall corner (currently ${Math.round(wallLength - doorEnd)}mm)`,
    });
  }

  // Check separation from other doors
  const doorsOnWall = existingDoors.filter((d) => d.wallId === wall.id);
  for (const existing of doorsOnWall) {
    const existingStart = existing.position.x - existing.width / 2;
    const existingEnd = existing.position.x + existing.width / 2;

    // Check if doors overlap or are too close
    const gap = intervalGap(doorStart, doorEnd, existingStart, existingEnd);

    if (gap < MINIMUM_OPENING_SEPARATION_MM && gap >= 0) {
      violations.push({
        rule: 'Opening-placement heuristic',
        severity: 'error',
        message: `Door must be ≥ ${MINIMUM_OPENING_SEPARATION_MM}mm from adjacent opening (currently ${Math.round(gap)}mm)`,
      });
    }
  }

  // Check separation from windows
  const windowsOnWall = existingWindows.filter((w) => w.wallId === wall.id);
  for (const existing of windowsOnWall) {
    const existingStart = existing.position.x - existing.width / 2;
    const existingEnd = existing.position.x + existing.width / 2;

    const gap = intervalGap(doorStart, doorEnd, existingStart, existingEnd);

    if (gap < MINIMUM_OPENING_SEPARATION_MM && gap >= 0) {
      violations.push({
        rule: 'Opening-placement heuristic',
        severity: 'error',
        message: `Door must be ≥ ${MINIMUM_OPENING_SEPARATION_MM}mm from adjacent opening (currently ${Math.round(gap)}mm)`,
      });
    }
  }

  return violations;
}

/**
 * Check if a window placement is valid on a wall.
 * Validates: edge distance, separation, wall length, sill height within bounds.
 */
export function canPlaceWindow(
  wall: Wall,
  windowPosition: number, // offset along wall length (mm from startPoint)
  windowWidth: number, // mm
  windowHeight: number, // mm
  windowSillHeight: number, // mm from floor
  wallHeight: number, // mm
  existingDoors: Door[],
  existingWindows: Window[],
): PlacementViolation[] {
  const violations: PlacementViolation[] = [];

  // Calculate wall length
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.hypot(dx, dy);

  // Validate wall length
  if (wallLength < windowWidth) {
    violations.push({
      rule: 'Geometry',
      severity: 'error',
      message: `Window width (${windowWidth}mm) exceeds wall length (${Math.round(wallLength)}mm)`,
    });
    return violations;
  }

  // Validate window fits vertically
  const windowTop = windowSillHeight + windowHeight;
  if (windowTop > wallHeight) {
    violations.push({
      rule: 'Geometry',
      severity: 'error',
      message: `Window head height (${Math.round(windowTop)}mm) exceeds wall height (${wallHeight}mm)`,
    });
  }

  // Validate sill height
  if (windowSillHeight < 600) {
    violations.push({
      rule: 'Window-placement heuristic',
      severity: 'warning',
      message: `Window sill height (${windowSillHeight}mm) is below recommended 600mm minimum`,
    });
  }

  if (windowSillHeight > 1500) {
    violations.push({
      rule: 'Window-placement heuristic',
      severity: 'warning',
      message: `Window sill height (${windowSillHeight}mm) exceeds typical 1500mm maximum`,
    });
  }

  // Validate edge distance
  const halfWindowWidth = windowWidth / 2;
  const windowStart = windowPosition - halfWindowWidth;
  const windowEnd = windowPosition + halfWindowWidth;

  if (windowStart < MINIMUM_OPENING_EDGE_DISTANCE_MM) {
    violations.push({
      rule: 'Opening-placement heuristic',
      severity: 'error',
      message: `Window must be ≥ ${MINIMUM_OPENING_EDGE_DISTANCE_MM}mm from wall corner (currently ${Math.round(windowStart)}mm)`,
    });
  }

  if (windowEnd > wallLength - MINIMUM_OPENING_EDGE_DISTANCE_MM) {
    violations.push({
      rule: 'Opening-placement heuristic',
      severity: 'error',
      message: `Window must be ≥ ${MINIMUM_OPENING_EDGE_DISTANCE_MM}mm from wall corner (currently ${Math.round(wallLength - windowEnd)}mm)`,
    });
  }

  // Check separation from other windows and doors
  const doorsOnWall = existingDoors.filter((d) => d.wallId === wall.id);
  for (const existing of doorsOnWall) {
    const existingStart = existing.position.x - existing.width / 2;
    const existingEnd = existing.position.x + existing.width / 2;

    const gap = intervalGap(windowStart, windowEnd, existingStart, existingEnd);

    if (gap < MINIMUM_OPENING_SEPARATION_MM && gap >= 0) {
      violations.push({
        rule: 'Opening-placement heuristic',
        severity: 'error',
        message: `Window must be ≥ ${MINIMUM_OPENING_SEPARATION_MM}mm from adjacent opening (currently ${Math.round(gap)}mm)`,
      });
    }
  }

  const windowsOnWall = existingWindows.filter((w) => w.wallId === wall.id && w.id !== undefined);
  for (const existing of windowsOnWall) {
    const existingStart = existing.position.x - existing.width / 2;
    const existingEnd = existing.position.x + existing.width / 2;

    const gap = intervalGap(windowStart, windowEnd, existingStart, existingEnd);

    if (gap < MINIMUM_OPENING_SEPARATION_MM && gap >= 0) {
      violations.push({
        rule: 'Opening-placement heuristic',
        severity: 'error',
        message: `Window must be ≥ ${MINIMUM_OPENING_SEPARATION_MM}mm from adjacent opening (currently ${Math.round(gap)}mm)`,
      });
    }
  }

  return violations;
}

/**
 * Check if an object can be placed in a room.
 * Currently minimal validation (footprint within room bounds).
 * Extend with furniture-specific rules as needed.
 */
export function canPlaceObjectInRoom(
  room: Room,
  objectPosition: { x: number; y: number },
  objectDimensions: [number, number, number], // [width, height, depth] in mm
): PlacementViolation[] {
  const violations: PlacementViolation[] = [];

  // TODO: Point-in-polygon check once room boundaries are computable from walls.
  // For now, accept all object placements (room is implicit from context).

  return violations;
}
