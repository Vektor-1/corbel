import type { Point } from '@/types/design';
import type { DetectedWall } from './types';

/**
 * Reconnects straight walls that the upstream vectorizer split into fragments.
 *
 * Skeletonisation emits one segment per graph edge, so any pixel noise on a wall
 * boundary that creates a spurious skeleton node also splits an otherwise straight
 * wall into a chain of short segments. The backend's own collinear merge
 * (`backend/app/topology.py`) requires adjacent segments to agree within 5 degrees
 * and 2px, which is tighter than the hatch-pattern ripple that causes the problem in
 * the first place -- measured against the worst case, it recovered one wall out of
 * thirty-two.
 *
 * The difference here is that angle is treated as the unreliable signal it is on a
 * short fragment, while perpendicular offset is treated as the reliable one:
 *  - the angle tolerance widens as segments get shorter (`angleToleranceRad`), and
 *  - every accepted merge must still fit a single line through all four endpoints
 *    within `maxOffsetPx`, so a widened angle can never bend a corner into a wall.
 *
 * Merging runs on detections, before scale conversion, so both import providers
 * (hosted vision LLM and the self-hosted ML backend) get the same treatment.
 */

export interface WallMergeOptions {
  /** Largest end-to-end gap that may be closed. Never bridges more than this. */
  maxGapPx: number;
  /** Largest perpendicular deviation of any endpoint from the fitted line. */
  maxOffsetPx: number;
  /** Angle tolerance applied to a segment of `referenceLengthPx`. */
  baseAngleDeg: number;
  /** Ceiling on the widened tolerance, so very short fragments stay bounded. */
  maxAngleDeg: number;
  /** Length at which `baseAngleDeg` applies; shorter segments widen from here. */
  referenceLengthPx: number;
  /** Largest relative thickness difference between two merge candidates. */
  maxThicknessRatioDelta: number;
}

/**
 * Tuned empirically against `scripts/benchmark-wall-merge.ts`, medians over 20 seeds.
 *
 * `maxOffsetPx` is capped at 3 rather than raised for recall: at 5 the pass starts
 * merging the two sides of a 5px corridor into one wall, which is a far worse
 * failure than leaving a wall fragmented. 3 keeps roughly double the margin, and
 * raising it to 4 bought only 128 -> 122 walls at 2px ripple.
 *
 * `maxAngleDeg` at 35 beat 25 at every ripple level (13 -> 8 walls at 1px) while
 * changing none of the safety guards, because the perpendicular-offset and
 * line-fit checks -- not the angle gate -- are what actually stop a corner merging.
 */
export const DEFAULT_WALL_MERGE_OPTIONS: WallMergeOptions = {
  maxGapPx: 6,
  maxOffsetPx: 3,
  baseAngleDeg: 5,
  maxAngleDeg: 35,
  referenceLengthPx: 40,
  maxThicknessRatioDelta: 0.35,
};

