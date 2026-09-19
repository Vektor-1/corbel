'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls, PerspectiveCamera, TransformControls, useGLTF } from '@react-three/drei';
import { useDesignStore } from '@/store/designStore';
import { computeWallFootprints, type WallFootprint } from '@/lib/geometry/wall-joints';
import { pixelsPerMeter } from '@/lib/geometry/scale';
import { createWallBrush, computeOpeningBrushes, evaluateWallWithOpenings } from '@/lib/geometry/wall-openings';
import { projectOffsetOntoWall } from '@/lib/geometry/wall-intersections';
import * as THREE from 'three';
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';
import { cn } from '@/lib/cn';

import type { ObjectAsset, Wall, Door, Window } from '@/types/design';

/** Move/rotate/scale mode for the selected furniture object's 3D gizmo (Blender-style G/R/S). */
type ObjectTransformMode = 'translate' | 'rotate' | 'scale' | null;

// Wall/opening colours vary by theme -- the light-mode daylight tones read
// as flatly wrong (too bright, wrong colour temperature) against a dark
// background, the same reason `environments` below already varies its
// floor/background colours per theme.
const materials = {
  light: {
    loadBearing: '#c7bda6',
    partition: '#9d968a',
    doorEntry: '#6f4e33',
    doorInternal: '#8a6a4b',
    windowGlass: '#9fb6bd',
  },
  dark: {
    loadBearing: '#5c5647',
    partition: '#454138',
    doorEntry: '#3a2b1d',
    doorInternal: '#4a3826',
    windowGlass: '#5c7079',
  },
} as const;

const EMPTY_DOORS: Door[] = [];
const EMPTY_WINDOWS: Window[] = [];

// Lighting values live alongside the other per-theme visuals here rather
// than as a parallel config structure. `hemi*` drives a hemisphereLight
// (sky colour from above, ground colour from below) -- a standard, cheap
// arch-viz technique for a more natural outdoor-lit look than flat
// ambient light alone.
const environments = {
  light: {
    background: '#ece8de',
    floor: '#dcd6c9',
    gridMajor: '#a89f8d',
    gridMinor: '#ccc5b5',
    ambientColor: '#fff6e8',
    ambientIntensity: 0.45,
    hemiSkyColor: '#dce8f5',
    hemiGroundColor: '#c9bfa8',
    hemiIntensity: 0.5,
    directionalColor: '#ffedd0',
    directionalIntensity: 1.15,
    pointColor: '#dbe7f0',
    pointIntensity: 0.25,
  },
  dark: {
    background: '#141310',
    floor: '#211f1a',
    gridMajor: '#4d4839',
    gridMinor: '#2c2921',
    ambientColor: '#aab4c2',
    ambientIntensity: 0.35,
    hemiSkyColor: '#2a3038',
    hemiGroundColor: '#1a1712',
    hemiIntensity: 0.4,
    directionalColor: '#c9d4e0',
    directionalIntensity: 0.85,
    pointColor: '#3a4550',
    pointIntensity: 0.2,
  },
} as const;

// ============================================================================
// ARCHITECTURE LAYER: Walls, openings, roof
// Coordinate system: 2D plan (x, z) → 3D (x, y, z) with rotation
// ============================================================================

export interface PlanBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
  diagonal: number;
}

/** Room footprint bounds in world (metres) space, from plan-pixel wall
 * endpoints. Shared by Roof (sizing/positioning the roof plane) and the
 * camera-framing/orbit-limit logic in SceneContent, so both agree on the
 * same room extent instead of computing it independently. */
function getPlanBounds(walls: Wall[], pixelsPerMetre: number): PlanBounds | null {
  if (walls.length === 0) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const wall of walls) {
    minX = Math.min(minX, wall.startPoint.x, wall.endPoint.x);
    maxX = Math.max(maxX, wall.startPoint.x, wall.endPoint.x);
    minZ = Math.min(minZ, wall.startPoint.y, wall.endPoint.y);
    maxZ = Math.max(maxZ, wall.startPoint.y, wall.endPoint.y);
  }

  const width = (maxX - minX) / pixelsPerMetre;
  const depth = (maxZ - minZ) / pixelsPerMetre;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2 / pixelsPerMetre,
    centerZ: (minZ + maxZ) / 2 / pixelsPerMetre,
    width,
    depth,
    diagonal: Math.hypot(width, depth),
  };
}

