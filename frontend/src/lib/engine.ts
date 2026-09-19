/**
 * The public surface of Corbel's reconstruction and validation engine, as
 * distinct from the teaching layer built on top of it (lib/learning,
 * lib/study, lib/comparison/rubric).
 *
 * Nothing under here imports education code -- enforced by
 * lib/__tests__/engine-boundary.test.ts -- so this file states what a
 * standalone commercial license would actually ship: import a raster plan,
 * get back straight walls and hosted openings, check it against a building
 * code, export or persist it. It exists to make that surface a deliberate
 * choice rather than whatever a `grep -r export` happens to turn up, and to
 * keep it that way as the engine grows.
 *
 * This is a barrel, not a package boundary -- nothing has moved. Extracting
 * it into its own workspace package later is a matter of moving the files
 * this imports; changing what it imports is the actual design decision.
 */

// Import: raster/PDF plan -> straight walls, hosted openings, rooms.
export {
  reconstructFloorPlan,
  parseImportSource,
  parseReconstructionResult,
  resolveProvider,
} from './plan-import';
export type {
  ImportDiagnostic,
  ImportJob,
  ImportJobStatus,
  ImportSource,
  PlanDetection,
  PlanImportResult,
  ReconstructionResultV1,
  ScaleEstimate,
  VisionProvider,
} from './plan-import';
export { mergeCollinearWalls, DEFAULT_WALL_MERGE_OPTIONS } from './plan-import/mergeWalls';
export type { WallMergeOptions, WallMergeResult } from './plan-import/mergeWalls';

// Geometry: the operations a floor plan editor needs on walls, rooms, and openings.
export {
  insertWallWithIntersections,
  splitWallAtPoint,
  pointAlongWall,
  projectOffsetOntoWall,
  rehostWallOpening,
} from './geometry/wall-intersections';
export { deriveRoomsFromWalls, polygonCentroid } from './geometry/rooms';
export { wallQuad, computeWallFootprints } from './geometry/wall-joints';
export { canPlaceDoor, canPlaceWindow, canPlaceObjectInRoom } from './geometry/placement-constraints';
export { centerizeFloorPlan, decenterizeFloorPlan, planCenterPx, shiftPlanCoordinates } from './geometry/origin';
export { cloneFloorPlan } from './redesign';

// Validation: building-code compliance, pluggable per jurisdiction.
export {
  validateFloorPlan,
  ghanaBuildingCode,
  runRuleSet,
  citationForRuleIn,
  DEFAULT_RULE_SET,
  RULE_SETS,
  GHANA_THRESHOLDS,
} from './standards';
export type { CodeRule, CodeRuleSet, RuleContext, CodeThresholds } from './standards';
export { getLowConfidenceElements, WALL_CONFIDENCE_THRESHOLD, OPENING_CONFIDENCE_THRESHOLD } from './standards/editorConfidence';

// Geometric comparison of two plans (as-built vs as-designed, revision deltas).
// The pedagogical rubric built on top of this lives in lib/comparison/rubric.ts,
// which is education code and is deliberately not re-exported here.
export { matchWalls, matchRooms, matchOpenings, polygonIoU } from './comparison/match';
export { computeMetricDeltas } from './comparison/metrics';
export type { ElementMatch, MatchStatus, MetricDelta, MetricDeltas } from './comparison/types';

// Export and persistence.
export { createDesignFloorJsonExport, exportFileName, downloadDesignFloorJson } from './export/designFloorJson';
export { saveDesignSnapshot, loadDesignSnapshot, clearDesignSnapshot } from './persistence/designSnapshot';

// Units and the placeable-object catalog.
export { toMillimetres, fromMillimetres, formatLength } from './units/measurements';
export type { LengthUnit, AreaUnit } from './units/measurements';
export { OBJECT_CATALOG, OBJECT_CATALOG_BY_ID, OBJECT_CATEGORIES } from './objects/catalog';
