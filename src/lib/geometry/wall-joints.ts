// Wall footprint + joint mitering.
//
// Walls are stored as centerline segments with a thickness. Rendering each
// wall as an independent rectangle makes corners look like two boxes passing
// through each other. Instead we compute a plan-view footprint polygon per
// wall and, wherever exactly two wall ends share a point, miter both side
// edges to their intersection so the pair meets in a clean joint.
//
// Approach adapted from Pascal Editor's wall-mitering system
// (pascal packages/core/src/systems/wall — MIT licensed), simplified for
// Corbel: straight walls only, two-wall joints mitered, other joints keep
// square caps. See docs/overview/ATTRIBUTION.md.

import type { Point, Wall } from '@/types/design';

/** Canvas pixels are 10 mm each (100 px = 1 m), matching the 3D scale. */
export const MM_PER_PX = 10;

/** sin of the angle below which two walls count as collinear (butt joint). */
const COLLINEAR_EPS = 0.02;

/** Miter spikes longer than this × combined half-widths fall back to square caps. */
const MITER_LIMIT_FACTOR = 4;

/** Footprint corners in plan px: [startLeft, endLeft, endRight, startRight]. */
export type WallFootprint = [Point, Point, Point, Point];

interface WallEndRef {
  wallId: string;
  end: 'start' | 'end';
  /** Unit vector pointing from the joint into the wall body. */
  dir: Point;
  halfWidth: number; // px
}

interface Joint {
  point: Point;
  ends: WallEndRef[];
}

const pointKey = (p: Point) => `${Math.round(p.x * 2)}:${Math.round(p.y * 2)}`;

const perp = (v: Point): Point => ({ x: -v.y, y: v.x });

const offset = (p: Point, dir: Point, amount: number): Point => ({
  x: p.x + dir.x * amount,
  y: p.y + dir.y * amount,
});

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Intersection of two lines given as (point, direction). Callers guarantee non-parallel. */
function intersectLines(p1: Point, d1: Point, p2: Point, d2: Point): Point | null {
  const denom = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / denom;
  return { x: p1.x + d1.x * t, y: p1.y + d1.y * t };
}

/** Half the wall's plan-view width, in canvas px. */
export const wallHalfWidthPx = (wall: Wall) => wall.thickness / MM_PER_PX / 2;

/** Non-mitered rectangular footprint — used for previews and as the base shape. */
export function wallQuad(start: Point, end: Point, halfWidthPx: number): WallFootprint | null {
  const len = distance(start, end);
  if (len < 1e-6) return null;
  const d = { x: (end.x - start.x) / len, y: (end.y - start.y) / len };
  const n = perp(d);
  return [
    offset(start, n, halfWidthPx),
    offset(end, n, halfWidthPx),
    offset(end, n, -halfWidthPx),
    offset(start, n, -halfWidthPx),
  ];
}

/**
 * Compute plan footprints for all walls, mitering every joint where exactly
 * two wall ends coincide. Joints of three or more walls keep square caps —
 * the overlap is hidden inside the shared volume.
 */
export function computeWallFootprints(walls: Wall[]): Map<string, WallFootprint> {
  const footprints = new Map<string, WallFootprint>();
  const joints = new Map<string, Joint>();

  const addEnd = (point: Point, ref: WallEndRef) => {
    const key = pointKey(point);
    const joint = joints.get(key);
    if (joint) joint.ends.push(ref);
    else joints.set(key, { point, ends: [ref] });
  };

  for (const wall of walls) {
    const halfWidth = wallHalfWidthPx(wall);
    const quad = wallQuad(wall.startPoint, wall.endPoint, halfWidth);
    if (!quad) continue;
    footprints.set(wall.id, quad);

    const len = distance(wall.startPoint, wall.endPoint);
    const d = {
      x: (wall.endPoint.x - wall.startPoint.x) / len,
      y: (wall.endPoint.y - wall.startPoint.y) / len,
    };
    addEnd(wall.startPoint, { wallId: wall.id, end: 'start', dir: d, halfWidth });
    addEnd(wall.endPoint, { wallId: wall.id, end: 'end', dir: { x: -d.x, y: -d.y }, halfWidth });
  }

  for (const { point, ends } of joints.values()) {
    if (ends.length !== 2) continue;
    const [a, b] = ends;
    if (a.wallId === b.wallId) continue;

    const cross = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
    if (Math.abs(cross) < COLLINEAR_EPS) continue; // collinear: butt ends already meet

    const mA = perp(a.dir);
    const mB = perp(b.dir);

    // Wall A's +side edge meets wall B's -side edge, and vice versa.
    const cornerPlus = intersectLines(offset(point, mA, a.halfWidth), a.dir, offset(point, mB, -b.halfWidth), b.dir);
    const cornerMinus = intersectLines(offset(point, mA, -a.halfWidth), a.dir, offset(point, mB, b.halfWidth), b.dir);
    if (!cornerPlus || !cornerMinus) continue;

    const miterLimit = MITER_LIMIT_FACTOR * (a.halfWidth + b.halfWidth);
    if (distance(cornerPlus, point) > miterLimit || distance(cornerMinus, point) > miterLimit) continue;

    applyJointCorners(footprints, a, cornerPlus, cornerMinus);
    applyJointCorners(footprints, b, cornerMinus, cornerPlus);
  }

  return footprints;
}

/**
 * Write the mitered corners into a wall-end's footprint slots. `cornerPlus`
 * lies on the wall's +perp(dir) side, where dir points away from the joint.
 * At a wall's start, +perp(dir) is its left edge; at its end, dir is
 * reversed, so +perp(dir) is its right edge.
 */
function applyJointCorners(
  footprints: Map<string, WallFootprint>,
  ref: WallEndRef,
  cornerPlus: Point,
  cornerMinus: Point
) {
  const footprint = footprints.get(ref.wallId);
  if (!footprint) return;
  if (ref.end === 'start') {
    footprint[0] = cornerPlus; // start left
    footprint[3] = cornerMinus; // start right
  } else {
    footprint[1] = cornerMinus; // end left
    footprint[2] = cornerPlus; // end right
  }
}
