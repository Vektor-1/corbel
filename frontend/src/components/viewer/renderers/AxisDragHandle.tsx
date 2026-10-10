import * as THREE from 'three';
import { useRef } from 'react';
import { TransformControls } from '@react-three/drei';
import { projectOffsetOntoWall } from '@/lib/geometry/wall-intersections';
import type { Wall } from '@/types/design';

/**
 * A draggable handle constrained to one axis, used for 3D architecture edits
 * (wall height, door/window position along their host wall). Committing writes
 * back through the same store action the 2D editor uses, once per drag (not on
 * every intermediate frame) — 2D stays the single source of truth either way.
 */
export function AxisDragHandle({
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
export function OpeningAxisHandle({
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
