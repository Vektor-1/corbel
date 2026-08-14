import type { Canonical, Point2D } from "../../types/schema";

type Nullable<T> = T | null;

export interface CorbelFloorPlanJsonExport {
  exportVersion: 1;
  exportedAt: string;
  generator: "corbel";
  meta: {
    planId: string;
    planName: string;
    floorLevel: number;
    createdAt: null;
    updatedAt: null;
  };
  canvas: {
    widthMm: number;
    heightMm: number;
    originCorner: "top-left";
    unitsNote: "All coordinates and dimensions in millimeters.";
  };
  source: {
    fileName: null;
    kind: null;
    originalWidthPx: null;
    originalHeightPx: null;
    pixelsPerMeter: null;
    overallConfidence: null;
    scaleMethod: null;
    scaleConfidence: null;
  };
  walls: Array<{
    id: string;
    startMm: Point2D;
    endMm: Point2D;
    thicknessMm: Nullable<number>;
    heightMm: number;
    isExternal: boolean;
    material: Nullable<string>;
    type: "loadBearing" | "partition";
  }>;
  rooms: Array<{
    id: string;
    name: Nullable<string>;
    roomType: "other";
    verticesMm: Point2D[];
    ceilingHeightMm: null;
    computed: { areaSqM: number; centroidMm: Point2D | null };
  }>;
  openings: Array<{
    id: string;
    type: "door" | "window";
    wallId: string;
    positionAlongWallMm: number;
    centerPointMm: Point2D | null;
    widthMm: number | null;
    heightMm: number | null;
    sillHeightMm: number | null;
    swing: null;
    doorType: null;
    connectsRooms: string[];
  }>;
  compliance: {
    standard: "GS 1207:2018 / L.I. 1630";
    issues: Array<{
      id: string;
      severity: Canonical.ValidationResult["severity"];
      rule: string;
      message: string;
      targetId: string | null;
    }>;
  };
  aiContext: {
    coordinateSystem: "Origin is top-left; X increases right and Y increases down; all values are millimeters.";
    reconstructionNote: string;
    suggestedPrompt: string;
  };
}

export interface FloorPlanJsonExportInput {
  floor: Canonical.Floor;
  library: Canonical.Library;
  validationIssues: Canonical.ValidationResult[];
}

const copyPoint = (point: Point2D): Point2D => ({ x: point.x, y: point.y });
const rounded = (value: number) => Math.round(value * 1000) / 1000;

function canvasSize(floor: Canonical.Floor) {
  const points = [
    ...floor.walls.flatMap((wall) => [wall.start, wall.end]),
    ...floor.rooms.flatMap((room) => room.vertices),
  ];
  return {
    widthMm: Math.max(0, ...points.map((point) => point.x)),
    heightMm: Math.max(0, ...points.map((point) => point.y)),
  };
}

function polygonCentroid(vertices: Point2D[]): Point2D | null {
  if (vertices.length < 3) return null;

  let twiceArea = 0;
  let x = 0;
  let y = 0;
  vertices.forEach((point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    const cross = point.x * next.y - next.x * point.y;
    twiceArea += cross;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  });

  if (twiceArea === 0) return null;
  return { x: rounded(x / (3 * twiceArea)), y: rounded(y / (3 * twiceArea)) };
}

function openingCenter(opening: Canonical.Opening, floor: Canonical.Floor): Point2D | null {
  const wall = floor.walls.find((candidate) => candidate.id === opening.hostWallId);
  if (!wall) return null;
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
  if (length === 0) return null;
  const progress = opening.positionAlongWall / length;
  return {
    x: rounded(wall.start.x + (wall.end.x - wall.start.x) * progress),
    y: rounded(wall.start.y + (wall.end.y - wall.start.y) * progress),
  };
}

