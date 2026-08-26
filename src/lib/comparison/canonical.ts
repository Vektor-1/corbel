/**
 * Comparison engine for Canonical floor plans.
 * Matches walls, rooms, openings by proximity and computes deltas.
 */

import { Canonical } from '@/types/schema';
import type { MatchStatus, ElementMatch, MetricDelta } from './types';

const PROXIMITY_THRESHOLD = 500; // mm
const AREA_THRESHOLD = 0.2; // 20% delta

/**
 * Match walls by proximity (closest within threshold).
 */
export function matchCanonicalWalls(original: Canonical.Wall[], redesign: Canonical.Wall[]): ElementMatch[] {
  const matches: ElementMatch[] = [];
  const matched = new Set<string>();

  for (const origWall of original) {
    let closest: { id: string; distance: number } | null = null;

    for (const redesWall of redesign) {
      if (matched.has(redesWall.id)) continue;

      const distStart = Math.hypot(
        origWall.start.x - redesWall.start.x,
        origWall.start.y - redesWall.start.y
      );
      const distEnd = Math.hypot(origWall.end.x - redesWall.end.x, origWall.end.y - redesWall.end.y);
      const distance = Math.min(distStart, distEnd);

      if (distance < PROXIMITY_THRESHOLD && (!closest || distance < closest.distance)) {
        closest = { id: redesWall.id, distance };
      }
    }

    if (closest) {
      matched.add(closest.id);
      matches.push({
        originalId: origWall.id,
        redesignId: closest.id,
        status: closest.distance < 100 ? 'unchanged' : 'moved',
      });
    } else {
      matches.push({
        originalId: origWall.id,
        redesignId: null,
        status: 'removed',
      });
    }
  }

  // Remaining unmatched redesign walls are added
  for (const redesWall of redesign) {
    if (!matched.has(redesWall.id)) {
      matches.push({
        originalId: null,
        redesignId: redesWall.id,
        status: 'added',
      });
    }
  }

  return matches;
}

/**
 * Match rooms by area proximity.
 */
export function matchCanonicalRooms(original: Canonical.Room[], redesign: Canonical.Room[]): ElementMatch[] {
  const matches: ElementMatch[] = [];
  const matched = new Set<string>();

  for (const origRoom of original) {
    let closest: { id: string; areaDelta: number } | null = null;

    for (const redesRoom of redesign) {
      if (matched.has(redesRoom.id)) continue;

      const areaDelta = Math.abs(origRoom.area - redesRoom.area) / origRoom.area;
      if (areaDelta < AREA_THRESHOLD && (!closest || areaDelta < closest.areaDelta)) {
        closest = { id: redesRoom.id, areaDelta };
      }
    }

    if (closest) {
      matched.add(closest.id);
      const status: MatchStatus = closest.areaDelta < 0.05 ? 'unchanged' : 'resized';
      matches.push({
        originalId: origRoom.id,
        redesignId: closest.id,
        status,
      });
    } else {
      matches.push({
        originalId: origRoom.id,
        redesignId: null,
        status: 'removed',
      });
    }
  }

  for (const redesRoom of redesign) {
    if (!matched.has(redesRoom.id)) {
      matches.push({
        originalId: null,
        redesignId: redesRoom.id,
        status: 'added',
      });
    }
  }

  return matches;
}

/**
 * Match openings by host wall + position.
 */
export function matchCanonicalOpenings(
  original: Canonical.Opening[],
  redesign: Canonical.Opening[],
  wallMatches: ElementMatch[]
): ElementMatch[] {
  const matches: ElementMatch[] = [];
  const matched = new Set<string>();
  const wallMap = new Map(wallMatches.map((m) => [m.originalId, m.redesignId]));

  for (const origOpening of original) {
    const redesignWallId = wallMap.get(origOpening.hostWallId);
    if (!redesignWallId) {
      matches.push({
        originalId: origOpening.id,
        redesignId: null,
        status: 'removed',
      });
      continue;
    }

    let closest: { id: string; posDelta: number } | null = null;

    for (const redesOpening of redesign) {
      if (
        matched.has(redesOpening.id) ||
        redesOpening.kind !== origOpening.kind ||
        redesOpening.hostWallId !== redesignWallId
      )
        continue;

      const posDelta = Math.abs(origOpening.positionAlongWall - redesOpening.positionAlongWall);
      if (!closest || posDelta < closest.posDelta) {
        closest = { id: redesOpening.id, posDelta };
      }
    }

    if (closest && closest.posDelta < 200) {
      matched.add(closest.id);
      matches.push({
        originalId: origOpening.id,
        redesignId: closest.id,
        status: closest.posDelta < 50 ? 'unchanged' : 'moved',
      });
    } else {
      matches.push({
        originalId: origOpening.id,
        redesignId: null,
        status: 'removed',
      });
    }
  }

  for (const redesOpening of redesign) {
    if (!matched.has(redesOpening.id)) {
      matches.push({
        originalId: null,
        redesignId: redesOpening.id,
        status: 'added',
      });
    }
  }

  return matches;
}

/**
 * Compute metric deltas.
 */
export function computeCanonicalMetricDeltas(
  original: Canonical.Floor,
  redesign: Canonical.Floor
): MetricDelta[] {
  const origArea = original.rooms.reduce((sum, r) => sum + r.area, 0);
  const redesArea = redesign.rooms.reduce((sum, r) => sum + r.area, 0);

  const origWallLength = original.walls.reduce(
    (sum, w) => sum + Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y),
    0
  );
  const redesWallLength = redesign.walls.reduce(
    (sum, w) => sum + Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y),
    0
  );

  return [
    {
      label: 'Total floor area',
      original: origArea / 1e6,
      redesign: redesArea / 1e6,
      unit: 'm²',
    },
    {
      label: 'Total wall length',
      original: origWallLength / 1000,
      redesign: redesWallLength / 1000,
      unit: 'm',
    },
    {
      label: 'Room count',
      original: original.rooms.length,
      redesign: redesign.rooms.length,
      unit: 'rooms',
    },
    {
      label: 'Door count',
      original: original.openings.filter((o) => o.kind === 'door').length,
      redesign: redesign.openings.filter((o) => o.kind === 'door').length,
      unit: 'doors',
    },
    {
      label: 'Window count',
      original: original.openings.filter((o) => o.kind === 'window').length,
      redesign: redesign.openings.filter((o) => o.kind === 'window').length,
      unit: 'windows',
    },
  ];
}

/**
 * Compare two Canonical floors.
 */
export function compareCanonicalFloors(original: Canonical.Floor, redesign: Canonical.Floor) {
  const walls = matchCanonicalWalls(original.walls, redesign.walls);
  const rooms = matchCanonicalRooms(original.rooms, redesign.rooms);
  const openings = matchCanonicalOpenings(original.openings, redesign.openings, walls);

  return {
    walls,
    rooms,
    openings,
    metrics: computeCanonicalMetricDeltas(original, redesign),
  };
}
