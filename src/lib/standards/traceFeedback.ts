import type { FloorPlan, TraceCalibration, ValidationResult } from '@/types/design';

/**
 * Feedback that is specific to an image-first trace. It intentionally never
 * infers physical scale from a door or image appearance: a student must first
 * confirm one real-world measurement.
 */
export function validateTraceFeedback(
  floorPlan: FloorPlan | null,
  calibration: TraceCalibration | undefined,
): ValidationResult[] {
  if (!floorPlan) return [];

  const results: ValidationResult[] = [];
  const targetId = floorPlan.walls[0]?.id ?? floorPlan.id;
  if (floorPlan.walls.length >= 3 && floorPlan.rooms.length === 0) {
    results.push({
      id: 'trace-open-boundary',
      type: 'warning',
      targetId: floorPlan.walls[floorPlan.walls.length - 1]?.id ?? targetId,
      rule: 'complete-traced-room',
      message: `${floorPlan.walls.length} traced walls do not yet form a closed room boundary.`,
      remediation: 'Zoom in on nearby wall ends and join the final endpoints to close a room.',
      evidence: 'Corbel found three or more traced walls but could not derive a bounded room from their connected endpoints.',
    });
  }

  const duplicatePair = findDuplicateWallPair(floorPlan);
  if (duplicatePair) {
    results.push({
      id: `trace-duplicate-wall-${duplicatePair[1]}`,
      type: 'warning',
      targetId: duplicatePair[1],
      rule: 'review-duplicate-wall',
      message: 'Two traced walls have the same endpoints and may be an accidental duplicate.',
      remediation: 'Select each overlapping wall in turn, keep one centreline, and delete the duplicate.',
      evidence: `The endpoints of ${duplicatePair[0]} and ${duplicatePair[1]} are within 12 canvas pixels of one another.`,
    });
  }

  if (!calibration) {
    results.push({
      id: 'trace-scale-not-calibrated',
      type: 'info',
      targetId,
      rule: 'set-drawing-scale',
      message: 'This is an image retrace. Area and dimension guidance remains illustrative until you calibrate one known wall.',
      remediation: 'Select a traced wall with a visible or known length, enter that length, then review the recalculated measurements.',
      evidence: 'No student-confirmed reference length is stored for this retrace.',
    });
    return results;
  }

  if (floorPlan.rooms.length < 2) return results;
  const verySmallRooms = floorPlan.rooms.filter((room) => room.area < 3);
  const medianWallLengthMm = [...floorPlan.walls]
    .map((wall) => Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y) * (1_000 / calibration.pixelsPerMeter))
    .sort((a, b) => a - b)[Math.floor(floorPlan.walls.length / 2)] ?? 0;
  const smallRoomPattern = verySmallRooms.length / floorPlan.rooms.length >= 0.75;
  const shortWallPattern = floorPlan.walls.length >= 4 && medianWallLengthMm > 0 && medianWallLengthMm < 700;

  if (smallRoomPattern && shortWallPattern) {
    results.push({
      id: 'trace-scale-review',
      type: 'warning',
      targetId: calibration.wallId,
      rule: 'check-drawing-scale',
      message: `${verySmallRooms.length} of ${floorPlan.rooms.length} traced rooms are below 3 m² and the median wall is ${Math.round(medianWallLengthMm)} mm after calibration. This pattern may indicate a scale mismatch.`,
      remediation: 'Recheck the selected reference wall against the source image. If its entered length is correct, inspect the small rooms individually rather than changing the scale.',
      evidence: `The scale check used ${floorPlan.rooms.length} room areas, ${floorPlan.walls.length} wall lengths, and the student-confirmed reference wall.`,
    });
  }

  return results;
}

function findDuplicateWallPair(floorPlan: FloorPlan): [string, string] | null {
  const close = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) <= 12;
  for (let index = 0; index < floorPlan.walls.length; index += 1) {
    for (let compareIndex = index + 1; compareIndex < floorPlan.walls.length; compareIndex += 1) {
      const a = floorPlan.walls[index];
      const b = floorPlan.walls[compareIndex];
      const sameDirection = close(a.startPoint, b.startPoint) && close(a.endPoint, b.endPoint);
      const reverseDirection = close(a.startPoint, b.endPoint) && close(a.endPoint, b.startPoint);
      if (sameDirection || reverseDirection) return [a.id, b.id];
    }
  }
  return null;
}
