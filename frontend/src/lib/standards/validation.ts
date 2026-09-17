// Ghana Building Code validation rules engine
// Based on GS 1207:2018 & L.I. 1630

import type { FloorPlan, MaterialType, ValidationResult } from '@/types/design';
import { wallThicknessRequirements } from './materials';

const storyKeyMap = {
  1: 'oneStory',
  2: 'twoStory',
  3: 'threeStory',
} as const;

/**
 * Validate wall thickness for load-bearing walls
 * Per GS 1207:2018 Part 7 (Housing)
 */
export const validateWallThickness = (
  wallId: string,
  material: MaterialType,
  thickness: number,
  isLoadBearing: boolean,
  stories: number
): ValidationResult | null => {
  if (!isLoadBearing) return null;

  const requirements = wallThicknessRequirements[material as keyof typeof wallThicknessRequirements];
  if (!requirements) {
    return {
      id: `validation-${wallId}`,
      type: 'warning',
      message: `Material "${material}" is not yet mapped to Ghana standards data.`,
      remediation: 'Choose a mapped material, or check this wall with your tutor before relying on the review.',
      targetId: wallId,
      rule: 'material-unknown',
    };
  }

  const storyKey = storyKeyMap[stories as keyof typeof storyKeyMap] ?? 'oneStory';
  const minThickness = requirements.loadBearing[storyKey];

  if (thickness < minThickness) {
    return {
      id: `validation-${wallId}`,
      type: 'error',
      message: `Wall thickness ${thickness}mm is below the ${minThickness}mm minimum for a load-bearing ${material} wall in a ${stories}-storey scheme.`,
      remediation: `Increase the thickness to at least ${minThickness}mm, or change the wall role only if it is not load-bearing.`,
      targetId: wallId,
      rule: 'wall-thickness-insufficient',
    };
  }

  return null;
};

/**
 * Validate span-to-thickness ratio (basic structural check)
 */
export const validateSpanThickness = (
  wallId: string,
  thickness: number,
  wallLength: number
): ValidationResult | null => {
  const ratio = wallLength / thickness;
  if (ratio > 30) {
    return {
      id: `validation-${wallId}-span`,
      type: 'warning',
      message: `Wall span-to-thickness ratio is ${ratio.toFixed(1)}:1, above Corbel's 30:1 review threshold.`,
      remediation: 'Shorten the unsupported run, increase wall thickness, or discuss the structural approach with your tutor.',
      targetId: wallId,
      rule: 'span-thickness-ratio-high',
    };
  }

  return null;
};

/**
 * Validate opening size
 */
export const validateOpeningSize = (
  openingId: string,
  openingWidth: number
): ValidationResult | null => {
  if (openingWidth > 2000) {
    return {
      id: `validation-${openingId}`,
      type: 'warning',
      message: `Opening width ${openingWidth}mm is above Corbel's 2000mm review threshold.`,
      remediation: 'Check whether the opening needs additional structural support with your tutor or a qualified professional.',
      targetId: openingId,
      rule: 'opening-oversized',
    };
  }

  return null;
};

/**
 * Validate room area against basic Ghanaian residential guidance
 */
export const validateRoomLayout = (
  roomId: string,
  area: number,
  roomType: string
): ValidationResult | null => {
  const minimumAreas: Record<string, number> = {
    bedroom: 9,
    kitchen: 6,
    bathroom: 3,
    living: 12,
    dining: 8,
  };

  const normalizedRoomType = roomType.trim().toLowerCase();
  const minArea = minimumAreas[normalizedRoomType];

  if (minArea && area < minArea) {
    return {
      id: `validation-${roomId}`,
      type: 'warning',
      message: `${roomType} area ${area.toFixed(1)}m² is below the recommended ${minArea}m².`,
      remediation: `Increase the room to at least ${minArea}m², or record why the smaller space is appropriate for this brief.`,
      targetId: roomId,
      rule: 'room-area-small',
    };
  }

  return null;
};

/**
 * Run all validation rules on a floor plan
 */
export const validateFloorPlan = (floorPlan: FloorPlan | null): ValidationResult[] => {
  if (!floorPlan) return [];

  const results: ValidationResult[] = [];

  floorPlan.walls.forEach((wall) => {
    const thicknessResult = validateWallThickness(
      wall.id,
      wall.material,
      wall.thickness,
      wall.type === 'loadBearing',
      1
    );

    if (thicknessResult) results.push(thicknessResult);

    const wallLength = Math.sqrt(
      Math.pow(wall.endPoint.x - wall.startPoint.x, 2) +
        Math.pow(wall.endPoint.y - wall.startPoint.y, 2)
    );

    const spanResult = validateSpanThickness(wall.id, wall.thickness, wallLength);
    if (spanResult) results.push(spanResult);
  });

  floorPlan.doors.forEach((door) => {
    const doorResult = validateOpeningSize(door.id, door.width);
    if (doorResult) results.push(doorResult);

    const host = floorPlan.walls.find((wall) => wall.id === door.wallId);
    const hostLength = host ? Math.hypot(host.endPoint.x - host.startPoint.x, host.endPoint.y - host.startPoint.y) : 0;
    const halfWidth = door.width / 10 / 2;
    if (!host || door.position.x - halfWidth < 0 || door.position.x + halfWidth > hostLength) {
      results.push({
        id: `validation-${door.id}-host`,
        type: 'error',
        message: 'Door must fit completely within its host wall.',
        remediation: 'Move the door away from the wall end, reduce its width, or attach it to a longer wall.',
        targetId: door.id,
        rule: 'opening-host-fit',
      });
    }
  });

  floorPlan.windows.forEach((window) => {
    const windowResult = validateOpeningSize(window.id, window.width);
    if (windowResult) results.push(windowResult);

    const host = floorPlan.walls.find((wall) => wall.id === window.wallId);
    const hostLength = host ? Math.hypot(host.endPoint.x - host.startPoint.x, host.endPoint.y - host.startPoint.y) : 0;
    const halfWidth = window.width / 10 / 2;
    if (!host || window.position.x - halfWidth < 0 || window.position.x + halfWidth > hostLength) {
      results.push({
        id: `validation-${window.id}-host`,
        type: 'error',
        message: 'Window must fit completely within its host wall.',
        remediation: 'Move the window away from the wall end, reduce its width, or attach it to a longer wall.',
        targetId: window.id,
        rule: 'opening-host-fit',
      });
    }
  });

  floorPlan.rooms.forEach((room) => {
    const roomResult = validateRoomLayout(room.id, room.area, room.type ?? room.name);
    if (roomResult) results.push(roomResult);
  });

  return results;
};
