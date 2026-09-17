import TraceSkeleton from 'skeleton-tracing-js';
import type { SegWallSegment, SegOpening, SegmentationVector } from './geometry-provider';

// Days 2-3 of docs/corbel-ship-segmentation-plan.md: TypeScript port of
// ml/vectorize.py's deterministic mask-to-vector pipeline (Day 5 of
// docs/corbel-custom-geometry-model-plan.md), so custom-seg can run
// entirely in the browser. Skeletonization + polyline tracing is
// `skeleton-tracing-js` (verified Day 1: MIT, real npm package, bundles
// its own Zhang-Suen thinning, 1.67-1.79px Chamfer agreement against the
// Python medial_axis-based vectorizer on identical G0-predicted masks —
// tighter than the Python vectorizer's own agreement with ground truth).
// Connected components, the distance transform (for wall thickness,
// which the library doesn't provide), and Douglas-Peucker simplification
// have no equivalent in that library and are ported directly below.

const MIN_WALL_COMPONENT_AREA = 25; // px^2, matches ml/vectorize.py's MIN_COMPONENT_AREA
const MIN_OPENING_COMPONENT_AREA = 9; // px^2, matches vectorize_openings()'s min_area=9
const APPROX_EPSILON_FRAC = 0.01; // fraction of polyline arc length, matches APPROX_EPSILON_FRAC
const OPENING_MAX_ATTACH_DIST = 40.0; // px, matches attach_openings_to_walls()'s max_dist
// Skeleton tracing terminates polylines at graph junctions. These bounds
// reconnect only a visibly continuous, nearly-straight run; they deliberately
// exclude parallel walls and genuine corners.
const STRAIGHT_WALL_MAX_DEVIATION = 5;
const COLLINEAR_MERGE_MAX_GAP = 6;
const COLLINEAR_MERGE_MAX_SINE = Math.sin(Math.PI / 18); // 10 degrees

interface ComponentStats {
  area: number;
  sumX: number;
  sumY: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// 8-connectivity flood-fill connected-component labeling. labels[i] is
// 0 for background/unlabeled, else a 1-indexed component id; stats[id-1]
// holds that component's pixel-count/centroid-sum/bbox.
function labelComponents(
  mask: Uint8Array,
  width: number,
  height: number
): { labels: Int32Array; stats: ComponentStats[] } {
  const labels = new Int32Array(width * height);
  const stats: ComponentStats[] = [];
  const stackX = new Int32Array(width * height);
  const stackY = new Int32Array(width * height);
  let nextLabel = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] === 0 || labels[idx] !== 0) continue;
      nextLabel++;
      let sp = 0;
      stackX[sp] = x;
      stackY[sp] = y;
      sp++;
      labels[idx] = nextLabel;
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      while (sp > 0) {
        sp--;
        const cx = stackX[sp];
        const cy = stackY[sp];
        area++;
        sumX += cx;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nIdx = ny * width + nx;
            if (mask[nIdx] !== 0 && labels[nIdx] === 0) {
              labels[nIdx] = nextLabel;
              stackX[sp] = nx;
              stackY[sp] = ny;
              sp++;
            }
          }
        }
      }
      stats.push({ area, sumX, sumY, minX, minY, maxX, maxY });
    }
  }
  return { labels, stats };
}

/** Drops connected components smaller than minArea, mirrors ml/vectorize.py's _clean_binary_mask. */
export function cleanBinaryMask(mask: Uint8Array, width: number, height: number, minArea: number): Uint8Array {
  const { labels, stats } = labelComponents(mask, width, height);
  const out = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (label > 0 && stats[label - 1].area >= minArea) {
      out[i] = 1;
    }
  }
  return out;
}

const CHAMFER_D1 = 1;
const CHAMFER_D2 = Math.SQRT2;

/**
 * Two-pass 3-4 chamfer distance transform: distance from every foreground
 * pixel to the nearest background (0) pixel. Standard, cheap (two array
 * passes), approximate-but-adequate replacement for
 * skimage.morphology.medial_axis's return_distance=True output -- used
 * only for wall thickness estimation, not gated on exact precision
 * (geometry-provider.ts already floors thicknessMm at 75mm regardless).
 */