export interface WallMergeResult {
  walls: DetectedWall[];
  /** Maps every input wall id to the id of the wall it ended up part of. */
  remap: Map<string, string>;
  /** Number of input walls absorbed into another wall. */
  mergedCount: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

const wallLength = (wall: DetectedWall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

function pointLineDistance(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-9) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
}

/**
 * A short fragment's direction is estimated from few pixels, so it carries more
 * angular error than a long one. Widen the tolerance in inverse proportion to
 * length rather than applying one fixed angle to every segment.
 */
function angleToleranceRad(lengthPx: number, options: WallMergeOptions): number {
  const widening = Math.max(1, options.referenceLengthPx / Math.max(lengthPx, 1e-6));
  return toRad(Math.min(options.maxAngleDeg, options.baseAngleDeg * widening));
}

/** Unsigned angle between two undirected segments, folded into [0, pi/2]. */
function undirectedAngle(a: DetectedWall, b: DetectedWall): number {
  const aLength = wallLength(a);
  const bLength = wallLength(b);
  if (aLength < 1e-9 || bLength < 1e-9) return 0;
  const ax = (a.end.x - a.start.x) / aLength;
  const ay = (a.end.y - a.start.y) / aLength;
  const bx = (b.end.x - b.start.x) / bLength;
  const by = (b.end.y - b.start.y) / bLength;
  const cosine = Math.min(1, Math.abs(ax * bx + ay * by));
  return Math.acos(cosine);
}

/**
 * Total-least-squares line through weighted points, as the principal eigenvector of
 * the covariance matrix. Ordinary least squares would fail on vertical walls.
 */
function fitLine(points: Point[], weights: number[]): { origin: Point; dx: number; dy: number } {
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const origin = {
    x: points.reduce((sum, point, index) => sum + point.x * weights[index], 0) / totalWeight,
    y: points.reduce((sum, point, index) => sum + point.y * weights[index], 0) / totalWeight,
  };

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  points.forEach((point, index) => {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    sxx += weights[index] * dx * dx;
    syy += weights[index] * dy * dy;
    sxy += weights[index] * dx * dy;
  });

  // Principal eigenvector of [[sxx, sxy], [sxy, syy]].
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { origin, dx: Math.cos(theta), dy: Math.sin(theta) };
}

/** Signed distance of a point along a line direction, measured from its origin. */
const projectOnto = (point: Point, line: { origin: Point; dx: number; dy: number }) =>
  (point.x - line.origin.x) * line.dx + (point.y - line.origin.y) * line.dy;

/**
 * Attempts to combine two walls into one. Returns null when they should stay
 * separate, so a rejected pair is always a no-op rather than a degraded merge.
 */
function tryMerge(a: DetectedWall, b: DetectedWall, options: WallMergeOptions): DetectedWall | null {
  const aLength = wallLength(a);
  const bLength = wallLength(b);
  if (aLength < 1e-9 || bLength < 1e-9) return null;

  const tolerance = Math.max(angleToleranceRad(aLength, options), angleToleranceRad(bLength, options));
  if (undirectedAngle(a, b) > tolerance) return null;

  const aThickness = a.thicknessMm ?? 0;
  const bThickness = b.thicknessMm ?? 0;
  if (aThickness > 0 && bThickness > 0) {
    const delta = Math.abs(aThickness - bThickness) / Math.max(aThickness, bThickness);
    if (delta > options.maxThicknessRatioDelta) return null;
  }

  const endpoints = [a.start, a.end, b.start, b.end];
  const weights = [aLength, aLength, bLength, bLength];
  const line = fitLine(endpoints, weights);

  // A widened angle tolerance is only safe because this check still has to pass:
  // four endpoints that do not sit on one line are a corner, not a split wall.
  const maxResidual = Math.max(
    ...endpoints.map((point) =>
      pointLineDistance(point, line.origin, { x: line.origin.x + line.dx, y: line.origin.y + line.dy })
    )
  );
  if (maxResidual > options.maxOffsetPx) return null;

  const aProjected = [projectOnto(a.start, line), projectOnto(a.end, line)].sort((x, y) => x - y);
  const bProjected = [projectOnto(b.start, line), projectOnto(b.end, line)].sort((x, y) => x - y);

  // Positive when the segments are apart, negative when they overlap. Never close a
  // gap wider than the threshold -- an opening is a gap we must not invent through.
  const gap = Math.max(aProjected[0], bProjected[0]) - Math.min(aProjected[1], bProjected[1]);
  if (gap > options.maxGapPx) return null;

  const low = Math.min(aProjected[0], bProjected[0]);
  const high = Math.max(aProjected[1], bProjected[1]);
  const pointAt = (distance: number): Point => ({
    x: line.origin.x + line.dx * distance,
    y: line.origin.y + line.dy * distance,
  });

  const totalLength = aLength + bLength;
  const dominant = aLength >= bLength ? a : b;

  return {
    ...dominant,
    kind: 'wall',
    start: pointAt(low),
    end: pointAt(high),
    thicknessMm:
      aThickness > 0 && bThickness > 0
        ? (aThickness * aLength + bThickness * bLength) / totalLength
        : (a.thicknessMm ?? b.thicknessMm),
    // A merged wall is only as trustworthy as its weakest contributor.
    confidence: Math.min(a.confidence, b.confidence),
    role: a.role === 'loadBearing' || b.role === 'loadBearing' ? 'loadBearing' : dominant.role,
  };
}

/**
 * Cheap screen used only to group candidates. Tests against `a`'s own line rather
 * than a fitted one, so grouping costs no eigen-decomposition; every grouped pair
 * is re-checked properly by `tryMerge` afterwards.
 */
function couldShareALine(a: DetectedWall, b: DetectedWall, options: WallMergeOptions): boolean {
  const aLength = wallLength(a);
  const bLength = wallLength(b);
  if (aLength < 1e-9 || bLength < 1e-9) return false;

  const tolerance = Math.max(angleToleranceRad(aLength, options), angleToleranceRad(bLength, options));
  if (undirectedAngle(a, b) > tolerance) return false;

  const offset = Math.max(
    pointLineDistance(b.start, a.start, a.end),
    pointLineDistance(b.end, a.start, a.end)
  );
  return offset <= options.maxOffsetPx;
}

/**
 * Merges every collinear run in `walls`. Idempotent: running it on its own output
 * produces the same walls and no further merges.
 *
 * Two passes. The first unions walls that could plausibly share a line, which is
 * O(n^2) cheap tests. The second walks each group in order along its own fitted
 * direction and merges neighbours one at a time, so a group that turns out to bend
 * partway along splits into runs instead of being rejected wholesale. Merging every
 * globally-best pair instead is O(n^3) and does not terminate in useful time on the
 * few-hundred-fragment plans this exists to fix.
 */
export function mergeCollinearWalls(
  walls: DetectedWall[],
  overrides: Partial<WallMergeOptions> = {}
): WallMergeResult {
  const options = { ...DEFAULT_WALL_MERGE_OPTIONS, ...overrides };
  const remap = new Map<string, string>(walls.map((wall) => [wall.id, wall.id]));
  if (walls.length < 2) return { walls: [...walls], remap, mergedCount: 0 };

  // Stable ordering keeps the result deterministic regardless of detection order.
  const current = [...walls].sort((a, b) => a.id.localeCompare(b.id));

  const parent = current.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      parent[root] = parent[parent[root]];
      root = parent[root];
    }
    return root;
  };
  for (let i = 0; i < current.length; i++) {
    for (let j = i + 1; j < current.length; j++) {
      if (!couldShareALine(current[i], current[j], options)) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    }
  }

  const groups = new Map<number, number[]>();
  current.forEach((_, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  });

  const output: DetectedWall[] = [];
  const absorb = (run: DetectedWall, ids: string[]) => {
    output.push(run);
    for (const id of ids) remap.set(id, run.id);
  };

  for (const group of groups.values()) {
    const members = group.map((index) => current[index]);
    if (members.length === 1) {
      output.push(members[0]);
      continue;
    }

    const endpoints = members.flatMap((wall) => [wall.start, wall.end]);
    const weights = members.flatMap((wall) => [wallLength(wall), wallLength(wall)]);
    const line = fitLine(endpoints, weights);
    members.sort(
      (a, b) =>
        projectOnto({ x: (a.start.x + a.end.x) / 2, y: (a.start.y + a.end.y) / 2 }, line) -
        projectOnto({ x: (b.start.x + b.end.x) / 2, y: (b.start.y + b.end.y) / 2 }, line)
    );

    let run = members[0];
    let runIds = [members[0].id];
    for (let index = 1; index < members.length; index++) {
      const merged = tryMerge(run, members[index], options);
      if (merged) {
        run = merged;
        runIds.push(members[index].id);
      } else {
        absorb(run, runIds);
        run = members[index];
        runIds = [members[index].id];
      }
    }
    absorb(run, runIds);
  }

  return {
    walls: output.sort((a, b) => a.id.localeCompare(b.id)),
    remap,
    mergedCount: walls.length - output.length,
  };
}

/** Point at a 0..1 ratio along a wall. */
export const pointAtRatio = (wall: DetectedWall, ratio: number): Point => ({
  x: wall.start.x + (wall.end.x - wall.start.x) * ratio,
  y: wall.start.y + (wall.end.y - wall.start.y) * ratio,
});

/**
 * Where `point` falls along `wall`, as a 0..1 ratio. Used to carry a door or window
 * from the fragment it was detected on across to the merged wall that replaced it.
 */
export function ratioAlongWall(wall: DetectedWall, point: Point): number {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-12) return 0;
  const ratio = ((point.x - wall.start.x) * dx + (point.y - wall.start.y) * dy) / lengthSquared;
  return Math.min(1, Math.max(0, ratio));
}
