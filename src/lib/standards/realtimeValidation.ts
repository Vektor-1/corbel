/**
 * Real-time validation engine for live editor feedback.
 * Runs on every state change, returns validation issues with severity + suggestions.
 */

import { Canonical } from '@/types/schema';
import { validateWallThickness, validateRoomLayout, validateOpeningSize } from './canonicalValidation';

export type ValidationSeverity = 'info' | 'warning' | 'error';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  elementId: string;
  elementType: 'wall' | 'room' | 'opening';
  message: string;
  suggestion?: string;
  autofixable?: boolean;
}

export interface RealtimeValidationResult {
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  canExport: boolean; // false if any errors
  canAccept: boolean; // false if critical errors
}

/**
 * Critical rules that block acceptance (errors only).
 */
const criticalRules = new Set([
  'wall-thickness-insufficient',
  'opening-host-fit',
  'disconnected-walls',
]);

/**
 * Validate a single wall in real-time.
 */
function validateWallRealtime(wall: Canonical.Wall, library: Canonical.Library): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const wallType = library.wallTypes.get(wall.typeRef);
  if (!wallType) {
    issues.push({
      id: `rtval-${wall.id}-type`,
      severity: 'error',
      elementId: wall.id,
      elementType: 'wall',
      message: `Wall type "${wall.typeRef}" not found in library`,
      suggestion: 'Select a valid wall type from the library',
      autofixable: false,
    });
    return issues;
  }

  // Thickness check
  const thicknessResult = validateWallThickness(wall, wallType, 1);
  if (thicknessResult && thicknessResult.ruleId !== 'material-unknown') {
    issues.push({
      id: thicknessResult.id,
      severity: thicknessResult.severity as ValidationSeverity,
      elementId: wall.id,
      elementType: 'wall',
      message: thicknessResult.message,
      suggestion: thicknessResult.remediation,
      autofixable: false,
    });
  }

  // Length checks
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const wallLength = Math.hypot(dx, dy);

  if (wallLength < 300) {
    issues.push({
      id: `rtval-${wall.id}-short`,
      severity: 'warning',
      elementId: wall.id,
      elementType: 'wall',
      message: `Wall is very short (${Math.round(wallLength)}mm). Minimum recommended is 300mm.`,
      suggestion: 'Extend the wall or delete it',
      autofixable: false,
    });
  }

  return issues;
}

/**
 * Validate a single room in real-time.
 */
function validateRoomRealtime(room: Canonical.Room): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const layoutResult = validateRoomLayout(room);
  if (layoutResult) {
    issues.push({
      id: layoutResult.id,
      severity: layoutResult.severity as ValidationSeverity,
      elementId: room.id,
      elementType: 'room',
      message: layoutResult.message,
      suggestion: layoutResult.remediation,
      autofixable: false,
    });
  }

  return issues;
}

/**
 * Validate a single opening in real-time.
 */
function validateOpeningRealtime(opening: Canonical.Opening, library: Canonical.Library): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const libraryType =
    opening.kind === 'door' ? library.doorTypes.get(opening.typeRef) : library.windowTypes.get(opening.typeRef);

  if (!libraryType) {
    issues.push({
      id: `rtval-${opening.id}-type`,
      severity: 'error',
      elementId: opening.id,
      elementType: 'opening',
      message: `${opening.kind === 'door' ? 'Door' : 'Window'} type "${opening.typeRef}" not found`,
      suggestion: 'Select a valid type from the library',
      autofixable: false,
    });
    return issues;
  }

  const sizeResult = validateOpeningSize(opening, libraryType);
  if (sizeResult) {
    issues.push({
      id: sizeResult.id,
      severity: sizeResult.severity as ValidationSeverity,
      elementId: opening.id,
      elementType: 'opening',
      message: sizeResult.message,
      suggestion: sizeResult.remediation,
      autofixable: false,
    });
  }

  return issues;
}

/**
 * Validate entire floor for real-time display.
 * Returns all issues grouped by severity.
 */
export function validateFloorRealtime(floor: Canonical.Floor | null, library: Canonical.Library): RealtimeValidationResult {
  const issues: ValidationIssue[] = [];

  if (!floor) {
    return {
      issues: [],
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      canExport: false,
      canAccept: false,
    };
  }

  // Validate walls
  for (const wall of floor.walls) {
    issues.push(...validateWallRealtime(wall, library));
  }

  // Validate rooms
  for (const room of floor.rooms) {
    issues.push(...validateRoomRealtime(room));
  }

  // Validate openings
  for (const opening of floor.openings) {
    issues.push(...validateOpeningRealtime(opening, library));
  }

  // Check for connectivity (rooms should be closed)
  if (floor.rooms.length === 0 && floor.walls.length > 0) {
    issues.push({
      id: 'rtval-connectivity',
      severity: 'warning',
      elementId: 'floor',
      elementType: 'wall',
      message: 'No closed rooms detected. Walls may be disconnected.',
      suggestion: 'Connect wall endpoints or draw new walls to close rooms',
      autofixable: false,
    });
  }

  // Count by severity
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // Determine permissions
  const criticalErrors = issues.filter((i) => i.severity === 'error' && criticalRules.has(i.id));

  return {
    issues,
    errorCount,
    warningCount,
    infoCount,
    canExport: errorCount === 0,
    canAccept: criticalErrors.length === 0,
  };
}

/**
 * Get issues for a specific element (wall/room/opening).
 * Used to highlight individual elements.
 */
export function getIssuesForElement(
  elementId: string,
  floor: Canonical.Floor | null,
  library: Canonical.Library
): ValidationIssue[] {
  if (!floor) return [];
  const result = validateFloorRealtime(floor, library);
  return result.issues.filter((i) => i.elementId === elementId);
}

/**
 * Get highest severity for an element.
 * Used to determine highlight color.
 */
export function getElementSeverity(
  elementId: string,
  floor: Canonical.Floor | null,
  library: Canonical.Library
): ValidationSeverity | null {
  const issues = getIssuesForElement(elementId, floor, library);
  if (issues.length === 0) return null;

  if (issues.some((i) => i.severity === 'error')) return 'error';
  if (issues.some((i) => i.severity === 'warning')) return 'warning';
  return 'info';
}
