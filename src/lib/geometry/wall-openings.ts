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

  // Create a geometry from the footprint extruded vertically.
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];

  // Add bottom vertices (at z=0, which corresponds to floor level)
  for (const pt of footprint) {
    vertices.push(pt.x, 0, pt.y);
  }
  const bottomCount = footprint.length;

  // Add top vertices (at z=height, which corresponds to ceiling level)
  for (const pt of footprint) {
    vertices.push(pt.x, height, pt.y);
  }

  // Create triangles for bottom face
  for (let i = 0; i < bottomCount - 2; i++) {
    indices.push(0, i + 2, i + 1);
  }

  // Create triangles for top face (reversed winding)
  for (let i = 0; i < bottomCount - 2; i++) {
    indices.push(bottomCount, i + 1 + bottomCount, i + 2 + bottomCount);
  }

  // Create side faces
  for (let i = 0; i < bottomCount; i++) {
    const next = (i + 1) % bottomCount;
    // Bottom to top quad: two triangles
    indices.push(i, next, next + bottomCount);
    indices.push(i, next + bottomCount, i + bottomCount);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
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
  const halfWidth = doorWidth / 2;
  const halfThickness = wallThickness / 2;
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

  // Window quad: width follows the wall; depth spans its thickness.
  const halfWidth = windowWidth / 2;
  const halfThickness = wallThickness / 2;
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
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];

  // Bottom quad vertices (z=0)
  for (const pt of quad) {
    vertices.push(pt.x, 0, pt.y);
  }

  // Top quad vertices (z=height)
  for (const pt of quad) {
    vertices.push(pt.x, height, pt.y);
  }

  // Bottom face (CCW from above)
  indices.push(0, 2, 1);
  indices.push(1, 2, 3);

  // Top face (CCW from above)
  indices.push(4, 5, 6);
  indices.push(5, 7, 6);

  // Side faces
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    indices.push(i, next, next + 4);
    indices.push(i, next + 4, i + 4);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
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
  let result = wallBrush;
  for (const opening of openingBrushes) {
    try {
      const evaluated = evaluator.evaluate(result, opening, SUBTRACTION);
      if (!evaluated) return null;
      result = evaluated;
    } catch (e) {
      // Silently fail and return original geometry
      return result.geometry as THREE.BufferGeometry;
    }
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
  wallHeight: number,
  doors: Array<{ position: { x: number }; width: number }>,
  windows: Array<{ position: { x: number }; width: number; height: number; sillHeight: number }>,
): Brush[] {
  const brushes: Brush[] = [];

  // Add door brushes
  for (const door of doors) {
    try {
      brushes.push(
        createDoorBrush(door.position.x, wallStartPoint, wallEndPoint, wallThickness, door.width, wallHeight),
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
