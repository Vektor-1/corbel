import type { Door, Point, Wall, Window } from '@/types/design';

const EPSILON = 0.0001;

const lerpPoint = (start: Point, end: Point, t: number): Point => ({
  x: start.x + (end.x - start.x) * t,
  y: start.y + (end.y - start.y) * t,
});

function segmentIntersection(first: Wall, second: Wall) {
  const p = first.startPoint;
  const r = {
    x: first.endPoint.x - first.startPoint.x,
    y: first.endPoint.y - first.startPoint.y,
  };
  const q = second.startPoint;
  const s = {
    x: second.endPoint.x - second.startPoint.x,
    y: second.endPoint.y - second.startPoint.y,
  };

  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < EPSILON) return null;

  const qMinusP = { x: q.x - p.x, y: q.y - p.y };
  const tFirst = (qMinusP.x * s.y - qMinusP.y * s.x) / cross;
  const tSecond = (qMinusP.x * r.y - qMinusP.y * r.x) / cross;

  if (tFirst < -EPSILON || tFirst > 1 + EPSILON || tSecond < -EPSILON || tSecond > 1 + EPSILON) {
    return null;
  }

  return {
    tFirst: Math.min(1, Math.max(0, tFirst)),
    tSecond: Math.min(1, Math.max(0, tSecond)),
  };
}

function splitWall(wall: Wall, parameters: number[]): Wall[] {
  const cuts = [0, ...parameters.filter((value) => value > EPSILON && value < 1 - EPSILON), 1]
    .sort((a, b) => a - b)
    .filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > EPSILON);

  return cuts.slice(0, -1).map((start, index) => {
    const startPoint = lerpPoint(wall.startPoint, wall.endPoint, start);
    const endPoint = lerpPoint(wall.startPoint, wall.endPoint, cuts[index + 1]);
    const suffix = `${Math.round(startPoint.x)}-${Math.round(startPoint.y)}-${Math.round(endPoint.x)}-${Math.round(endPoint.y)}`;

    return {
      ...wall,
      id: index === 0 ? wall.id : `${wall.id}-split-${suffix}`,
      startPoint,
      endPoint,
    };
  });
}

/**
 * Inserts a wall into a planar wall graph and splits both the new and existing
 * segments wherever they intersect. Collinear overlaps are left unchanged.
 */
export function insertWallWithIntersections(existingWalls: Wall[], newWall: Wall): Wall[] {
  const existingCuts = new Map<string, number[]>();
  const newCuts: number[] = [];

  for (const wall of existingWalls) {
    const intersection = segmentIntersection(wall, newWall);
    if (!intersection) continue;

    if (intersection.tFirst > EPSILON && intersection.tFirst < 1 - EPSILON) {
      existingCuts.set(wall.id, [...(existingCuts.get(wall.id) ?? []), intersection.tFirst]);
    }
    if (intersection.tSecond > EPSILON && intersection.tSecond < 1 - EPSILON) {
      newCuts.push(intersection.tSecond);
    }
  }

  const splitExisting = existingWalls.flatMap((wall) => splitWall(wall, existingCuts.get(wall.id) ?? []));
  return [...splitExisting, ...splitWall(newWall, newCuts)];
}

export function pointAlongWall(wall: Wall, offset: number): Point {
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const length = Math.hypot(dx, dy) || 1;
  return {
    x: wall.startPoint.x + (dx / length) * offset,
    y: wall.startPoint.y + (dy / length) * offset,
  };
}

export function rehostWallOpening<T extends Door | Window>(
  opening: T,
  previousWalls: Wall[],
  nextWalls: Wall[]
): T {
  const previousWall = previousWalls.find((wall) => wall.id === opening.wallId);
  if (!previousWall) return opening;

  const worldPoint = pointAlongWall(previousWall, opening.position.x);
  const previousDx = previousWall.endPoint.x - previousWall.startPoint.x;
  const previousDy = previousWall.endPoint.y - previousWall.startPoint.y;
  const previousLength = Math.hypot(previousDx, previousDy) || 1;

  const candidate = nextWalls.find((wall) => {
    if (!(wall.id === previousWall.id || wall.id.startsWith(`${previousWall.id}-split-`))) return false;
    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const length = Math.hypot(dx, dy) || 1;
    const parallelError = Math.abs(previousDx * dy - previousDy * dx) / (previousLength * length);
    if (parallelError > 0.001) return false;

    const projection = ((worldPoint.x - wall.startPoint.x) * dx + (worldPoint.y - wall.startPoint.y) * dy) / (length * length);
    return projection >= -EPSILON && projection <= 1 + EPSILON;
  });

  if (!candidate) return opening;

  const dx = candidate.endPoint.x - candidate.startPoint.x;
  const dy = candidate.endPoint.y - candidate.startPoint.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = Math.max(0, Math.min(length, ((worldPoint.x - candidate.startPoint.x) * dx + (worldPoint.y - candidate.startPoint.y) * dy) / length));

  return { ...opening, wallId: candidate.id, position: { ...opening.position, x: offset } };
}