/** Exact "fit to frustum" camera pose for a room's bounding box, at a fixed
 * three-quarter azimuth/elevation (matching this viewer's previous static
 * [14, 11, 14] position, just no longer blind to room size). For every
 * corner of the room's box (footprint x/z, floor-to-wall-top y), computes
 * the minimum camera distance along the view direction that keeps that
 * corner inside the FOV frustum, accounting for aspect ratio, then takes
 * the max across all 8 corners -- so the whole room fits in frame at any
 * size, not just the original hardcoded room this scene was tuned for.
 * Adapted (single-box, no site/item framing) from the corner-fit technique
 * in pascal/packages/viewer/src/lib/hero-pose.ts's heroCameraPose(). */
function fitCameraToRoom(
  bounds: PlanBounds,
  wallHeightM: number,
  aspect: number,
  {
    fovDeg = 45,
    azimuthRad = Math.PI / 4,
    elevationRad = Math.atan2(11, Math.hypot(14, 14)),
    padding = 1.15,
    minDistance = 4,
  }: { fovDeg?: number; azimuthRad?: number; elevationRad?: number; padding?: number; minDistance?: number } = {},
): { position: [number, number, number]; target: [number, number, number] } {
  const tanVertical = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const tanHorizontal = tanVertical * aspect;

  const dir = new THREE.Vector3(
    Math.sin(azimuthRad) * Math.cos(elevationRad),
    Math.sin(elevationRad),
    Math.cos(azimuthRad) * Math.cos(elevationRad),
  );
  const forward = dir.clone().negate();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);

  const target = new THREE.Vector3(bounds.centerX, wallHeightM / 2, bounds.centerZ);
  const halfW = bounds.width / 2;
  const halfD = bounds.depth / 2;
  const halfH = wallHeightM / 2;

  let distance = minDistance;
  const offset = new THREE.Vector3();
  for (const x of [-halfW, halfW]) {
    for (const y of [-halfH, halfH]) {
      for (const z of [-halfD, halfD]) {
        offset.set(x, y, z);
        const lateral = offset.dot(right);
        const vertical = offset.dot(up);
        const depth = offset.dot(forward);
        distance = Math.max(
          distance,
          (Math.abs(lateral) / tanHorizontal - depth) * padding,
          (Math.abs(vertical) / tanVertical - depth) * padding,
        );
      }
    }
  }

  return {
    position: [target.x + dir.x * distance, target.y + dir.y * distance, target.z + dir.z * distance],
    target: [target.x, target.y, target.z],
  };
}

function WallMesh({
  wall,
  footprint,
  pixelsPerMetre,
  doors = EMPTY_DOORS,
  windows = EMPTY_WINDOWS,
  selected = false,
  theme,
  onSelect,
}: {
  wall: Wall;
  footprint: WallFootprint;
  pixelsPerMetre: number;
  doors?: Door[];
  windows?: Window[];
  selected?: boolean;
  theme: 'light' | 'dark';
  onSelect?: () => void;
}) {
  const height = Math.max(1.2, wall.height / 1000);
  const wallThicknessMm = wall.thickness;
  const baseColor = wall.type === 'loadBearing' ? materials[theme].loadBearing : materials[theme].partition;
  const color = selected ? '#2563eb' : baseColor;

  const geometry = useMemo(() => {
    try {
      const wallBrush = createWallBrush(
        { x: wall.startPoint.x / pixelsPerMetre, y: wall.startPoint.y / pixelsPerMetre },
        { x: wall.endPoint.x / pixelsPerMetre, y: wall.endPoint.y / pixelsPerMetre },
        wallThicknessMm / 1000,
        height,
        footprint.map((pt) => ({ x: pt.x / pixelsPerMetre, y: pt.y / pixelsPerMetre })),
      );

      const openingBrushes = computeOpeningBrushes(
        { x: wall.startPoint.x / pixelsPerMetre, y: wall.startPoint.y / pixelsPerMetre },
        { x: wall.endPoint.x / pixelsPerMetre, y: wall.endPoint.y / pixelsPerMetre },
        wallThicknessMm / 1000,
        height,
        doors.map((d) => ({ position: { x: d.position.x / pixelsPerMetre }, width: d.width / 1000 })),
        windows.map((w) => ({
          position: { x: w.position.x / pixelsPerMetre },
          width: w.width / 1000,
          height: w.height / 1000,
          sillHeight: w.sillHeight / 1000,
        })),
      );

      if (openingBrushes.length > 0) {
        const csgGeometry = evaluateWallWithOpenings(wallBrush, openingBrushes);
        if (csgGeometry) return csgGeometry;
      }

      return wallBrush.geometry as THREE.BufferGeometry;
    } catch (e) {
      // Fall-back path only: builds a flat 2D (X,Y) shape extruded along Z,
      // then bakes the same X-axis rotation the main CSG path above is
      // already oriented for directly (createWallBrush puts extrusion on Y
      // and the footprint's other axis on Z -- already final Y-up world
      // orientation, no outer rotation needed), so both paths end up in the
      // same coordinate convention without the <mesh> itself rotating.
      const shape = new THREE.Shape();
      shape.moveTo(footprint[0].x / pixelsPerMetre, -footprint[0].y / pixelsPerMetre);
      for (let i = 1; i < footprint.length; i += 1) {
        shape.lineTo(footprint[i].x / pixelsPerMetre, -footprint[i].y / pixelsPerMetre);
      }
      shape.closePath();
      const fallbackGeometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      fallbackGeometry.rotateX(-Math.PI / 2);
      return fallbackGeometry;
    }
  }, [footprint, height, pixelsPerMetre, wall.startPoint, wall.endPoint, wallThicknessMm, doors, windows]);

  return (
    <mesh
      geometry={geometry}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
    </mesh>
  );
}

