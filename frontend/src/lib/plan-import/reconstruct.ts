import { deriveRoomsFromWalls } from '@/lib/geometry/rooms';
import { insertWallWithIntersections, rehostWallOpening } from '@/lib/geometry/wall-intersections';
import { centerizeFloorPlan } from '@/lib/geometry/origin';
import type { Door, FloorPlan, Point, Wall, Window } from '@/types/design';
import type {
  DetectedLabel,
  ImportDiagnostic,
  PlanImportResult,
  ReconstructionResultV1,
} from './types';

const PLAN_UNITS_PER_METER = 100;

const transformPoint = (point: Point, pixelsPerMeter: number): Point => ({
  x: (point.x / pixelsPerMeter) * PLAN_UNITS_PER_METER,
  y: (point.y / pixelsPerMeter) * PLAN_UNITS_PER_METER,
});

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function buildDiagnostics(result: ReconstructionResultV1): ImportDiagnostic[] {
  const diagnostics: ImportDiagnostic[] = [];

  if (result.scale.confidence < 0.75) {
    diagnostics.push({
      id: 'scale-review',
      severity: 'warning',
      message: 'Confirm one known measurement before trusting imported dimensions.',
    });
  }

  for (const detection of result.detections) {
    if (detection.accepted !== false && detection.confidence < 0.65) {
      diagnostics.push({
        id: `confidence-${detection.id}`,
        severity: 'warning',
        message: `Review this low-confidence ${detection.kind}.`,
        detectionId: detection.id,
      });
    }
  }

  diagnostics.push(
    ...(result.warnings ?? []).map((message, index) => ({
      id: `provider-warning-${index}`,
      severity: 'warning' as const,
      message,
    }))
  );

  return diagnostics;
}

export function reconstructFloorPlan(result: ReconstructionResultV1): PlanImportResult {
  if (result.schemaVersion !== 1) throw new Error('Unsupported reconstruction schema version.');
  if (!Number.isFinite(result.scale.pixelsPerMeter) || result.scale.pixelsPerMeter <= 0) {
    throw new Error('A positive pixels-per-meter calibration is required.');
  }

  const accepted = result.detections.filter((detection) => detection.accepted !== false);
  const rawWalls: Wall[] = accepted
    .filter((detection) => detection.kind === 'wall')
    .map((detection) => ({
      id: detection.id,
      startPoint: transformPoint(detection.start, result.scale.pixelsPerMeter),
      endPoint: transformPoint(detection.end, result.scale.pixelsPerMeter),
      thickness: detection.thicknessMm ?? 225,
      material: 'sandcrete',
      type: detection.role ?? 'loadBearing',
      height: 2700,
      confidence: detection.confidence,
      source: 'ai' as const,
    }));

  let walls: Wall[] = [];
  for (const wall of rawWalls) walls = insertWallWithIntersections(walls, wall);

  const doors: Door[] = [];
  const windows: Window[] = [];

  for (const detection of accepted) {
    if (detection.kind !== 'door' && detection.kind !== 'window') continue;
    const sourceWall = rawWalls.find((wall) => wall.id === detection.wallId);
    if (!sourceWall) continue;

    const sourceLength = Math.hypot(
      sourceWall.endPoint.x - sourceWall.startPoint.x,
      sourceWall.endPoint.y - sourceWall.startPoint.y
    );
    const position = { x: Math.max(0, Math.min(1, detection.offsetRatio)) * sourceLength, y: 0 };

    if (detection.kind === 'door') {
      const door: Door = {
        id: detection.id,
        wallId: sourceWall.id,
        position,
        width: detection.widthMm,
        type: 'internal',
        swing: detection.swing ?? 'left',
        openDirection: 'in',
        confidence: detection.confidence,
        source: 'ai',
      };
      doors.push(rehostWallOpening(door, rawWalls, walls));
    } else {
      const window: Window = {
        id: detection.id,
        wallId: sourceWall.id,
        position,
        width: detection.widthMm,
        height: detection.heightMm ?? 1200,
        sillHeight: detection.sillHeightMm ?? 900,
        confidence: detection.confidence,
        source: 'ai',
      };
      windows.push(rehostWallOpening(window, rawWalls, walls));
    }
  }

  const labels = accepted.filter(
    (detection): detection is DetectedLabel => detection.kind === 'label' && detection.role === 'room-name'
  );
  const rooms = deriveRoomsFromWalls(walls).map((room) => {
    const matchingLabel = labels.find((label) =>
      pointInPolygon(transformPoint(label.position, result.scale.pixelsPerMeter), room.vertices)
    );
    return matchingLabel ? { ...room, name: matchingLabel.text.trim() || room.name } : room;
  });

  const now = new Date();
  const floorPlan: FloorPlan = {
    id: `import-${crypto.randomUUID()}`,
    name: result.source.fileName.replace(/\.[^.]+$/, '') || 'Imported plan',
    width: Math.round((result.source.width / result.scale.pixelsPerMeter) * 1000),
    height: Math.round((result.source.height / result.scale.pixelsPerMeter) * 1000),
    scale: PLAN_UNITS_PER_METER,
    walls,
    rooms,
    doors,
    windows,
    objects: [],
    createdAt: now,
    updatedAt: now,
  };
  // Reconstruction coordinates are top-left-anchored; convert to the centered sheet origin.
  const centeredPlan = centerizeFloorPlan(floorPlan);

  const diagnostics = buildDiagnostics(result);
  if (walls.length === 0) {
    diagnostics.push({ id: 'no-walls', severity: 'error', message: 'No accepted walls were reconstructed.' });
  }
  if (rooms.length === 0 && walls.length > 0) {
    diagnostics.push({
      id: 'no-rooms',
      severity: 'warning',
      message: 'No closed rooms were found. Review wall endpoints and gaps.',
    });
  }

  return {
    floorPlan: centeredPlan,
    source: result.source,
    detections: result.detections,
    diagnostics,
    overallConfidence: result.overallConfidence,
  };
}
