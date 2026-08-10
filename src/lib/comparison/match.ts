import { pointAlongWall } from '@/lib/geometry/wall-intersections';
import { polygonCentroid } from '@/lib/geometry/rooms';
import type { Door, Point, Room, Wall, Window } from '@/types/design';
import type { ElementMatch, MatchStatus } from './types';

const ENDPOINT_TOLERANCE = 12;
const ANGLE_TOLERANCE = Math.PI / 18;
const OFFSET_RATIO_TOLERANCE = 0.08;
const EPSILON = 1e-9;

const distance = (left: Point, right: Point) => Math.hypot(left.x - right.x, left.y - right.y);
const wallLength = (wall: Wall) => distance(wall.startPoint, wall.endPoint);

const wallAngle = (wall: Wall) => Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
const angleDistance = (left: number, right: number) => {
  const delta = Math.abs(left - right) % Math.PI;
  return Math.min(delta, Math.PI - delta);
};

const endpointDistance = (left: Wall, right: Wall) => Math.min(
  distance(left.startPoint, right.startPoint) + distance(left.endPoint, right.endPoint),
  distance(left.startPoint, right.endPoint) + distance(left.endPoint, right.startPoint)
);

function statusForWalls(original: Wall, redesign: Wall, endpoints: number): MatchStatus {
  if (endpoints <= EPSILON && original.thickness === redesign.thickness && wallLength(original) === wallLength(redesign)) return 'unchanged';
  if (Math.abs(wallLength(original) - wallLength(redesign)) > ENDPOINT_TOLERANCE || original.thickness !== redesign.thickness) return 'resized';
  return 'moved';
}

export function matchWalls(original: Wall[], redesign: Wall[]): ElementMatch[] {
  const used = new Set<string>();
  const matches: ElementMatch[] = [];

  for (const source of original) {
    let best: { wall: Wall; endpoints: number } | undefined;
    for (const candidate of redesign) {
      if (used.has(candidate.id) || angleDistance(wallAngle(source), wallAngle(candidate)) > ANGLE_TOLERANCE) continue;
      const endpoints = endpointDistance(source, candidate);
      if (!best || endpoints < best.endpoints) best = { wall: candidate, endpoints };
    }
    if (!best || best.endpoints > ENDPOINT_TOLERANCE * 8) {
      matches.push({ originalId: source.id, redesignId: null, status: 'removed' });
      continue;
    }
    used.add(best.wall.id);
    matches.push({ originalId: source.id, redesignId: best.wall.id, status: statusForWalls(source, best.wall, best.endpoints) });
  }
  for (const candidate of redesign) if (!used.has(candidate.id)) matches.push({ originalId: null, redesignId: candidate.id, status: 'added' });
  return matches;
}

const polygonArea = (vertices: Point[]) => Math.abs(vertices.reduce((sum, point, index) => {
  const next = vertices[(index + 1) % vertices.length];
  return sum + point.x * next.y - next.x * point.y;
}, 0) / 2);

const inside = (point: Point, edgeStart: Point, edgeEnd: Point) =>
  (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x) >= -EPSILON;

const intersection = (from: Point, to: Point, edgeStart: Point, edgeEnd: Point): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const ex = edgeEnd.x - edgeStart.x;
  const ey = edgeEnd.y - edgeStart.y;
  const denominator = dx * ey - dy * ex;
  if (Math.abs(denominator) <= EPSILON) return to;
  const t = ((edgeStart.x - from.x) * ey - (edgeStart.y - from.y) * ex) / denominator;
  return { x: from.x + t * dx, y: from.y + t * dy };
};

