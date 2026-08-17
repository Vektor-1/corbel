/**
 * Corbel compliance rule engine for Canonical floor plans.
 * Ported from src/lib/standards/validation.ts, adapted for Canonical.Wall/Room/Opening.
 * References: GS 1207:2018 (Ghana Building Code), L.I. 1630
 */

import { Canonical } from "@/types/schema";
import { wallThicknessRequirements } from "./materials";

const storyKeyMap = {
  1: "oneStory",
  2: "twoStory",
  3: "threeStory",
} as const;

/**
 * Validate wall thickness for load-bearing walls.
 * Per GS 1207:2018 Part 7 (Housing).
 */
export function validateWallThickness(
  wall: Canonical.Wall,
  wallType: Canonical.WallType,
  stories: number = 1
): Canonical.ValidationResult | null {
  if (!wallType.loadBearing) return null;

  const material = wallType.id.split("-")[0] || "sandcrete";
  const requirements = wallThicknessRequirements[material as keyof typeof wallThicknessRequirements];

  if (!requirements) {
    return {
      id: `validation-${wall.id}-thickness`,
      ruleId: "material-unknown",
      severity: "warning",
      message: `Material "${material}" is not yet mapped to Ghana standards data.`,
      elementIds: [wall.id],
      remediation: "Use a mapped material (sandcrete, laterite, or concrete).",
    };
  }

  const storyKey = storyKeyMap[stories as keyof typeof storyKeyMap] ?? "oneStory";
  const minThickness = requirements.loadBearing[storyKey];

  if (wallType.thickness < minThickness) {
    return {
      id: `validation-${wall.id}-thickness`,
      ruleId: "wall-thickness-insufficient",
      severity: "error",
      message: `Load-bearing wall thickness ${wallType.thickness}mm is below the ${minThickness}mm minimum for a ${material} wall in a ${stories}-storey building.`,
      standard: "GS 1207:2018 Part 7",
      elementIds: [wall.id],
      remediation: "Increase wall thickness or use a stronger material.",
    };
  }

  return null;
}

/**
 * Validate span-to-thickness ratio (basic structural check).
 * High ratios (>30:1) may indicate insufficient structural capacity.
 */
export function validateSpanThickness(
  wall: Canonical.Wall,
  wallType: Canonical.WallType
): Canonical.ValidationResult | null {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);

  const ratio = wallLength / wallType.thickness;

  if (ratio > 30) {
    return {
      id: `validation-${wall.id}-span`,
      ruleId: "span-thickness-ratio-high",
      severity: "warning",
      message: `Wall span-to-thickness ratio (${ratio.toFixed(1)}:1) is high. Consider adding cross-bracing or consulting a structural engineer.`,
      standard: "GS 1207:2018 Part 7",
      elementIds: [wall.id],
      remediation: "Reduce span or increase thickness.",
    };
  }

  return null;
}

/**
 * Validate opening (door/window) size.
 * Oversized openings (>2000mm width) may need extra structural support.
 */
export function validateOpeningSize(
  opening: Canonical.Opening,
  libraryType: Canonical.DoorType | Canonical.WindowType | undefined
): Canonical.ValidationResult | null {
  if (!libraryType) return null;

  if (libraryType.width > 2000) {
    return {
      id: `validation-${opening.id}-size`,
      ruleId: "opening-oversized",
      severity: "warning",
      message: `${opening.kind === "door" ? "Door" : "Window"} width ${libraryType.width}mm is very large and may need extra structural support.`,
      standard: "GS 1207:2018 Part 7",
      elementIds: [opening.id],
      remediation: "Use a smaller opening or consult a structural engineer for lintel design.",
    };
  }

  return null;
}

/**
 * Validate that opening fits within its host wall.
 */
export function validateOpeningHostFit(
  opening: Canonical.Opening,
  hostWall: Canonical.Wall | undefined,
  libraryType: Canonical.DoorType | Canonical.WindowType | undefined
): Canonical.ValidationResult | null {
  if (!hostWall || !libraryType) return null;

  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const wallLength = Math.hypot(dx, dy);

  // Opening position is measured as distance along wall from wall.start
  // Check if it fits: opening is centered at positionAlongWall with width libraryType.width
  const openingHalfWidth = libraryType.width / 2;
  const openingStart = opening.positionAlongWall - openingHalfWidth;
  const openingEnd = opening.positionAlongWall + openingHalfWidth;

  if (openingStart < 0 || openingEnd > wallLength) {
    return {
      id: `validation-${opening.id}-fit`,
      ruleId: "opening-host-fit",
      severity: "error",
      message: `${opening.kind === "door" ? "Door" : "Window"} does not fit entirely within its host wall (extends beyond endpoints).`,
      standard: "GS 1207:2018 Part 7",
      elementIds: [opening.id, hostWall.id],
      remediation: "Reposition the opening or choose a narrower opening type.",
    };
  }

  return null;
}

/**
 * Validate room area against room-type minimums.
 * Based on Ghanaian residential guidance (DIN 18040, GS 1207:2018 Part 7).
 */
export function validateRoomLayout(room: Canonical.Room): Canonical.ValidationResult | null {
  const minimumAreas: Record<string, number> = {
    bedroom: 9,
    kitchen: 6,
    bathroom: 3,
    living: 12,
    dining: 8,
    hallway: 2,
    office: 6,
    store: 3,
  };

  const roomType = (room.type ?? room.label ?? "").trim().toLowerCase();
  if (!roomType) return null;

  const minArea = minimumAreas[roomType];
  if (!minArea) return null; // Unknown room type, skip validation

  const areaM2 = room.area / 1e6; // Convert mm² to m²
  if (areaM2 < minArea) {
    return {
      id: `validation-${room.id}-area`,
      ruleId: "room-area-small",
      severity: "warning",
      message: `${room.label || "Room"} (${roomType}) area is ${areaM2.toFixed(1)}m², below the recommended minimum of ${minArea}m².`,
      standard: "GS 1207:2018 Part 7",
      elementIds: [room.id],
      remediation: "Expand the room or merge it with an adjacent space.",
    };
  }

  return null;
}

/**
 * Orchestrator: validate entire canonical floor plan against all rules.
 */
export function validateCanonicalFloor(
  floor: Canonical.Floor | null,
  library: Canonical.Library
): Canonical.ValidationResult[] {
  if (!floor) return [];

  const results: Canonical.ValidationResult[] = [];

  // Validate walls
  floor.walls.forEach((wall) => {
    const wallType = library.wallTypes.get(wall.typeRef);
    if (!wallType) return;

    const thicknessResult = validateWallThickness(wall, wallType, 1); // Assume 1-story for now
    if (thicknessResult) results.push(thicknessResult);

    const spanResult = validateSpanThickness(wall, wallType);
    if (spanResult) results.push(spanResult);
  });

  // Validate openings
  floor.openings.forEach((opening) => {
    const hostWall = floor.walls.find((w) => w.id === opening.hostWallId);
    const libraryType =
      opening.kind === "door"
        ? library.doorTypes.get(opening.typeRef)
        : library.windowTypes.get(opening.typeRef);

    const sizeResult = validateOpeningSize(opening, libraryType);
    if (sizeResult) results.push(sizeResult);

    const fitResult = validateOpeningHostFit(opening, hostWall, libraryType);
    if (fitResult) results.push(fitResult);
  });

  // Validate rooms
  floor.rooms.forEach((room) => {
    const layoutResult = validateRoomLayout(room);
    if (layoutResult) results.push(layoutResult);
  });

  return results;
}
