/**
 * Pure function to clone a floor plan as a frozen ghost baseline.
 * Ensures ghost and current floor are independent (mutation isolation).
 */

import { Canonical } from "../../types/schema";

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
 * Compare ghost baseline to current floor.
 * Returns counts and list of differences for trace-to-learn comparison panel.
 */
export function compareFloorToGhost(
  current: Canonical.Floor,
  ghost: Canonical.Floor
): {
  ghostWallCount: number;
  currentWallCount: number;
  ghostRoomCount: number;
  currentRoomCount: number;
  ghostOpeningCount: number;
  currentOpeningCount: number;
} {
  return {
    ghostWallCount: ghost.walls.length,
    currentWallCount: current.walls.length,
    ghostRoomCount: ghost.rooms.length,
    currentRoomCount: current.rooms.length,
    ghostOpeningCount: ghost.openings.length,
    currentOpeningCount: current.openings.length,
  };
}