function DoorMesh({
  door,
  wall,
  pixelsPerMetre,
  selected = false,
  theme,
  onSelect,
}: {
  door: Door;
  wall: Wall;
  pixelsPerMetre: number;
  selected?: boolean;
  theme: 'light' | 'dark';
  onSelect?: () => void;
}) {
  const doorWidth = Math.max(0.6, door.width / 1000);
  const doorHeight = Math.min(wall.height / 1000, 2.1);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = door.position.x / wallLength;

  const doorX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const doorZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);

  const doorColor = selected ? '#2563eb' : door.type === 'entry' ? materials[theme].doorEntry : materials[theme].doorInternal;

  return (
    <mesh
      position={[doorX, doorHeight / 2, doorZ]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <boxGeometry args={[doorWidth, doorHeight, 0.05]} />
      <meshStandardMaterial color={doorColor} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

function WindowMesh({
  window: win,
  wall,
  pixelsPerMetre,
  selected = false,
  theme,
  onSelect,
}: {
  window: Window;
  wall: Wall;
  pixelsPerMetre: number;
  selected?: boolean;
  theme: 'light' | 'dark';
  onSelect?: () => void;
}) {
  const winWidth = Math.max(0.8, win.width / 1000);
  const winHeight = Math.max(0.6, win.height / 1000);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = win.position.x / wallLength;

  const winX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const winZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);
  const windowSillHeight = win.sillHeight / 1000;
  const color = selected ? '#2563eb' : materials[theme].windowGlass;

  return (
    <mesh
      position={[winX, windowSillHeight + winHeight / 2, winZ]}
      rotation={[0, -angle, 0]}
      castShadow
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
    >
      <boxGeometry args={[winWidth, winHeight, 0.04]} />
      <meshStandardMaterial color={color} roughness={0.15} metalness={0.4} transparent opacity={0.55} />
    </mesh>
  );
}

/**
 * A draggable handle constrained to one axis, used for 3D architecture edits
 * (wall height, door/window position along their host wall). Committing writes
 * back through the same store action the 2D editor uses, once per drag (not on
 * every intermediate frame) — 2D stays the single source of truth either way.
 */
function AxisDragHandle({
  position,
  rotationY = 0,
  axis,
  space = 'world',
  onCommit,
}: {
  position: [number, number, number];
  rotationY?: number;
  axis: 'x' | 'y';
  space?: 'world' | 'local';
  onCommit: (handle: THREE.Object3D) => void;
}) {
  const handleRef = useRef<THREE.Group>(null);

  return (
    <>
      <group ref={handleRef} position={position} rotation={[0, rotationY, 0]}>
        <mesh>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshStandardMaterial color="#2563eb" depthTest={false} />
        </mesh>
      </group>
      <TransformControls
        object={handleRef as unknown as React.RefObject<THREE.Object3D>}
        mode="translate"
        space={space}
        showX={axis === 'x'}
        showY={axis === 'y'}
        showZ={false}
        size={0.75}
        onMouseUp={() => {
          const handle = handleRef.current;
          if (!handle) return;
          onCommit(handle);
        }}
      />
    </>
  );
}

/** Drag a door/window along its host wall. Rotated into the wall's local frame so the
 *  single visible axis points along the wall, whatever angle it's drawn at. */
function OpeningAxisHandle({
  wall,
  offsetPx,
  heightM,
  pixelsPerMetre,
  onCommit,
}: {
  wall: Wall;
  offsetPx: number;
  heightM: number;
  pixelsPerMetre: number;
  onCommit: (offsetPx: number) => void;
}) {
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.hypot(dx, dy);
  if (wallLength < 1) return null;

  const t = offsetPx / wallLength;
  const worldX = (wall.startPoint.x + dx * t) / pixelsPerMetre;
  const worldZ = (wall.startPoint.y + dy * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);

  return (
    <AxisDragHandle
      axis="x"
      space="local"
      position={[worldX, heightM, worldZ]}
      rotationY={-angle}
      onCommit={(handle) => {
        const point = { x: handle.position.x * pixelsPerMetre, y: handle.position.z * pixelsPerMetre };
        onCommit(projectOffsetOntoWall(wall, point));
      }}
    />
  );
}

function Roof({
  walls,
  wallHeight,
  theme,
  pixelsPerMetre,
}: {
  walls: Wall[];
  wallHeight: number;
  theme: 'light' | 'dark';
  pixelsPerMetre: number;
}) {
  const bounds = getPlanBounds(walls, pixelsPerMetre);
  if (!bounds || bounds.width < 0.1 || bounds.depth < 0.1) return null;

  const wallHeightM = Math.max(1.2, wallHeight / 1000);
  const roofColor = theme === 'dark' ? '#3a3a3a' : '#c0c0c0';

  return (
    <mesh
      position={[bounds.centerX, wallHeightM + 0.15, bounds.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
    >
      <planeGeometry args={[bounds.width + 1, bounds.depth + 1]} />
      <meshStandardMaterial color={roofColor} roughness={0.7} metalness={0.05} />
    </mesh>
  );
}

// ============================================================================
// FURNITURE LAYER: Objects that sit on the floor
// The positioning group lives at the SceneContent level so the fallback
// placeholder (when the GLB model is missing or loading) renders at the
// correct world position rather than the origin.
// ============================================================================

/** Fallback box rendered when the GLB model is unavailable. */
function ObjectPlaceholder({ asset }: { asset: ObjectAsset }) {
  return (
    <mesh>
      <boxGeometry args={asset.dimensions} />
      <meshStandardMaterial color={asset.color} roughness={0.8} transparent opacity={0.45} />
    </mesh>
  );
}

class ObjectAssetBoundary extends Component<
  { asset: ObjectAsset; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <ObjectPlaceholder asset={this.props.asset} /> : this.props.children;
  }
}

function ObjectMesh({
  asset,
  selected,
}: {
  asset: ObjectAsset;
  selected: boolean;
}) {
  const { scene } = useGLTF(asset.modelUrl);
  const clone = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }, [clone]);

  return (
    <>
      <primitive
        object={clone}
        position={[asset.offset[0], asset.offset[1], asset.offset[2]]}
        rotation={asset.modelRotation}
        scale={asset.modelScale}
      />
      {selected && (
        <mesh>
          <boxGeometry args={asset.dimensions} />
          <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </>
  );
}

/**
 * One placed furniture object, with a Blender-style move/rotate/scale gizmo when
 * selected and a transform mode is active. Position/rotation move freely; scale
 * is kept uniform (DesignObject has a single `scale` factor, not per-axis) by
 * only exposing one scale handle and writing its value back to all three axes.
 */
function ObjectInstance({
  object,
  asset,
  selected,
  transformMode,
  worldPosition,
  pixelsPerMetre,
  onSelect,
  onCommitTransform,
}: {
  object: { rotation: number; scale: number };
  asset: ObjectAsset;
  selected: boolean;
  transformMode: ObjectTransformMode;
  worldPosition: [number, number, number];
  pixelsPerMetre: number;
  onSelect: () => void;
  onCommitTransform: (updates: { position?: { x: number; y: number }; rotation?: number; scale?: number }) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <>
      <group
        ref={groupRef}
        position={worldPosition}
        rotation={[0, -object.rotation, 0]}
        scale={object.scale}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        <ObjectAssetBoundary asset={asset}>
          <Suspense fallback={<ObjectPlaceholder asset={asset} />}>
            <ObjectMesh asset={asset} selected={selected} />
          </Suspense>
        </ObjectAssetBoundary>
      </group>
      {selected && transformMode && (
        <TransformControls
          object={groupRef as unknown as React.RefObject<THREE.Object3D>}
          mode={transformMode}
          // translate: floor plane only (X/Z). rotate: vertical axis only (Y).
          // scale: a single handle, since DesignObject.scale is one uniform factor.
          showX={transformMode !== 'rotate'}
          showY={transformMode === 'rotate'}
          showZ={transformMode === 'translate'}
          onMouseUp={() => {
            const group = groupRef.current;
            if (!group) return;
            if (transformMode === 'translate') {
              onCommitTransform({
                position: { x: group.position.x * pixelsPerMetre, y: group.position.z * pixelsPerMetre },
              });
            } else if (transformMode === 'rotate') {
              onCommitTransform({ rotation: -group.rotation.y });
            } else {
              // Uniform scale only: take the axis the user actually dragged and
              // snap the other two to match, both visually and in the committed value.
              const factor = Math.max(0.1, group.scale.x);
              group.scale.set(factor, factor, factor);
              onCommitTransform({ scale: factor });
            }
          }}
        />
      )}
    </>
  );
}

// ============================================================================
// SCENE SETUP
// ============================================================================

function Floor({ width, height, theme }: { width: number; height: number; theme: 'light' | 'dark' }) {
  const w = Math.max(12, width / 1000);
  const h = Math.max(9, height / 1000);

  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={environments[theme].floor} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SceneContent({ theme, transformMode }: { theme: 'light' | 'dark'; transformMode: ObjectTransformMode }) {
  const {
    floorPlan,
    selectedElementId,
    setSelectedElement,
    updateWall,
    updateDoor,
    updateWindow,
    updateObject,
  } = useDesignStore();
  const walls = floorPlan?.walls;
  const planPixelsPerMeter = pixelsPerMeter(floorPlan?.scale);
  const footprints = useMemo(() => computeWallFootprints(walls ?? [], planPixelsPerMeter), [walls, planPixelsPerMeter]);

  // Room bounds drive the shadow-camera frustum and orbit zoom limits below --
  // both should stay responsive as the plan grows/shrinks, unlike the camera
  // pose itself (see cameraPose below, which intentionally only reacts to a
  // full plan swap).
  const bounds = useMemo(() => getPlanBounds(walls ?? [], planPixelsPerMeter), [walls, planPixelsPerMeter]);
  const wallHeightM = Math.max(1.2, (walls?.[0]?.height ?? 3000) / 1000);

  const { size } = useThree();
  const aspect = size.height > 0 ? size.width / size.height : 1;
  // Recomputed only when a different plan is loaded (floorPlan.id), not on
  // every wall edit -- otherwise the camera would yank the user's view
  // around mid-edit every time they moved a wall. A fresh plan legitimately
  // wants a fresh "fit to room" shot; an in-progress edit doesn't.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cameraPose = useMemo(
    () => (bounds ? fitCameraToRoom(bounds, wallHeightM, aspect) : { position: [14, 11, 14] as [number, number, number], target: [0, 1.5, 0] as [number, number, number] }),
    [floorPlan?.id],
  );

  const openingsByWall = useMemo(() => {
    const doors = new Map<string, Door[]>();
    const windows = new Map<string, Window[]>();

    for (const door of floorPlan?.doors ?? []) {
      const existing = doors.get(door.wallId);
      if (existing) existing.push(door);
      else doors.set(door.wallId, [door]);
    }
    for (const window of floorPlan?.windows ?? []) {
      const existing = windows.get(window.wallId);
      if (existing) existing.push(window);
      else windows.set(window.wallId, [window]);
    }

    return { doors, windows };
  }, [floorPlan?.doors, floorPlan?.windows]);

  if (!floorPlan) return null;

  const environment = environments[theme];
  const gridSize = Math.max(20, Math.ceil(Math.max(floorPlan.width, floorPlan.height) / 1000));
  const gridDivisions = gridSize;
  const wallMap = new Map(floorPlan.walls.map((w) => [w.id, w]));

  // Shadow-camera frustum sized to the room (plus margin) rather than a
  // fixed guess -- a small room got wasted resolution, a large one got
  // clipped shadows, with the previous unconditional default extents.
  const shadowHalfSize = Math.max(6, (bounds?.diagonal ?? 12) / 2 + 2);
  const maxZoomDistance = Math.max(20, (bounds?.diagonal ?? 12) * 4);

  return (
    <>
      <color attach="background" args={[environment.background]} />
      <fog attach="fog" args={[environment.background, 25, 60]} />

      <ambientLight intensity={environment.ambientIntensity} color={environment.ambientColor} />
      <hemisphereLight
        intensity={environment.hemiIntensity}
        color={environment.hemiSkyColor}
        groundColor={environment.hemiGroundColor}
      />
      <directionalLight
        position={[14, 18, 10]}
        intensity={environment.directionalIntensity}
        color={environment.directionalColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowHalfSize}
        shadow-camera-right={shadowHalfSize}
        shadow-camera-top={shadowHalfSize}
        shadow-camera-bottom={-shadowHalfSize}
      />
      <pointLight position={[-8, 12, 6]} intensity={environment.pointIntensity} color={environment.pointColor} />

      <PerspectiveCamera makeDefault position={cameraPose.position} fov={45} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={cameraPose.target}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={1.5}
        maxDistance={maxZoomDistance}
      />
      <GizmoHelper alignment="top-right" margin={[340, 90]}>
        <GizmoViewport
          axisColors={['#e0776d', '#82c46c', '#5b9bd5']}
          labelColor="#2a2a2a"
        />
      </GizmoHelper>

      {/* Architecture layer: floor, walls, openings, roof */}
      <Floor width={floorPlan.width} height={floorPlan.height} theme={theme} />

      {floorPlan.walls.map((wall) => {
        const footprint = footprints.get(wall.id);
        const isSelected = selectedElementId === wall.id;
        return footprint ? (
          <group key={wall.id}>
            <WallMesh
              wall={wall}
              footprint={footprint}
              pixelsPerMetre={planPixelsPerMeter}
              doors={openingsByWall.doors.get(wall.id)}
              windows={openingsByWall.windows.get(wall.id)}
              selected={isSelected}
              theme={theme}
              onSelect={() => setSelectedElement(wall.id)}
            />
            {isSelected && (
              <AxisDragHandle
                axis="y"
                position={[
                  (wall.startPoint.x + wall.endPoint.x) / 2 / planPixelsPerMeter,
                  Math.max(1.2, wall.height / 1000),
                  (wall.startPoint.y + wall.endPoint.y) / 2 / planPixelsPerMeter,
                ]}
                onCommit={(handle) => {
                  const heightMm = Math.round(Math.max(1200, handle.position.y * 1000));
                  updateWall(wall.id, { height: heightMm });
                }}
              />
            )}
          </group>
        ) : null;
      })}

      {floorPlan.doors.map((door) => {
        const wall = wallMap.get(door.wallId);
        if (!wall) return null;
        const isSelected = selectedElementId === door.id;
        return (
          <group key={door.id}>
            <DoorMesh
              door={door}
              wall={wall}
              pixelsPerMetre={planPixelsPerMeter}
              selected={isSelected}
              theme={theme}
              onSelect={() => setSelectedElement(door.id)}
            />
            {isSelected && (
              <OpeningAxisHandle
                wall={wall}
                offsetPx={door.position.x}
                heightM={Math.min(wall.height / 1000, 2.1) / 2}
                pixelsPerMetre={planPixelsPerMeter}
                onCommit={(offsetPx) => updateDoor(door.id, { position: { x: offsetPx, y: 0 } })}
              />
            )}
          </group>
        );
      })}

      {floorPlan.windows.map((win) => {
        const wall = wallMap.get(win.wallId);
        if (!wall) return null;
        const isSelected = selectedElementId === win.id;
        return (
          <group key={win.id}>
            <WindowMesh
              window={win}
              wall={wall}
              pixelsPerMetre={planPixelsPerMeter}
              selected={isSelected}
              theme={theme}
              onSelect={() => setSelectedElement(win.id)}
            />
            {isSelected && (
              <OpeningAxisHandle
                wall={wall}
                offsetPx={win.position.x}
                heightM={win.sillHeight / 1000 + Math.max(0.6, win.height / 1000) / 2}
                pixelsPerMetre={planPixelsPerMeter}
                onCommit={(offsetPx) => updateWindow(win.id, { position: { x: offsetPx, y: 0 } })}
              />
            )}
          </group>
        );
      })}

      <Roof
        walls={floorPlan.walls}
        wallHeight={floorPlan.walls[0]?.height ?? 3000}
        theme={theme}
        pixelsPerMetre={planPixelsPerMeter}
      />

      {/* Furniture layer: objects on floor */}
      {(floorPlan.objects ?? []).map((object) => {
        const asset = OBJECT_CATALOG_BY_ID[object.assetId];
        if (!asset) return null;

        const worldX = object.position.x / planPixelsPerMeter;
        const worldZ = object.position.y / planPixelsPerMeter;
        const worldY = asset.dimensions[1] / 2;

        return (
          <ObjectInstance
            key={object.id}
            object={object}
            asset={asset}
            selected={selectedElementId === object.id}
            transformMode={transformMode}
            worldPosition={[worldX, worldY, worldZ]}
            pixelsPerMetre={planPixelsPerMeter}
            onSelect={() => setSelectedElement(object.id)}
            onCommitTransform={(updates) => updateObject(object.id, updates)}
          />
        );
      })}

      <gridHelper
        args={[gridSize, gridDivisions, environment.gridMajor, environment.gridMinor]}
        position={[0, 0.01, 0]}
      />
    </>
  );
}

const TRANSFORM_MODE_LABELS: Record<Exclude<ObjectTransformMode, null>, string> = {
  translate: 'Move',
  rotate: 'Rotate',
  scale: 'Scale',
};

export function Canvas3DContainer({ theme }: { theme: 'light' | 'dark' }) {
  const { floorPlan, selectedElementId } = useDesignStore();
  const [transformMode, setTransformMode] = useState<ObjectTransformMode>(null);
  const selectedIsObject = (floorPlan?.objects ?? []).some((o) => o.id === selectedElementId);

  // Only furniture gets a move/rotate/scale mode; walls/doors/windows use their
  // own always-on drag handle instead. Drop a stale mode when selection changes.
  useEffect(() => {
    if (!selectedIsObject) setTransformMode(null);
  }, [selectedElementId, selectedIsObject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedIsObject) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'g' || e.key === 'G') setTransformMode('translate');
      else if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
      else if (e.key === 's' || e.key === 'S') setTransformMode('scale');
      else if (e.key === 'Escape') setTransformMode(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIsObject]);

  if (!floorPlan) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--editor-canvas)] text-[var(--editor-text-subtle)]">
        Preparing spatial view…
      </div>
    );
  }

  const openingCount = floorPlan.doors.length + floorPlan.windows.length;

  return (
    <div
      className="relative h-full w-full bg-[var(--editor-canvas)]"
      tabIndex={0}
      role="group"
      aria-label={`3D view of the floor plan: ${floorPlan.walls.length} ${
        floorPlan.walls.length === 1 ? 'wall' : 'walls'
      }, ${floorPlan.rooms.length} ${floorPlan.rooms.length === 1 ? 'room' : 'rooms'}, ${openingCount} ${
        openingCount === 1 ? 'opening' : 'openings'
      }. Drag to orbit the camera; the 2D view and the Outline panel are the reliable way to select and edit elements without a mouse.`}
    >
      <Canvas shadows dpr={[1, 2]}>
        <SceneContent theme={theme} transformMode={transformMode} />
      </Canvas>

      {selectedIsObject && (
        // bottom-20, not bottom-4: the app-wide tool dock (EditorWithCanvas.tsx)
        // now also sits bottom-center, so this toolbar floats just above it
        // instead of overlapping in full-width 3D view.
        <div className="editor-island absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl p-1.5">
          {(Object.keys(TRANSFORM_MODE_LABELS) as Array<Exclude<ObjectTransformMode, null>>).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTransformMode((current) => (current === mode ? null : mode))}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                transformMode === mode
                  ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                  : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
              )}
            >
              {TRANSFORM_MODE_LABELS[mode]}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{mode === 'translate' ? 'G' : mode === 'rotate' ? 'R' : 'S'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