/** Maps Corbel's canonical in-memory state to the stable, single-floor JSON v1 contract. */
export function createFloorPlanJsonExport(
  { floor, library, validationIssues }: FloorPlanJsonExportInput,
  exportedAt = new Date().toISOString(),
): CorbelFloorPlanJsonExport {
  const canvas = canvasSize(floor);

  return {
    exportVersion: 1,
    exportedAt,
    generator: "corbel",
    meta: {
      planId: floor.id,
      planName: floor.id || "Corbel floor",
      floorLevel: 0,
      createdAt: null,
      updatedAt: null,
    },
    canvas: {
      ...canvas,
      originCorner: "top-left",
      unitsNote: "All coordinates and dimensions in millimeters.",
    },
    source: {
      fileName: null,
      kind: null,
      originalWidthPx: null,
      originalHeightPx: null,
      pixelsPerMeter: null,
      overallConfidence: null,
      scaleMethod: null,
      scaleConfidence: null,
    },
    walls: floor.walls.map((wall) => {
      const wallType = library.wallTypes.get(wall.typeRef);
      const isExternal = wallType?.loadBearing ?? false;
      return {
        id: wall.id,
        startMm: copyPoint(wall.start),
        endMm: copyPoint(wall.end),
        thicknessMm: wallType?.thickness ?? null,
        heightMm: floor.floorHeight,
        isExternal,
        material: wallType?.material ?? null,
        type: isExternal ? "loadBearing" : "partition",
      };
    }),
    rooms: floor.rooms.map((room) => ({
      id: room.id,
      name: room.label ?? null,
      roomType: "other",
      verticesMm: room.vertices.map(copyPoint),
      ceilingHeightMm: null,
      computed: { areaSqM: rounded(room.area / 1_000_000), centroidMm: polygonCentroid(room.vertices) },
    })),
    openings: floor.openings.map((opening) => {
      const doorType = opening.kind === "door" ? library.doorTypes.get(opening.typeRef) : undefined;
      const windowType = opening.kind === "window" ? library.windowTypes.get(opening.typeRef) : undefined;
      return {
        id: opening.id,
        type: opening.kind,
        wallId: opening.hostWallId,
        positionAlongWallMm: opening.positionAlongWall,
        centerPointMm: openingCenter(opening, floor),
        widthMm: doorType?.width ?? windowType?.width ?? null,
        heightMm: doorType?.height ?? windowType?.height ?? null,
        sillHeightMm: windowType?.sillHeight ?? (opening.kind === "door" ? 0 : null),
        swing: null,
        doorType: null,
        connectsRooms: [],
      };
    }),
    compliance: {
      standard: "GS 1207:2018 / L.I. 1630",
      issues: validationIssues.map((issue) => ({
        id: issue.id,
        severity: issue.severity,
        rule: issue.ruleId,
        message: issue.message,
        targetId: issue.elementIds[0] ?? null,
      })),
    },
    aiContext: {
      coordinateSystem: "Origin is top-left; X increases right and Y increases down; all values are millimeters.",
      reconstructionNote: "This is a single-floor structural export. Null source fields indicate unavailable import provenance.",
      suggestedPrompt: "Use this Corbel JSON as a millimetre-accurate single-floor plan. Preserve IDs and hosted openings when proposing changes.",
    },
  };
}

export function exportFileName(floorId: string): string {
  const safeId = floorId.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${safeId || "corbel-floor"}.corbel.json`;
}

/** Prompt to pair with a downloaded export when handing the plan to another AI tool. */
export function createReconstructionPrompt(exported: CorbelFloorPlanJsonExport): string {
  return `You are reconstructing a building floor plan from the attached Corbel JSON v${exported.exportVersion} file.

Treat the JSON as the source of truth. It contains one floor. All coordinates and dimensions are in millimeters; the origin is top-left, X increases right, and Y increases down.

Reconstruct every wall from walls[].startMm to walls[].endMm using thicknessMm, heightMm, material, and type. Reconstruct rooms from rooms[].verticesMm and preserve their labels. Create every door/window hosted on openings[].wallId: positionAlongWallMm is authoritative and centerPointMm is a verification point. Preserve every Corbel object ID.

Treat null source/provenance fields as unknown and do not invent them. Surface compliance.issues as warnings without changing geometry automatically. Do not add furniture, extra walls, floors, doors, or windows unless you list them separately as optional suggestions.

Return: (1) a reconstruction summary, (2) invalid or missing references, (3) geometry assumptions, and (4) an object-by-object mapping from Corbel IDs to reconstructed IDs.`;
}

/** Browser-only download helper. Call from a user event in a Client Component. */
export function downloadFloorPlanJsonExport(exported: CorbelFloorPlanJsonExport, filename: string): void {
  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
