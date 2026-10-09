'use client';

/**
 * CSG-based wall opening geometry.
 * Ported from Pascal Editor's wall-system.tsx with explicit drag-throttling discipline.
 * Uses three-bvh-csg for boolean subtraction of doors/windows from wall meshes.
 * Client-only module due to Three.js and three-bvh-csg dependencies.
 */

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export interface OpeningGeometry {
  position: { x: number; y: number; z: number };
  width: number;
  height: number;
  sillHeight?: number; // For windows: height above floor where window starts
}

/**
 * Create a CSG brush for a wall (solid rectangular prism).
 * Positioned from startPoint to endPoint at the given height.
 */
export function createWallBrush(
  startPoint: { x: number; y: number },
  endPoint: { x: number; y: number },
  thickness: number,
  height: number,
  footprint: Array<{ x: number; y: number }>, // Mitered wall quad
): Brush {
  if (footprint.length < 3) {
    throw new Error('Wall footprint must have at least 3 points');
  }

  // Built via THREE.Shape + ExtrudeGeometry, ported from Pascal's
  // wall-system.tsx (buildWallGeometry). A hand-rolled fan triangulation here
  // previously assumed one fixed footprint winding direction; wall-joints.ts's
  // mitered footprint isn't guaranteed to wind that way, and the reversed case
  // silently produced a wall brush whose CSG subtraction looked successful
  // (vertex count went up) but didn't actually open a hole -- confirmed by
  // raycasting through the result. ExtrudeGeometry's earcut triangulation is
  // wound consistently regardless of input point order, which three-bvh-csg
  // needs for a real cut.
  const shape = new THREE.Shape();
  shape.moveTo(footprint[0].x, -footprint[0].y);
  for (let i = 1; i < footprint.length; i++) {
    shape.lineTo(footprint[i].x, -footprint[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  // Shape lives in (x, -footprintY); extrude runs along local Z. Rotating -90°
  // about X maps (x, y, z) -> (x, z, -y), i.e. (x, heightAlongZ, footprintY) --
  // same X/Y=height/Z=footprint convention the rest of this module expects.
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  const brush = new Brush(geometry);
  return brush;
}

/**
 * Create a CSG brush for a door opening.
 * Positioned at the given offset along the wall, floor-to-head-height.
 */
export function createDoorBrush(
  wallPositionAlongLength: number,
  wallStartPoint: { x: number; y: number },
  wallEndPoint: { x: number; y: number },
  wallThickness: number,
  doorWidth: number,
  doorHeight: number,
): Brush {
  // Normalize the wall direction
  const dx = wallEndPoint.x - wallStartPoint.x;
  const dy = wallEndPoint.y - wallStartPoint.y;
  const wallLength = Math.hypot(dx, dy);

  if (wallLength < 0.1) {
    throw new Error('Wall length is too small');
  }

  const normalizedDx = dx / wallLength;
  const normalizedDy = dy / wallLength;

  // Perpendicular direction (perpendicular to wall length, in the XY plane)
  const perpDx = -normalizedDy;
  const perpDy = normalizedDx;

  // Door center position
  const centerX = wallStartPoint.x + normalizedDx * wallPositionAlongLength;
  const centerY = wallStartPoint.y + normalizedDy * wallPositionAlongLength;

  // Door quad: width follows the wall; depth spans the wall thickness.
  // The previous perpendicular-width construction placed a horizontal-wall
  // door across the wall instead of through it, leaving the CSG cut rotated.
  // Depth is a full wallThickness beyond each face (Pascal's
  // collectCutoutBrushes: "Extend beyond wall to ensure clean cut") rather
  // than flush with the wall surface -- a cutter brush whose faces sit
  // exactly coplanar with the wall's own faces is the other failure mode
  // that made subtraction silently fail to open a hole.
  const halfWidth = doorWidth / 2;
  const halfThickness = wallThickness;
  const doorCorners = [
    {
      x: centerX - halfWidth * normalizedDx - halfThickness * perpDx,
      y: centerY - halfWidth * normalizedDy - halfThickness * perpDy,
    },
    {
      x: centerX + halfWidth * normalizedDx - halfThickness * perpDx,
      y: centerY + halfWidth * normalizedDy - halfThickness * perpDy,
    },
    {
      x: centerX + halfWidth * normalizedDx + halfThickness * perpDx,
      y: centerY + halfWidth * normalizedDy + halfThickness * perpDy,
    },
    {
      x: centerX - halfWidth * normalizedDx + halfThickness * perpDx,
      y: centerY - halfWidth * normalizedDy + halfThickness * perpDy,
    },
  ];

  return createBoxBrush(doorCorners, doorHeight);
}

/**
 * Create a CSG brush for a window opening.
 * Positioned at the given offset along the wall, sill-to-head-height.
 */
export function createWindowBrush(
  wallPositionAlongLength: number,
  wallStartPoint: { x: number; y: number },
  wallEndPoint: { x: number; y: number },
  wallThickness: number,
  windowWidth: number,
  windowHeight: number,
  sillHeight: number,
): Brush {
  // Normalize the wall direction
  const dx = wallEndPoint.x - wallStartPoint.x;
  const dy = wallEndPoint.y - wallStartPoint.y;
  const wallLength = Math.hypot(dx, dy);

  if (wallLength < 0.1) {
    throw new Error('Wall length is too small');
  }

  const normalizedDx = dx / wallLength;
  const normalizedDy = dy / wallLength;

  // Perpendicular direction
  const perpDx = -normalizedDy;
  const perpDy = normalizedDx;

  // Window center position
  const centerX = wallStartPoint.x + normalizedDx * wallPositionAlongLength;
  const centerY = wallStartPoint.y + normalizedDy * wallPositionAlongLength;

  // Window quad: width follows the wall; depth extends a full wallThickness
  // beyond each face, same reasoning as createDoorBrush above.
  const halfWidth = windowWidth / 2;
  const halfThickness = wallThickness;
  const windowCorners = [
    {
      x: centerX - halfWidth * normalizedDx - halfThickness * perpDx,
      y: centerY - halfWidth * normalizedDy - halfThickness * perpDy,
    },
    {
      x: centerX + halfWidth * normalizedDx - halfThickness * perpDx,
      y: centerY + halfWidth * normalizedDy - halfThickness * perpDy,
    },
    {
      x: centerX + halfWidth * normalizedDx + halfThickness * perpDx,
      y: centerY + halfWidth * normalizedDy + halfThickness * perpDy,
    },
    {
      x: centerX - halfWidth * normalizedDx + halfThickness * perpDx,
      y: centerY - halfWidth * normalizedDy + halfThickness * perpDy,
    },
  ];

  const brush = createBoxBrush(windowCorners, windowHeight);

  // Offset the whole brush vertically to sillHeight. Moving only its top
  // vertices turns a window opening into a tapered floor-to-head opening.
  const positionAttribute = brush.geometry.getAttribute('position');
  if (positionAttribute) {
    const positions = positionAttribute.array as Float32Array;
    for (let i = 1; i < positions.length; i += 3) {
      positions[i] += sillHeight;
    }
    positionAttribute.needsUpdate = true;
  }

  return brush;
}

/**
 * Create a simple box brush for a wall opening.
 * Private helper: creates a rectangular prism from a 2D quad extruded in Z.
 */
function createBoxBrush(quad: Array<{ x: number; y: number }>, height: number): Brush {
  // Same Shape + ExtrudeGeometry construction as createWallBrush, for the same
  // reason: a hand-rolled fixed-winding triangulation here doesn't track
  // whichever direction quad's corners happen to wind.
  const shape = new THREE.Shape();
  shape.moveTo(quad[0].x, -quad[0].y);
  for (let i = 1; i < quad.length; i++) {
    shape.lineTo(quad[i].x, -quad[i].y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();

  return new Brush(geometry);
}

/**
 * Apply CSG operations to cut openings from a wall.
 * Returns the resulting geometry, or null if evaluation fails.
 * Uses three-bvh-csg's exported SUBTRACTION operation to cut holes.
 */
export function evaluateWallWithOpenings(
  wallBrush: Brush,
  openingBrushes: Brush[],
): THREE.BufferGeometry | null {
  const evaluator = new Evaluator();
  // three-bvh-csg's Evaluator defaults to ['position', 'uv', 'normal'], but
  // createWallBrush/createDoorBrush/createWindowBrush only ever set
  // position + computed normal -- no uv. Left at the default, the evaluator
  // tries to read a uv attribute that doesn't exist and throws ("Cannot read
  // properties of undefined (reading 'array')"), which this function's own
  // per-opening catch then swallowed silently. Restricting it to the
  // attributes these brushes actually have fixes the root cause instead of
  // just catching the crash it was causing.
  evaluator.attributes = ['position', 'normal'];
  let result = wallBrush;
  let failed = 0;
  // One failing opening must not cost every opening after it in the array —
  // each subtraction is independent, so skip just the one that failed and
  // keep cutting the rest, the same resilience Pascal's wall-system.tsx uses
  // (mergeWallCutoutBrushes' fallbackBrushes loop) instead of bailing out of
  // the whole wall on the first CSG failure.
  for (const opening of openingBrushes) {
    try {
      const evaluated = evaluator.evaluate(result, opening, SUBTRACTION);
      if (!evaluated) {
        failed += 1;
        continue;
      }
      result = evaluated;
    } catch (e) {
      failed += 1;
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('[wall-openings] Failed to cut one door/window opening out of a wall; that one opening will render as solid wall instead of a hole.', e);
      }
    }
  }
  if (failed > 0 && process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(`[wall-openings] ${failed} of ${openingBrushes.length} opening cutout(s) could not be subtracted from this wall.`);
  }

  return result.geometry as THREE.BufferGeometry;
}

/**
 * Compute wall opening brushes for a single wall with multiple doors/windows.
 * Positioned via offset along the wall length + optional sill height.
 */
export function computeOpeningBrushes(
  wallStartPoint: { x: number; y: number },
  wallEndPoint: { x: number; y: number },
  wallThickness: number,
  doors: Array<{ position: { x: number }; width: number; height: number }>,
  windows: Array<{ position: { x: number }; width: number; height: number; sillHeight: number }>,
): Brush[] {
  const brushes: Brush[] = [];

  // Add door brushes
  for (const door of doors) {
    try {
      brushes.push(
        createDoorBrush(door.position.x, wallStartPoint, wallEndPoint, wallThickness, door.width, door.height),
      );
    } catch (e) {
      // Silently skip invalid openings (e.g., zero-length walls)
    }
  }

  // Add window brushes
  for (const window of windows) {
    try {
      brushes.push(
        createWindowBrush(
          window.position.x,
          wallStartPoint,
          wallEndPoint,
          wallThickness,
          window.width,
          window.height,
          window.sillHeight,
        ),
      );
    } catch (e) {
      // Silently skip invalid openings
    }
  }

  return brushes;
}
