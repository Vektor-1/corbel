import * as THREE from 'three';
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TransformControls, useGLTF } from '@react-three/drei';
import type { ObjectAsset } from '@/types/design';

/** Move/rotate/scale mode for the selected furniture object's 3D gizmo (Blender-style G/R/S). */
export type ObjectTransformMode = 'translate' | 'rotate' | 'scale' | null;

/** Fallback box rendered when the GLB model is unavailable. */
export function ObjectPlaceholder({ asset }: { asset: ObjectAsset }) {
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

export function ObjectMesh({
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
export function ObjectInstance({
  object,
  asset,
  selected,
  transformMode,
  worldPosition,
  pixelsPerMetre,
  onSelect,
  onCommitTransform,
  onHoverStart,
  onHoverEnd,
}: {
  object: { rotation: number; scale: number };
  asset: ObjectAsset;
  selected: boolean;
  transformMode: ObjectTransformMode;
  worldPosition: [number, number, number];
  pixelsPerMetre: number;
  onSelect: () => void;
  onCommitTransform: (updates: { position?: { x: number; y: number }; rotation?: number; scale?: number }) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);

  return (
    <>
      <group
        ref={groupRef}
        position={worldPosition}
        rotation={[0, -object.rotation, 0]}
        scale={object.scale}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHoverStart?.();
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHoverEnd?.();
        }}
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
