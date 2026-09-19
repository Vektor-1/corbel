// Ghana Building Code validation rules engine
// Based on GS 1207:2018 & L.I. 1630

import type { FloorPlan, MaterialType, ValidationResult } from '@/types/design';
import { wallThicknessRequirements } from './materials';
import { GHANA_THRESHOLDS, type CodeThresholds } from './thresholds';

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
  wallLength: number,
  thresholds: CodeThresholds = GHANA_THRESHOLDS
): ValidationResult | null => {
  const limit = thresholds.maxSpanToThicknessRatio;
  const ratio = wallLength / thickness;
  if (ratio > limit) {
    return {
      id: `validation-${wallId}-span`,
      type: 'warning',
      message: `Wall span-to-thickness ratio is ${ratio.toFixed(1)}:1, above Corbel's ${limit}:1 review threshold.`,
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
  openingWidth: number,
  thresholds: CodeThresholds = GHANA_THRESHOLDS
): ValidationResult | null => {
  const limit = thresholds.maxOpeningWidthMm;
  if (openingWidth > limit) {
    return {
      id: `validation-${openingId}`,
      type: 'warning',
      message: `Opening width ${openingWidth}mm is above Corbel's ${limit}mm review threshold.`,
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
  roomType: string,
  thresholds: CodeThresholds = GHANA_THRESHOLDS
): ValidationResult | null => {
  const minimumAreas = thresholds.minimumRoomAreaM2;

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