export function chamferDistanceTransform(mask: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e6;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] !== 0 ? INF : 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let best = dist[idx];
      if (x > 0) best = Math.min(best, dist[idx - 1] + CHAMFER_D1);
      if (y > 0) best = Math.min(best, dist[idx - width] + CHAMFER_D1);
      if (x > 0 && y > 0) best = Math.min(best, dist[idx - width - 1] + CHAMFER_D2);
      if (x < width - 1 && y > 0) best = Math.min(best, dist[idx - width + 1] + CHAMFER_D2);
      dist[idx] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const idx = y * width + x;
      if (dist[idx] === 0) continue;
      let best = dist[idx];
      if (x < width - 1) best = Math.min(best, dist[idx + 1] + CHAMFER_D1);
      if (y < height - 1) best = Math.min(best, dist[idx + width] + CHAMFER_D1);
      if (x < width - 1 && y < height - 1) best = Math.min(best, dist[idx + width + 1] + CHAMFER_D2);
      if (x > 0 && y < height - 1) best = Math.min(best, dist[idx + width - 1] + CHAMFER_D2);
      dist[idx] = best;
    }
  }
  return dist;
}

function pointLineDistance(p: [number, number], a: [number, number], b: [number, number]): number {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/** Standard recursive Douglas-Peucker simplification, mirrors cv2.approxPolyDP's role in ml/vectorize.py. */
export function douglasPeucker(points: [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

function arcLength(points: [number, number][]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return len;
}

function isNearlyStraight(points: [number, number][]): boolean {
  if (points.length < 2) return false;
  const start = points[0];
  const end = points[points.length - 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return length > 0 && points.every((point) => pointLineDistance(point, start, end) <= STRAIGHT_WALL_MAX_DEVIATION);
}

function normalizedDirection(points: [number, number][]): [number, number] {
  const start = points[0];
  const end = points[points.length - 1];
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
}

function mergeStraightWallSegments(a: SegWallSegment, b: SegWallSegment): SegWallSegment | null {
  if (!isNearlyStraight(a.points) || !isNearlyStraight(b.points)) return null;

  const [adx, ady] = normalizedDirection(a.points);
  const [bdx, bdy] = normalizedDirection(b.points);
  if (Math.abs(adx * bdy - ady * bdx) > COLLINEAR_MERGE_MAX_SINE) return null;

  const aStart = a.points[0];
  const bEndpoints = [b.points[0], b.points[b.points.length - 1]];
  if (bEndpoints.some((point) => pointLineDistance(point, a.points[0], a.points[a.points.length - 1]) > STRAIGHT_WALL_MAX_DEVIATION)) {
    return null;
  }

  const project = (point: [number, number]) => (point[0] - aStart[0]) * adx + (point[1] - aStart[1]) * ady;
  const aInterval = [project(a.points[0]), project(a.points[a.points.length - 1])].sort((x, y) => x - y);
  const bInterval = [project(b.points[0]), project(b.points[b.points.length - 1])].sort((x, y) => x - y);
  if (Math.max(aInterval[0], bInterval[0]) - Math.min(aInterval[1], bInterval[1]) > COLLINEAR_MERGE_MAX_GAP) return null;

  const endpoints = [a.points[0], a.points[a.points.length - 1], b.points[0], b.points[b.points.length - 1]];
  let start = endpoints[0];
  let end = endpoints[1];
  let maxDistance = -1;
  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      const distance = Math.hypot(endpoints[j][0] - endpoints[i][0], endpoints[j][1] - endpoints[i][1]);
      if (distance > maxDistance) {
        maxDistance = distance;
        start = endpoints[i];
        end = endpoints[j];
      }
    }
  }

  const aLength = arcLength(a.points);
  const bLength = arcLength(b.points);
  return {
    points: [start, end],
    thicknessPx: (a.thicknessPx * aLength + b.thicknessPx * bLength) / (aLength + bLength),
  };
}

/** Reconnects collinear runs that the skeleton graph split at a junction. */
export function mergeCollinearWallRuns(segments: SegWallSegment[]): SegWallSegment[] {
  const merged = [...segments];
  let didMerge = true;
  while (didMerge) {
    didMerge = false;
    for (let i = 0; i < merged.length && !didMerge; i++) {
      for (let j = i + 1; j < merged.length; j++) {
        const combined = mergeStraightWallSegments(merged[i], merged[j]);
        if (!combined) continue;
        merged[i] = combined;
        merged.splice(j, 1);
        didMerge = true;
        break;
      }
    }
  }
  return merged;
}

/**
 * Threshold -> clean -> distance transform -> skeleton-tracing-js -> per
 * -polyline Douglas-Peucker simplify + thickness sampling. Mirrors
 * ml/vectorize.py's vectorize_walls().
 */
export function traceWalls(wallMask: Uint8Array, width: number, height: number): SegWallSegment[] {
  const clean = cleanBinaryMask(wallMask, width, height, MIN_WALL_COMPONENT_AREA);
  let hasForeground = false;
  for (let i = 0; i < clean.length; i++) {
    if (clean[i]) {
      hasForeground = true;
      break;
    }
  }
  if (!hasForeground) return [];

  const dist = chamferDistanceTransform(clean, width, height);
  // skeleton-tracing-js's thinningZS mutates its input in place -- pass a
  // copy so `dist` (computed on the un-thinned clean mask) stays valid.
  const traceInput = clean.slice();
  const { polylines } = TraceSkeleton.fromBoolArray(traceInput, width, height);

  const segments: SegWallSegment[] = [];
  for (const raw of polylines) {
    const points: [number, number][] = raw.map(([x, y]) => [x, y]);
    if (points.length < 2) continue;
    const eps = Math.max(1, APPROX_EPSILON_FRAC * arcLength(points));
    const simplified = douglasPeucker(points, eps);
    if (simplified.length < 2) continue;

    let sum = 0;
    let n = 0;
    for (const [x, y] of simplified) {
      const xi = Math.min(width - 1, Math.max(0, Math.round(x)));
      const yi = Math.min(height - 1, Math.max(0, Math.round(y)));
      sum += dist[yi * width + xi] * 2;
      n++;
    }
    segments.push({ points: simplified, thicknessPx: n > 0 ? sum / n : 0 });
  }
  return mergeCollinearWallRuns(segments);
}

/**
 * Connected components only (no contour tracing -- SegOpening never
 * carries a contour field downstream, confirmed against geometry-
 * provider.ts, so centroid+bbox from the component pass is sufficient).
 * Mirrors ml/vectorize.py's vectorize_openings().
 */
export function traceOpenings(
  mask: Uint8Array,
  width: number,
  height: number,
  cls: 'door' | 'window',
  minArea = MIN_OPENING_COMPONENT_AREA
): SegOpening[] {
  const { labels, stats } = labelComponents(mask, width, height);
  const openings: SegOpening[] = [];
  for (const s of stats) {
    if (s.area < minArea) continue;
    const cx = s.sumX / s.area;
    const cy = s.sumY / s.area;
    openings.push({
      cls,
      centroid: [cx, cy],
      bboxPx: [s.minX, s.minY, s.maxX + 1, s.maxY + 1],
      hostWallIndex: null,
    });
  }
  void labels; // labels array only needed to build `stats`; kept for clarity of intent
  return openings;
}

/** Mirrors ml/vectorize.py's attach_openings_to_walls(). Mutates hostWallIndex in place. */
export function attachOpeningsToWalls(
  openings: SegOpening[],
  walls: SegWallSegment[],
  maxDist = OPENING_MAX_ATTACH_DIST
): void {
  for (const opening of openings) {
    let bestIdx: number | null = null;
    let bestDist = Infinity;
    walls.forEach((wall, wallIndex) => {
      for (let i = 0; i < wall.points.length - 1; i++) {
        const d = pointLineDistance(opening.centroid, wall.points[i], wall.points[i + 1]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = wallIndex;
        }
      }
    });
    if (bestIdx !== null && bestDist <= maxDist) {
      opening.hostWallIndex = bestIdx;
    }
  }
}

/**
 * TS equivalent of ml/vectorize.py's vectorize_mask_rgb(), but taking
 * three already-thresholded channel masks directly -- the shape live
 * inference actually has after sigmoid+threshold (Day 4), not a packed
 * RGB ImageData buffer that doesn't exist at that stage.
 */
export function vectorizeMasks(
  wallMask: Uint8Array,
  doorMask: Uint8Array,
  windowMask: Uint8Array,
  width: number,
  height: number
): SegmentationVector {
  const walls = traceWalls(wallMask, width, height);
  const doors = traceOpenings(doorMask, width, height, 'door');
  const windows = traceOpenings(windowMask, width, height, 'window');
  attachOpeningsToWalls([...doors, ...windows], walls);
  return { imageWidth: width, imageHeight: height, walls, doors, windows };
}
