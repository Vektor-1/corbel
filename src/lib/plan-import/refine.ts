import type { RawBox } from './local-ml';
import type { RawOpening, RawWall } from './pipeline';

// Domain-specific refinement: converts raw YOLO detection boxes into a
// topologically clean wall graph. Object detection has no notion that walls
// must meet at corners or run straight — this module imposes that.

const AXIS_SNAP_DEGREES = 8;
const JUNCTION_EPS_PX = 15;
const OVERLAP_MERGE_EPS_PX = 10;
const MIN_WALL_CONFIDENCE = 0.15;

interface Segment {
  id: string;
  startX: number; startY: number;
  endX: number; endY: number;
  thicknessMm: number;
  confidence: number;
}

// Geometry is refined in pixels. Convert detector-measured sizes only once
// calibration is known; the historical fallback is 100 pixels per metre.
function millimetresPerPixel(pixelsPerMeter: number): number {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) {
    throw new Error('A positive pixels-per-meter calibration is required.');
  }
  return 1000 / pixelsPerMeter;
}

// ── Step 1: box -> segment ────────────────────────────────────────────────────

function boxToSegment(box: RawBox, index: number, mmPerPixel: number): Segment | null {
  if (!validBox(box) || box.confidence < MIN_WALL_CONFIDENCE) return null;
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const horizontal = w >= h;
  return {
    id: `raw${index}`,
    startX: horizontal ? box.x0 : (box.x0 + box.x1) / 2,
    startY: horizontal ? (box.y0 + box.y1) / 2 : box.y0,
    endX: horizontal ? box.x1 : (box.x0 + box.x1) / 2,
    endY: horizontal ? (box.y0 + box.y1) / 2 : box.y1,
    thicknessMm: Math.round((horizontal ? h : w) * mmPerPixel),
    confidence: box.confidence,
  };
}

function validBox(box: RawBox): boolean {
  return [box.x0, box.y0, box.x1, box.y1, box.confidence].every(Number.isFinite) &&
    box.x1 > box.x0 && box.y1 > box.y0 && box.confidence >= 0 && box.confidence <= 1;
}

// ── Step 2: axis snapping ─────────────────────────────────────────────────────

function snapToAxis(seg: Segment): Segment {
  const dx = seg.endX - seg.startX;
  const dy = seg.endY - seg.startY;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const normalized = ((angle % 180) + 180) % 180;

  const nearestAxis =
    Math.min(normalized, 180 - normalized) <= AXIS_SNAP_DEGREES
      ? 0
      : Math.abs(normalized - 90) <= AXIS_SNAP_DEGREES
        ? 90
        : null;

  if (nearestAxis === null) return seg;

  const midX = (seg.startX + seg.endX) / 2;
  const midY = (seg.startY + seg.endY) / 2;
  const length = Math.hypot(dx, dy) / 2;

  if (nearestAxis === 0) {
    return { ...seg, startX: midX - length, startY: midY, endX: midX + length, endY: midY };
  }
  return { ...seg, startX: midX, startY: midY - length, endX: midX, endY: midY + length };
}

// ── Step 3: junction closing ───────────────────────────────────────────────────

function closeJunctions(segments: Segment[]): Segment[] {
  const points: { segIdx: number; end: 'start' | 'end'; x: number; y: number }[] = [];
  segments.forEach((seg, i) => {
    points.push({ segIdx: i, end: 'start', x: seg.startX, y: seg.startY });
    points.push({ segIdx: i, end: 'end', x: seg.endX, y: seg.endY });
  });

  const clusterOf = new Array(points.length).fill(-1);
  let nextCluster = 0;
  for (let i = 0; i < points.length; i++) {
    if (clusterOf[i] !== -1) continue;
    clusterOf[i] = nextCluster;
    for (let j = i + 1; j < points.length; j++) {
      if (clusterOf[j] !== -1) continue;
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <= JUNCTION_EPS_PX) {
        clusterOf[j] = nextCluster;
      }
    }
    nextCluster++;
  }

  const clusterCentroid = new Map<number, { sx: number; sy: number; n: number }>();
  points.forEach((p, i) => {
    const c = clusterOf[i];
    const acc = clusterCentroid.get(c) ?? { sx: 0, sy: 0, n: 0 };
    acc.sx += p.x; acc.sy += p.y; acc.n += 1;
    clusterCentroid.set(c, acc);
  });

  const result = segments.map((seg) => ({ ...seg }));
  points.forEach((p, i) => {
    const centroid = clusterCentroid.get(clusterOf[i])!;
    const x = centroid.sx / centroid.n;
    const y = centroid.sy / centroid.n;
    if (p.end === 'start') {
      result[p.segIdx].startX = x;
      result[p.segIdx].startY = y;
    } else {
      result[p.segIdx].endX = x;
      result[p.segIdx].endY = y;
    }
  });

  return result;
}

// ── Step 4: duplicate/overlap collapse ────────────────────────────────────────