/** Convex clipping is sufficient for the editor's room polygons (bounded wall faces). */
const clippedIntersection = (subject: Point[], clip: Point[]) => {
  let output = subject;
  const clockwise = clip.reduce((sum, point, index) => {
    const next = clip[(index + 1) % clip.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) < 0;
  const clipVertices = clockwise ? [...clip].reverse() : clip;
  for (let index = 0; index < clipVertices.length; index += 1) {
    const edgeStart = clipVertices[index];
    const edgeEnd = clipVertices[(index + 1) % clipVertices.length];
    const input = output;
    output = [];
    for (let pointIndex = 0; pointIndex < input.length; pointIndex += 1) {
      const current = input[pointIndex];
      const previous = input[(pointIndex - 1 + input.length) % input.length];
      const currentInside = inside(current, edgeStart, edgeEnd);
      const previousInside = inside(previous, edgeStart, edgeEnd);
      if (currentInside !== previousInside) output.push(intersection(previous, current, edgeStart, edgeEnd));
      if (currentInside) output.push(current);
    }
  }
  return output;
};

export const polygonIoU = (left: Point[], right: Point[]) => {
  const overlap = polygonArea(clippedIntersection(left, right));
  const union = polygonArea(left) + polygonArea(right) - overlap;
  return union <= EPSILON ? 0 : overlap / union;
};

const normalizedName = (room: Room) => room.name.trim().toLocaleLowerCase();

export function matchRooms(original: Room[], redesign: Room[]): ElementMatch[] {
  const used = new Set<string>();
  const matches: ElementMatch[] = [];
  for (const source of original) {
    let best: { room: Room; iou: number } | undefined;
    for (const candidate of redesign) {
      if (used.has(candidate.id)) continue;
      const iou = polygonIoU(source.vertices, candidate.vertices);
      if (!best || iou > best.iou) best = { room: candidate, iou };
    }
    const fallback = redesign.find((candidate) => !used.has(candidate.id) && normalizedName(candidate) !== '' && normalizedName(candidate) === normalizedName(source));
    const candidate = best && best.iou >= 0.5 ? best.room : fallback;
    if (!candidate) {
      matches.push({ originalId: source.id, redesignId: null, status: 'removed' });
      continue;
    }
    used.add(candidate.id);
    const sourceCentroid = polygonCentroid(source.vertices);
    const redesignCentroid = polygonCentroid(candidate.vertices);
    const status: MatchStatus = Math.abs(source.area - candidate.area) > EPSILON ? 'resized' : distance(sourceCentroid, redesignCentroid) > EPSILON ? 'moved' : 'unchanged';
    matches.push({ originalId: source.id, redesignId: candidate.id, status });
  }
  for (const candidate of redesign) if (!used.has(candidate.id)) matches.push({ originalId: null, redesignId: candidate.id, status: 'added' });
  return matches;
}

type Opening = Door | Window;
const offsetRatio = (opening: Opening, wall: Wall) => opening.position.x / Math.max(wallLength(wall), EPSILON);

export function matchOpenings(original: Opening[], redesign: Opening[], wallMatches: ElementMatch[], originalWalls: Wall[], redesignWalls: Wall[]): ElementMatch[] {
  const originalById = new Map(originalWalls.map((wall) => [wall.id, wall]));
  const redesignById = new Map(redesignWalls.map((wall) => [wall.id, wall]));
  const matchedWalls = new Map(wallMatches.flatMap((match) => match.originalId && match.redesignId ? [[match.originalId, match.redesignId] as const] : []));
  const used = new Set<string>();
  const matches: ElementMatch[] = [];
  for (const source of original) {
    const sourceWall = originalById.get(source.wallId);
    const hostId = matchedWalls.get(source.wallId);
    const hostWall = hostId ? redesignById.get(hostId) : undefined;
    if (!sourceWall || !hostWall) { matches.push({ originalId: source.id, redesignId: null, status: 'removed' }); continue; }
    const sourceRatio = offsetRatio(source, sourceWall);
    const candidate = redesign.find((opening) => !used.has(opening.id) && opening.wallId === hostId && Math.abs(offsetRatio(opening, hostWall) - sourceRatio) <= OFFSET_RATIO_TOLERANCE);
    if (!candidate) { matches.push({ originalId: source.id, redesignId: null, status: 'removed' }); continue; }
    used.add(candidate.id);
    const sourcePoint = pointAlongWall(sourceWall, source.position.x);
    const redesignPoint = pointAlongWall(hostWall, candidate.position.x);
    matches.push({ originalId: source.id, redesignId: candidate.id, status: source.width !== candidate.width ? 'resized' : distance(sourcePoint, redesignPoint) <= EPSILON ? 'unchanged' : 'moved' });
  }
  for (const candidate of redesign) if (!used.has(candidate.id)) matches.push({ originalId: null, redesignId: candidate.id, status: 'added' });
  return matches;
}
