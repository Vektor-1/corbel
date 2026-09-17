/**
 * Two-tier floor plan schema:
 * - Draft: loose, AI-generated, confidence-tagged, needs refinement
 * - Canonical: validated, topology-complete, authoritative, consumed by 2D/3D
 */

// ============================================================================
// SHARED TYPES
// ============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Box {
  min: Point2D;
  max: Point2D;
}

export const Source = {
  AI: "ai",
  USER: "user",
  REFINED: "refined",
  // YOLO is an AI source retained for imported-plan provenance.
  YOLO: "ai",
} as const;

export type Source = (typeof Source)[keyof typeof Source];

// ============================================================================
// DRAFT TIER: Loose, confidence-tagged, minimal topology
// Output from YOLOv8 + Gemini OCR + refinement heuristics
// Input to canonical lift algorithm
// ============================================================================

export namespace Draft {
  /**
   * Raw wall segment from detection. May be fragmented, mis-aligned, or floating.
   * Confidence < 0.5 should be highlighted for user review.
   */
  export interface Wall {
    id: string;
    start: Point2D;
    end: Point2D;
    thickness: number;
    confidence: number; // 0.0–1.0, from YOLOv8 or refinement
    source: Source;
    // User can override detected values
    overrideThickness?: number;
    overrideConfidence?: number;
  }

  /**
   * Detected opening (door or window). No host wall reference yet.
   * Position is center or corner; refinement will snap to nearest wall.
   */
  export interface Opening {
    id: string;
    kind: "door" | "window";
    position: Point2D;
    width: number;
    height: number;
    confidence: number;
    source: Source;
    overrideWidth?: number;
    overrideHeight?: number;
  }

  /**
   * Text label extracted by Gemini OCR. May be room name, dimension, or annotation.
   */
  export interface Label {
    id: string;
    text: string;
    boundingBox: Box;
    confidence: number;
    kind?: "room_label" | "dimension" | "annotation" | "unknown";
    source: Source;
  }

  /**
   * Scale calibration result from dimension text (e.g., "12m" near a wall segment).
   * refinement uses this to convert pixel coords to real-world units.
   */
  export interface ScaleResult {
    pixelsPerMetre: number;
    source: string; // e.g., "dimension_w_001" or "user_manual"
    confidence: number;
  }

  /**
   * Draft floor plan: collection of loose, unvalidated geometric primitives.
   */
  export interface FloorPlan {
    id: string;
    elevation: number; // meters above ground
    walls: Wall[];
    openings: Opening[];
    labels: Label[];
    scale?: ScaleResult;
    warnings: ValidationIssue[]; // confidence-based or geometric anomalies
    overallConfidence: number; // average of wall + opening confidence
  }

  /**
   * Validation issue found during draft or refinement.
   * User sees these and can accept/reject refinements.
   */
  export interface ValidationIssue {
    id: string;
    severity: "info" | "warning" | "error";
    message: string;
    elementIds: string[]; // walls, openings, rooms affected
    suggestion?: string; // what refinement proposes
  }
}

// ============================================================================
// CANONICAL TIER: Validated, topology-complete, authoritative
// Input from refinement lift algorithm
// Output to 2D/3D renderers, validation engine, comparison engine
// ============================================================================

export namespace Canonical {
  /**
   * Material/construction type. Defined once, referenced by ID.
   * Keeps plan JSON compact and enables BOM-style summaries.
   */
  export interface WallType {
    id: string;
    thickness: number; // mm
    material: string; // "brick", "concrete", "sandcrete", etc.
    loadBearing: boolean;
    fireRating?: string; // e.g., "2h"
    uValue?: number; // thermal transmittance
  }

  export interface DoorType {
    id: string;
    width: number; // mm
    height: number; // mm
    swing: "inward" | "outward" | "double" | "sliding";
    material?: string;
    fireRating?: string;
  }

  export interface WindowType {
    id: string;
    width: number; // mm
    height: number; // mm
    sillHeight: number; // mm above floor
    glazing?: string; // e.g., "double"
  }

  export interface Library {
    wallTypes: Map<string, WallType>;
    doorTypes: Map<string, DoorType>;
    windowTypes: Map<string, WindowType>;
  }

  /**
   * Wall in canonical form: axis-aligned (or snapped), junctions closed,
   * openings attached, confidence validated.
   */
  export interface Wall {
    id: string;
    start: Point2D; // snapped to grid
    end: Point2D;
    typeRef: string; // reference to library.wallTypes[typeRef]
    openingIds: string[]; // doors and windows hosted on this wall
    // Metadata for rendering and validation
    draftSourceId?: string; // link back to draft Wall if exists
    confidence: number; // inherited from draft or manual override
    source: Source;
  }