function isCollinearOverlap(a: Segment, b: Segment): boolean {
  const aHorizontal = Math.abs(a.startY - a.endY) < Math.abs(a.startX - a.endX);
  const bHorizontal = Math.abs(b.startY - b.endY) < Math.abs(b.startX - b.endX);
  if (aHorizontal !== bHorizontal) return false;

  if (aHorizontal) {
    if (Math.abs(a.startY - b.startY) > OVERLAP_MERGE_EPS_PX) return false;
    const aMin = Math.min(a.startX, a.endX), aMax = Math.max(a.startX, a.endX);
    const bMin = Math.min(b.startX, b.endX), bMax = Math.max(b.startX, b.endX);
    return aMin <= bMax + OVERLAP_MERGE_EPS_PX && bMin <= aMax + OVERLAP_MERGE_EPS_PX;
  }
  if (Math.abs(a.startX - b.startX) > OVERLAP_MERGE_EPS_PX) return false;
  const aMin = Math.min(a.startY, a.endY), aMax = Math.max(a.startY, a.endY);
  const bMin = Math.min(b.startY, b.endY), bMax = Math.max(b.startY, b.endY);
  return aMin <= bMax + OVERLAP_MERGE_EPS_PX && bMin <= aMax + OVERLAP_MERGE_EPS_PX;
}

function mergeOverlaps(segments: Segment[]): Segment[] {
  const used = new Array(segments.length).fill(false);
  const merged: Segment[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    let group = [segments[i]];
    used[i] = true;
    for (let j = i + 1; j < segments.length; j++) {
      if (used[j]) continue;
      if (group.some((g) => isCollinearOverlap(g, segments[j]))) {
        group.push(segments[j]);
        used[j] = true;
      }
    }

    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    const horizontal = Math.abs(group[0].startY - group[0].endY) < Math.abs(group[0].startX - group[0].endX);
    const best = group.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    if (horizontal) {
      const xs = group.flatMap((s) => [s.startX, s.endX]);
      const avgY = group.reduce((sum, s) => sum + (s.startY + s.endY) / 2, 0) / group.length;
      merged.push({ ...best, startX: Math.min(...xs), endX: Math.max(...xs), startY: avgY, endY: avgY });
    } else {
      const ys = group.flatMap((s) => [s.startY, s.endY]);
      const avgX = group.reduce((sum, s) => sum + (s.startX + s.endX) / 2, 0) / group.length;
      merged.push({ ...best, startY: Math.min(...ys), endY: Math.max(...ys), startX: avgX, endX: avgX });
    }
  }

  return merged;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function refineWalls(boxes: RawBox[], pixelsPerMeter = 100): RawWall[] {
  const mmPerPixel = millimetresPerPixel(pixelsPerMeter);
  const wallBoxes = boxes.filter((b) => b.cls === 'wall');
  const segments = wallBoxes
    .map((box, index) => boxToSegment(box, index, mmPerPixel))
    .filter((s): s is Segment => s !== null)
    .map(snapToAxis);

  const closed = closeJunctions(segments);
  const collapsed = mergeOverlaps(closed);

  return collapsed
    .filter((s) => Math.hypot(s.endX - s.startX, s.endY - s.startY) > 1) // drop degenerate
    .map((s, i) => ({
      id: `w${i}`,
      startX: s.startX, startY: s.startY,
      endX: s.endX, endY: s.endY,
      thicknessMm: Math.max(75, s.thicknessMm),
      role: 'partition' as const,
      confidence: s.confidence,
    }));
}

export function reattachOpenings(boxes: RawBox[], walls: RawWall[], pixelsPerMeter = 100): RawOpening[] {
  const mmPerPixel = millimetresPerPixel(pixelsPerMeter);
  const nearestWall = (box: RawBox) => {
    const cx = (box.x0 + box.x1) / 2;
    const cy = (box.y0 + box.y1) / 2;
    const boxWidth = box.x1 - box.x0, boxHeight = box.y1 - box.y0;
    let best = { id: '', dist: Infinity, offsetRatio: 0.5, widthPx: 0 };
    for (const wall of walls) {
      const dx = wall.endX - wall.startX;
      const dy = wall.endY - wall.startY;
      const len2 = dx * dx + dy * dy;
      if (!Number.isFinite(len2) || len2 <= 0) continue;
      const length = Math.sqrt(len2);
      const t = ((cx - wall.startX) * dx + (cy - wall.startY) * dy) / len2;
      if (t < 0 || t > 1) continue;
      // Project the symbol onto the host axis. Using its longest box edge
      // mistakes a door's swing depth for the opening width on vertical walls.
      const widthPx = (Math.abs(dx) * boxWidth + Math.abs(dy) * boxHeight) / length;
      const depthPx = (Math.abs(dy) * boxWidth + Math.abs(dx) * boxHeight) / length;
      if (widthPx > length) continue;
      const px = wall.startX + t * dx;
      const py = wall.startY + t * dy;
      const dist = Math.hypot(cx - px, cy - py);
      const wallHalfWidth = wall.thicknessMm / mmPerPixel / 2;
      // The symbol box must reach the wall's physical strip. A remote
      // false positive must not be pulled across the room onto a wall.
      if (dist > depthPx / 2 + wallHalfWidth) continue;
      if (dist < best.dist) best = { id: wall.id, dist, offsetRatio: t, widthPx };
    }
    return best;
  };

  return boxes
    .filter((b) => (b.cls === 'door' || b.cls === 'window') && validBox(b))
    .map((b, i) => {
      const { id: wallId, offsetRatio, widthPx } = nearestWall(b);
      return {
        id: `o${i}`,
        kind: b.cls as 'door' | 'window',
        wallId,
        offsetRatio,
        widthMm: Math.round(widthPx * mmPerPixel),
        confidence: b.confidence,
      };
    })
    .filter((o) => o.wallId);
}
