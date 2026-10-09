import * as THREE from 'three';
import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { TransformControls, useGLTF } from '@react-three/drei';
import type { ObjectAsset } from '@/types/design';

/**
 * Simple gable roof: a triangular cross-section (eave, eave, ridge) extruded
 * along the depth axis -- same Shape+ExtrudeGeometry construction used for
 * wall/opening CSG brushes (lib/geometry/wall-openings.ts), which produces
 * consistently-wound geometry regardless of point order. Pascal's own roof
 * system (packages/viewer/src/systems/roof) is a full parametric multi-segment
 * model (hip/gable/conical, dormers, wall attachment); this is a scaled-down
 * placeable primitive in the same spirit, sized via the object's own
 * dimensions rather than fitted to a building footprint.
 */
function GableRoofMesh({ asset }: { asset: ObjectAsset }) {
  const [width, ridgeHeight, depth] = asset.dimensions;

  const geometry = useMemo(() => {
    const halfWidth = width / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-halfWidth, 0);
    shape.lineTo(halfWidth, 0);
    shape.lineTo(0, ridgeHeight);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geom.translate(0, 0, -depth / 2);
    geom.computeVertexNormals();
    return geom;
  }, [width, ridgeHeight, depth]);

  return (
    <mesh
      geometry={geometry}
      position={[asset.offset[0], asset.offset[1], asset.offset[2]]}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial color={asset.color} roughness={0.75} metalness={0.05} />
    </mesh>
  );
}

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

function ProceduralObjectMesh({ asset, selected }: { asset: ObjectAsset; selected: boolean }) {
  return (
    <>
      {asset.procedural === 'gable-roof' && <GableRoofMesh asset={asset} />}
      {selected && (
        <mesh>
          <boxGeometry args={asset.dimensions} />
          <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </>
  );
}

function GltfObjectMesh({
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

export function ObjectMesh({ asset, selected }: { asset: ObjectAsset; selected: boolean }) {
  return asset.procedural ? (
    <ProceduralObjectMesh asset={asset} selected={selected} />
  ) : (
    <GltfObjectMesh asset={asset} selected={selected} />
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