  /**
   * Opening (door or window) attached to a wall.
   */
  export interface Opening {
    id: string;
    kind: "door" | "window";
    typeRef: string; // reference to library.doorTypes or windowTypes
    hostWallId: string; // must exist in walls array
    positionAlongWall: number; // distance from wall.start, mm
    // Metadata
    draftSourceId?: string;
    confidence: number;
    source: Source;
  }

  /**
   * Room: closed polygon bounded by walls, with semantic labels.
   */
  export interface Room {
    id: string;
    label?: string; // "Living Room", "Bedroom 1", etc.
    type?: string; // "bedroom" | "kitchen" | "bathroom" | "living" | "dining" | "office" | "hallway" | "stairs" | "other"
    boundingWallIds: string[]; // must form a closed loop
    vertices: Point2D[]; // polygon vertices, derived from walls
    area: number; // mm²
    // Metadata for comparison and validation
    draftSourceId?: string; // link to draft room if one existed
    confidence: number; // consensus from wall confidence
    source: Source;
  }

  /**
   * Single floor of a building. All coordinates are local to the floor.
   * 3D renderer applies elevation offset.
   */
  export interface Floor {
    id: string;
    elevation: number; // mm above ground
    floorHeight: number; // mm, height of this floor (for 3D extrusion)
    walls: Wall[];
    openings: Opening[];
    rooms: Room[];
  }

  /**
   * Canonical floor plan: topology-complete, validated, ready for rendering.
   */
  export interface FloorPlan {
    id: string;
    projectId: string;
    schemaVersion: number; // for migration
    units: "mm" | "cm" | "m"; // all coordinates in this unit
    origin: Point3D; // 3D world origin
    library: Library;
    floors: Floor[];
    // Metadata
    createdAt: string; // ISO 8601
    updatedAt: string;
    source: Source; // "imported", "manual", "hybrid"
  }

  /**
   * Validation result for a single rule check.
   */
  export interface ValidationResult {
    id: string;
    ruleId: string; // reference to a rule definition
    severity: "info" | "warning" | "error";
    message: string; // "Corridor width 1200mm below minimum 1500mm"
    standard?: string; // "GS 1207:2018, Section 3.2"
    elementIds: string[]; // rooms, walls affected
    remediation?: string; // what to do about it
  }
}

// ============================================================================
// LIFT ALGORITHM: Draft → Canonical
// ============================================================================

/**
 * Configuration for the refinement lift process.
 */
export interface LiftConfig {
  gridSnapTolerance: number; // mm, threshold for axis alignment
  minWallLength: number; // mm, discard shorter fragments
  maxGapToClose: number; // mm, junction gap tolerance
  minRoomArea: number; // mm², discard smaller enclosed spaces
  openingSnapDistance: number; // mm, max distance to host wall
}

/**
 * Intermediate structure during lift: helps track mapping from draft → canonical.
 */
export interface LiftContext {
  config: LiftConfig;
  draftPlan: Draft.FloorPlan;
  canonicalFloors: Map<string, Canonical.Floor>;
  wallMapping: Map<string, string>; // draft wall ID → canonical wall ID
  roomMapping: Map<string, string>; // detected closed loop → canonical room ID
  issues: Draft.ValidationIssue[];
}

// ============================================================================
// COMPARISON ENGINE
// ============================================================================

export enum ElementStatus {
  ADDED = "added",
  REMOVED = "removed",
  MOVED = "moved",
  RESIZED = "resized",
  UNCHANGED = "unchanged",
}

/**
 * Match between original and current element (for Trace-to-Learn comparison).
 */
export interface ElementMatch {
  id: string; // in comparison result
  originalElementId: string;
  currentElementId: string;
  status: ElementStatus;
  metrics?: {
    positionDelta?: Point2D; // how far moved
    areaDelta?: number; // mm²
    perimeterDelta?: number; // mm
  };
}

/**
 * Rubric score for a redesign against a baseline.
 */
export interface RubricResult {
  spatialAdequacy: number; // 0–10, room proportions, not cramped
  circulationOpenings: number; // 0–10, sufficient doors/windows
  wallSuitability: number; // 0–10, load-bearing and adjacency
  complianceCount: number; // count of rules violated
  overallScore: number; // weighted combination
}

/**
 * Full comparison report: original vs. current floor plan.
 */
export interface ComparisonReport {
  id: string;
  timestamp: string; // ISO 8601
  originalPlanId: string;
  currentPlanId: string;
  elementMatches: ElementMatch[];
  rubric: RubricResult;
  validationIssues: Canonical.ValidationResult[];
  diff: {
    wallsAdded: number;
    wallsRemoved: number;
    roomsAdded: number;
    roomsRemoved: number;
    areaChangedTotal: number; // mm²
  };
}
