import type { FloorPlan } from '@/types/design';
import { matchOpenings, matchRooms, matchWalls } from './match';
import { computeMetricDeltas } from './metrics';
import { evaluateRubric } from './rubric';
import type { ComparisonReport, ElementMatch } from './types';

export type { ComparisonReport, ElementMatch, MatchStatus, MetricDelta, MetricDeltas, RoomAreaDelta, RubricCriterion, RubricResult } from './types';

export function compareFloorPlans(original: FloorPlan, redesign: FloorPlan): ComparisonReport {
  const walls = matchWalls(original.walls, redesign.walls);
  const rooms = matchRooms(original.rooms, redesign.rooms);
  const openings = [...matchOpenings(original.doors, redesign.doors, walls, original.walls, redesign.walls), ...matchOpenings(original.windows, redesign.windows, walls, original.walls, redesign.walls)];
  const allMatches = [...walls, ...rooms, ...openings];
  const counts: ComparisonReport['counts'] = { added: 0, removed: 0, moved: 0, resized: 0, unchanged: 0 };
  allMatches.forEach((match: ElementMatch) => { counts[match.status] += 1; });
  const originalRooms = new Map(original.rooms.map((room) => [room.id, room]));
  const redesignRooms = new Map(redesign.rooms.map((room) => [room.id, room]));
  return {
    walls,
    rooms,
    openings,
    metrics: computeMetricDeltas(original, redesign, rooms),
    rubric: evaluateRubric(original, redesign),
    counts,
    roomAreas: rooms.map((match) => ({ name: (match.redesignId ? redesignRooms.get(match.redesignId)?.name : originalRooms.get(match.originalId ?? '')?.name) ?? 'Room', originalArea: match.originalId ? originalRooms.get(match.originalId)?.area ?? null : null, redesignArea: match.redesignId ? redesignRooms.get(match.redesignId)?.area ?? null : null })),
  };
}
