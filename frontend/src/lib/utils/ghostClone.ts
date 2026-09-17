/**
 * Pure function to clone a floor plan as a frozen ghost baseline.
 * Ensures ghost and current floor are independent (mutation isolation).
 */
import { Canonical } from "../../types/schema";
import { compareFloorPlans, ComparisonReport } from "../comparison";
import type { FloorPlan, Wall as LegacyWall, Room as LegacyRoom, Door as LegacyDoor, Window as LegacyWindow, MaterialType, WallType as LegacyWallType } from "@/types/design";
import { MM_PER_PX } from "../geometry/wall-joints";

/**
 * Deep-clone a floor plan for use as a ghost baseline.
 * Returns a completely independent copy; mutations to currentFloor
 * will not affect ghostFloor.
 */
export function cloneFloorAsGhost(floor: Canonical.Floor): Canonical.Floor {
  const clonedWalls: Canonical.Wall[] = floor.walls.map((wall) => ({
    ...wall,
    start: { ...wall.start },
    end: { ...wall.end },
    openingIds: [...wall.openingIds],
  }));

  const clonedOpenings: Canonical.Opening[] = floor.openings.map((opening) => ({
    ...opening,
  }));

  const clonedRooms: Canonical.Room[] = floor.rooms.map((room) => ({
    ...room,
    boundingWallIds: [...room.boundingWallIds],
    vertices: room.vertices.map((v) => ({ ...v })),
  }));

  return {
    id: floor.id,
    elevation: floor.elevation,
    floorHeight: floor.floorHeight,
    walls: clonedWalls,
    openings: clonedOpenings,
    rooms: clonedRooms,
  };
}

/**
 * Convert a canonical floor plan into the legacy FloorPlan type.
 */
export function canonicalToLegacyFloorPlan(floor: Canonical.Floor, library: Canonical.Library): FloorPlan {
  const scale = 100; // default 100 px per meter

  const walls: LegacyWall[] = floor.walls.map((wall) => {
    const wallType = library.wallTypes.get(wall.typeRef);
    const thickness = wallType?.thickness ?? 200;
    const materialRaw = wallType?.material ?? "sandcrete";
    const material: MaterialType = (["sandcrete", "laterite", "concrete", "timber"].includes(materialRaw)
      ? materialRaw
      : "sandcrete") as MaterialType;
    const type: LegacyWallType = wallType?.loadBearing ? "loadBearing" : "partition";

    return {
      id: wall.id,
      startPoint: { x: wall.start.x / MM_PER_PX, y: wall.start.y / MM_PER_PX },
      endPoint: { x: wall.end.x / MM_PER_PX, y: wall.end.y / MM_PER_PX },
      thickness,
      material,
      type,
      height: floor.floorHeight ?? 2800,
      confidence: wall.confidence,
      source: wall.source === "ai" ? "ai" : "user",
    };
  });

  const rooms: LegacyRoom[] = floor.rooms.map((room) => {
    return {
      id: room.id,
      name: room.label || "Room",
      vertices: room.vertices.map((v) => ({ x: v.x / MM_PER_PX, y: v.y / MM_PER_PX })),
      area: room.area / 1e6, // converts mm² to m²
    };
  });

  const doors: LegacyDoor[] = floor.openings
    .filter((o) => o.kind === "door")
    .map((o) => {
      const type = library.doorTypes.get(o.typeRef);
      return {
        id: o.id,
        position: { x: o.positionAlongWall / MM_PER_PX, y: 0 },
        wallId: o.hostWallId,
        width: type?.width ?? 900,
        type: "internal" as const,
        swing: "left" as const,
        confidence: o.confidence,
        source: o.source === "ai" ? "ai" : "user",
      };
    });

  const windows: LegacyWindow[] = floor.openings
    .filter((o) => o.kind === "window")
    .map((o) => {
      const type = library.windowTypes.get(o.typeRef);
      return {
        id: o.id,
        position: { x: o.positionAlongWall / MM_PER_PX, y: 0 },
        wallId: o.hostWallId,
        width: type?.width ?? 1200,
        height: type?.height ?? 1200,
        sillHeight: type?.sillHeight ?? 900,
        confidence: o.confidence,
        source: o.source === "ai" ? "ai" : "user",
      };
    });

  return {
    id: floor.id,
    name: floor.id || "Floor Plan",
    width: 0,
    height: 0,
    scale,
    walls,
    rooms,
    doors,
    windows,
    objects: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Compare ghost baseline to current floor.
 * Returns counts and list of differences for trace-to-learn comparison panel.
 */
export function compareFloorToGhost(
  current: Canonical.Floor,
  ghost: Canonical.Floor,
  library?: Canonical.Library
): ComparisonReport & {
  ghostWallCount: number;
  currentWallCount: number;
  ghostRoomCount: number;
  currentRoomCount: number;
  ghostOpeningCount: number;
  currentOpeningCount: number;
} {
  const defaultLib: Canonical.Library = {
    wallTypes: new Map(),
    doorTypes: new Map(),
    windowTypes: new Map(),
  };
  const lib = library || defaultLib;
  const currentLegacy = canonicalToLegacyFloorPlan(current, lib);
  const ghostLegacy = canonicalToLegacyFloorPlan(ghost, lib);
  const report = compareFloorPlans(ghostLegacy, currentLegacy);

  return {
    ...report,
    ghostWallCount: ghost.walls.length,
    currentWallCount: current.walls.length,
    ghostRoomCount: ghost.rooms.length,
    currentRoomCount: current.rooms.length,
    ghostOpeningCount: ghost.openings.length,
    currentOpeningCount: current.openings.length,
  };
}
