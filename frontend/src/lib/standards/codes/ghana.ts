import type { Door, ValidationResult, Window } from '@/types/design';
import { RULE_CITATIONS } from '../citations';
import type { CodeRuleSet, RuleContext } from '../ruleSet';
import { GHANA_THRESHOLDS } from '../thresholds';
import {
  validateOpeningSize,
  validateRoomLayout,
  validateSpanThickness,
  validateWallThickness,
} from '../validation';

const wallLength = (wall: { startPoint: { x: number; y: number }; endPoint: { x: number; y: number } }) =>
  Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y);

/**
 * An opening has to sit entirely within the wall hosting it. Position is in plan
 * units and width in millimetres, hence the factor of ten.
 */
function openingFitsHost(
  opening: Door | Window,
  context: RuleContext,
  label: string
): ValidationResult | null {
  const host = context.floorPlan.walls.find((wall) => wall.id === opening.wallId);
  const hostLength = host ? wallLength(host) : 0;
  const halfWidth = opening.width / 10 / 2;

  if (host && opening.position.x - halfWidth >= 0 && opening.position.x + halfWidth <= hostLength) {
    return null;
  }

  return {
    id: `validation-${opening.id}-host`,
    type: 'error',
    message: `${label} must fit completely within its host wall.`,
    remediation: `Move the ${label.toLowerCase()} away from the wall end, reduce its width, or attach it to a longer wall.`,
    targetId: opening.id,
    rule: 'opening-host-fit',
  };
}

const compact = (results: (ValidationResult | null)[]) =>
  results.filter((result): result is ValidationResult => result !== null);

/**
 * Ghana Building Code (GS 1207:2018, L.I. 1630).
 *
 * The rules delegate to the functions in `validation.ts` rather than reimplementing
 * them, so this reorganisation is provably behaviour-preserving: the same code
 * produces the same findings, now addressable one jurisdiction at a time.
 */
export const ghanaBuildingCode: CodeRuleSet = {
  id: 'ghana-gs1207',
  name: 'Ghana Building Code',
  jurisdiction: 'Ghana',
  // Sourced from the existing audited registry; this rule set adds no new claims.
  citations: RULE_CITATIONS,
  rules: [
    {
      id: 'wall-thickness-insufficient',
      summary: 'Load-bearing walls meet the minimum thickness for their material and storey count.',
      evaluate: ({ floorPlan, stories }) =>
        compact(
          floorPlan.walls.map((wall) =>
            validateWallThickness(
              wall.id,
              wall.material,
              wall.thickness,
              wall.type === 'loadBearing',
              stories
            )
          )
        ),
    },
    {
      id: 'span-thickness-ratio-high',
      summary: 'Unsupported wall runs stay within the span-to-thickness review threshold.',
      evaluate: ({ floorPlan }) =>
        compact(
          floorPlan.walls.map((wall) =>
            validateSpanThickness(wall.id, wall.thickness, wallLength(wall), GHANA_THRESHOLDS)
          )
        ),
    },
    {
      id: 'opening-oversized',
      summary: 'Door and window widths stay within the structural review threshold.',
      evaluate: ({ floorPlan }) =>
        compact(
          [...floorPlan.doors, ...floorPlan.windows].map((opening) =>
            validateOpeningSize(opening.id, opening.width, GHANA_THRESHOLDS)
          )
        ),
    },
    {
      id: 'opening-host-fit',
      summary: 'Every door and window fits completely within its host wall.',
      evaluate: (context) =>
        compact([
          ...context.floorPlan.doors.map((door) => openingFitsHost(door, context, 'Door')),
          ...context.floorPlan.windows.map((window) => openingFitsHost(window, context, 'Window')),
        ]),
    },
    {
      id: 'room-area-small',
      summary: 'Rooms meet the recommended minimum area for their type.',
      evaluate: ({ floorPlan }) =>
        compact(
          floorPlan.rooms.map((room) =>
            validateRoomLayout(room.id, room.area, room.type ?? room.name, GHANA_THRESHOLDS)
          )
        ),
    },
  ],
};
