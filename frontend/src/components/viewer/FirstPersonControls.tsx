'use client';

import * as THREE from 'three';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import type { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib';
import { MeshBVH, StaticGeometryGenerator } from 'three-mesh-bvh';
import type { Wall } from '@/types/design';

// Average adult eye height for a walkthrough camera.
const EYE_HEIGHT = 1.65;
// Below every default window sill (0.9m, see designStore's windows.sillHeight
// default) and inside every door's open vertical range, so a single
// ankle-height collision sample walks through doors and is blocked by the
// solid wall below a window -- for free, from the wall mesh's own CSG
// geometry, with no separate glass-pane logic needed.
const ANKLE_HEIGHT = 0.3;
const PLAYER_RADIUS = 0.35;
const WALK_SPEED = 2.2;
const FLOOR_MARGIN = 0.2;

export interface FirstPersonControlsProps {
  wallsGroupRef: React.RefObject<THREE.Group | null>;
  walls: Wall[];
  spawn: { x: number; z: number };
  floorHalfExtents: { x: number; z: number };
  onExit: () => void;
  onLockedChange: (locked: boolean) => void;
}

/**
 * Walkthrough camera: pointer-lock mouse look + WASD movement, collision-
 * checked against the actual rendered wall meshes (so a door/window cutout
 * is walkable the instant it renders, with no separate opening list to keep
 * in sync). Modelled on Pascal's glb-walkthrough-controller.tsx, simplified
 * for Corbel's flat, single-storey floor-plan model: no falling/stepping
 * physics, since the floor is always a flat plane at y=0.
 */
export function FirstPersonControls({ wallsGroupRef, walls, spawn, floorHalfExtents, onExit, onLockedChange }: FirstPersonControlsProps) {
  const { camera } = useThree();
  const controlsRef = useRef<PointerLockControlsImpl | null>(null);
  const colliderRef = useRef<MeshBVH | null>(null);
  const keysRef = useRef({ forward: false, backward: false, left: false, right: false });

  useEffect(() => {
    camera.position.set(spawn.x, EYE_HEIGHT, spawn.z);
    // Spawn only on entry (mount); re-running on every spawn-prop change
    // would yank the view back to centre while the student is walking.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build one merged collider from the already-rendered wall meshes --
  // including their CSG door/window cutouts -- rather than a parallel
  // geometry computation that could drift from what's actually on screen.
  useEffect(() => {
    const group = wallsGroupRef.current;
    if (!group) {
      colliderRef.current = null;
      return;
    }
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) meshes.push(child as THREE.Mesh);
    });
    if (meshes.length === 0) {
      colliderRef.current = null;
      return;
    }

    // Wall geometry comes from two different code paths depending on
    // whether a CSG opening cut succeeded (three-bvh-csg output) or fell
    // back to ExtrudeGeometry (src/components/viewer/renderers/WallMesh.tsx)
    // -- one is indexed, the other isn't. StaticGeometryGenerator refuses to
    // merge a mix. Swap in a non-indexed version just for this merge, then
    // restore the mesh's real geometry immediately -- synchronous, so
    // nothing ever renders a frame with the swapped-out geometry.
    const originalGeometries = meshes.map((mesh) => mesh.geometry);
    const createdGeometries: THREE.BufferGeometry[] = [];
    meshes.forEach((mesh) => {
      if (mesh.geometry.index) {
        const nonIndexed = mesh.geometry.toNonIndexed();
        createdGeometries.push(nonIndexed);
        mesh.geometry = nonIndexed;
      }
    });

    const generator = new StaticGeometryGenerator(meshes);
    generator.attributes = ['position'];
    generator.applyWorldTransforms = true;
    const mergedGeometry = generator.generate();

    meshes.forEach((mesh, i) => {
      mesh.geometry = originalGeometries[i];
    });
    createdGeometries.forEach((geometry) => geometry.dispose());

    colliderRef.current = new MeshBVH(mergedGeometry);
    return () => {
      colliderRef.current = null;
      mergedGeometry.dispose();
    };
  }, [wallsGroupRef, walls]);

  useEffect(() => {
    const setKey = (down: boolean) => (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW':
        case 'ArrowUp':
          keysRef.current.forward = down;
          break;
        case 'KeyS':
        case 'ArrowDown':
          keysRef.current.backward = down;
          break;
        case 'KeyA':
        case 'ArrowLeft':
          keysRef.current.left = down;
          break;
        case 'KeyD':
        case 'ArrowRight':
          keysRef.current.right = down;
          break;
        case 'Escape':
          if (down) onExit();
          break;
        default:
          return;
      }
    };
    const onKeyDown = setKey(true);
    const onKeyUp = setKey(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [onExit]);

  // Pointer lock can be lost outside our own control (native Esc, alt-tab).
  // Leave walk mode entirely rather than leaving an un-lockable overlay up.
  useEffect(() => {
    const handleChange = () => {
      const locked = Boolean(document.pointerLockElement);
      onLockedChange(locked);
      if (!locked) onExit();
    };
    document.addEventListener('pointerlockchange', handleChange);
    return () => document.removeEventListener('pointerlockchange', handleChange);
  }, [onExit, onLockedChange]);

  const beforeMove = useRef(new THREE.Vector3());
  const pending = useRef(new THREE.Vector3());
  const checkPoint = useRef(new THREE.Vector3());
  const hitInfo = useRef({ point: new THREE.Vector3(), distance: 0, faceIndex: -1 });

  useFrame((_, delta) => {
    const controls = controlsRef.current;
    if (!controls || !controls.isLocked) return;

    beforeMove.current.copy(camera.position);
    const { forward, backward, left, right } = keysRef.current;
    const step = WALK_SPEED * Math.min(delta, 0.1);
    if (forward) controls.moveForward(step);
    if (backward) controls.moveForward(-step);
    if (right) controls.moveRight(step);
    if (left) controls.moveRight(-step);

    // moveForward/moveRight above already mutated camera.position with the
    // naive (uncollided) move -- capture it as the candidate, then put the
    // camera back so nothing is visibly applied until collision is resolved.
    pending.current.copy(camera.position);
    camera.position.copy(beforeMove.current);

    const collider = colliderRef.current;
    if (collider) {
      checkPoint.current.set(pending.current.x, ANKLE_HEIGHT, pending.current.z);
      // Two push-out passes: one wall resolves cleanly in one pass; a corner
      // between two walls needs a second pass against the other wall.
      for (let i = 0; i < 2; i += 1) {
        const hit = collider.closestPointToPoint(checkPoint.current, hitInfo.current, 0, PLAYER_RADIUS);
        if (!hit) break;
        const push = checkPoint.current.clone().sub(hit.point);
        push.y = 0;
        if (push.lengthSq() < 1e-8) push.set(1, 0, 0);
        push.normalize().multiplyScalar(PLAYER_RADIUS - hit.distance);
        checkPoint.current.add(push);
      }
      pending.current.x = checkPoint.current.x;
      pending.current.z = checkPoint.current.z;
    }

    pending.current.x = THREE.MathUtils.clamp(pending.current.x, -floorHalfExtents.x + FLOOR_MARGIN, floorHalfExtents.x - FLOOR_MARGIN);
    pending.current.z = THREE.MathUtils.clamp(pending.current.z, -floorHalfExtents.z + FLOOR_MARGIN, floorHalfExtents.z - FLOOR_MARGIN);
    pending.current.y = EYE_HEIGHT;

    camera.position.copy(pending.current);
  });

  return <PointerLockControls ref={controlsRef} onLock={() => onLockedChange(true)} onUnlock={() => onLockedChange(false)} />;
}
