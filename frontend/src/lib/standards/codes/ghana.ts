import type { Door, ValidationResult, Window } from '@/types/design';
import { RULE_CITATIONS } from '../citations';
import { millimetresPerPixel } from '../../geometry/scale';
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
 * Half an opening's width in plan units. Positions and wall lengths are in plan
 * units (pixels) while width is in millimetres, so the conversion has to follow the
 * plan's scale: a fixed factor is only right at the default 100 px/m.
 */
const halfWidthInPlanUnits = (opening: Door | Window, floorPlan: RuleContext['floorPlan']) =>
  opening.width / millimetresPerPixel(floorPlan.scale) / 2;

/**
 * An opening has to sit entirely within the wall hosting it, both along the wall
 * and up its height. Windows are the only openings with a sill and height, so the
 * vertical check applies to them alone.
 */
function openingFitsHost(
  opening: Door | Window,
  context: RuleContext,
  label: string
): ValidationResult | null {
  const hosts = context.floorPlan.walls.filter((wall) => wall.id === opening.wallId);
  // Two walls sharing an id make the host ambiguous: the 3D viewer and this check
  // would resolve it to different walls, so the opening cannot be vouched for.
  const host = hosts.length === 1 ? hosts[0] : undefined;
  const hostLength = host ? wallLength(host) : 0;
  const halfWidth = halfWidthInPlanUnits(opening, context.floorPlan);
  const fitsAlongWall =
    !!host && opening.position.x - halfWidth >= 0 && opening.position.x + halfWidth <= hostLength;
  // A window whose top edge rises above the wall's height comes out of the wall.
  const fitsUnderWallTop =
    !!host && (!('sillHeight' in opening) || opening.sillHeight + opening.height <= host.height);

  if (fitsAlongWall && fitsUnderWallTop) {
    return null;
  }

  if (fitsAlongWall) {
    return {
      id: `validation-${opening.id}-host`,
      type: 'error',
      message: `${label} extends above the top of its host wall.`,
      remediation: `Lower the ${label.toLowerCase()}'s sill or reduce its height so it stays below the wall's height.`,
      targetId: opening.id,
      rule: 'opening-host-fit',
    };
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
 * `openingFitsHost` only checks an opening against its own wall's bounds --
 * two openings can each individually fit the wall while still overlapping
 * each other (e.g. a door placed on top of a window). Nothing else in this
 * rule set or in validation.ts catches that; this is the dedicated check.
 */
function openingOverlaps(context: RuleContext): ValidationResult[] {
  const byWall = new Map<string, Array<{ id: string; label: string; position: number; halfWidth: number }>>();

  for (const door of context.floorPlan.doors) {
    const list = byWall.get(door.wallId) ?? [];
    list.push({ id: door.id, label: 'Door', position: door.position.x, halfWidth: halfWidthInPlanUnits(door, context.floorPlan) });
    byWall.set(door.wallId, list);
  }
  for (const win of context.floorPlan.windows) {
    const list = byWall.get(win.wallId) ?? [];
    list.push({ id: win.id, label: 'Window', position: win.position.x, halfWidth: halfWidthInPlanUnits(win, context.floorPlan) });
    byWall.set(win.wallId, list);
  }

  const results: ValidationResult[] = [];
  for (const openings of byWall.values()) {
    const sorted = [...openings].sort((a, b) => a.position - b.position);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (a.position + a.halfWidth > b.position - b.halfWidth) {
        results.push({
          id: `validation-${a.id}-${b.id}-overlap`,
          type: 'error',
          message: `${a.label} and ${b.label} overlap on the same wall.`,
          remediation: 'Move one opening along the wall, or onto a different wall, so they no longer share space.',
          targetId: b.id,
          rule: 'opening-overlap',
        });
      }
    }
  }
  return results;
}

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
      id: 'opening-overlap',
      summary: 'Doors and windows on the same wall do not overlap each other.',
      evaluate: (context) => openingOverlaps(context),
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
