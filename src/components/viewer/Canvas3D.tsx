'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF } from '@react-three/drei';
import { useDesignStore } from '@/store/designStore';
import { computeWallFootprints, type WallFootprint } from '@/lib/geometry/wall-joints';
import * as THREE from 'three';
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';

import type { DesignObject, ObjectAsset, Wall, Door, Window } from '@/types/design';

/** Canvas px → meters (100 px = 1 m). */
const PX_TO_M = 0.01;

// Physical material palette — walls read as limestone plaster, doors as
// walnut joinery, windows as steel-framed glass. Constant across themes;
// only the environment (background, fog, floor, grid) shifts.
const materials = {
  loadBearing: '#c7bda6',
  partition: '#9d968a',
  doorEntry: '#6f4e33',
  doorInternal: '#8a6a4b',
  windowGlass: '#9fb6bd',
} as const;

const environments = {
  light: {
    background: '#ece8de',
    floor: '#dcd6c9',
    gridMajor: '#a89f8d',
    gridMinor: '#ccc5b5',
  },
  dark: {
    background: '#141310',
    floor: '#211f1a',
    gridMajor: '#4d4839',
    gridMinor: '#2c2921',
  },
} as const;

function WallMesh({ wall, footprint }: { wall: Wall; footprint: WallFootprint }) {
  const height = Math.max(1.2, wall.height / 1000);
  const color = wall.type === 'loadBearing' ? materials.loadBearing : materials.partition;

  // Extrude the mitered plan footprint upward so adjoining walls share
  // exact joint faces instead of intersecting as separate boxes. The shape
  // lives in the XY plane with y negated: after rotation.x = -90° the plan
  // (x, y) lands on world (x, z) with the extrusion pointing up.
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(footprint[0].x * PX_TO_M, -footprint[0].y * PX_TO_M);
    for (let i = 1; i < footprint.length; i += 1) {
      shape.lineTo(footprint[i].x * PX_TO_M, -footprint[i].y * PX_TO_M);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  }, [footprint, height]);

  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.85} metalness={0.02} />
    </mesh>
  );
}

function DoorMesh({ door, wall }: { door: Door; wall: Wall }) {
  const doorWidth = Math.max(0.6, door.width / 1000);
  const doorHeight = Math.min(wall.height / 1000, 2.1);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = door.position.x / wallLength;

  const doorX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / 100;
  const doorZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / 100;
  const angle = Math.atan2(dy, dx);

  const doorColor = door.type === 'entry' ? materials.doorEntry : materials.doorInternal;

  return (
    <mesh position={[doorX, doorHeight / 2, doorZ]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[doorWidth, doorHeight, 0.05]} />
      <meshStandardMaterial color={doorColor} roughness={0.55} metalness={0.05} />
    </mesh>
  );
}

function WindowMesh({ window: win, wall }: { window: Window; wall: Wall }) {
  const winWidth = Math.max(0.8, win.width / 1000);
  const winHeight = Math.max(0.6, win.height / 1000);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = win.position.x / wallLength;

  const winX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / 100;
  const winZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / 100;
  const angle = Math.atan2(dy, dx);
  const windowSillHeight = win.sillHeight / 1000;

  return (
    <mesh position={[winX, windowSillHeight + winHeight / 2, winZ]} rotation={[0, -angle, 0]} castShadow receiveShadow>
      <boxGeometry args={[winWidth, winHeight, 0.04]} />
      <meshStandardMaterial color={materials.windowGlass} roughness={0.15} metalness={0.4} transparent opacity={0.55} />
    </mesh>
  );
}

function ObjectPlaceholder({ asset }: { asset: ObjectAsset }) {
  return (
    <mesh position={[0, asset.dimensions[1] / 2, 0]}>
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
  object,
  asset,
  selected,
  onSelect,
}: {
  object: DesignObject;
  asset: ObjectAsset;
  selected: boolean;
  onSelect: () => void;
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
    <group
      position={[object.position.x / 100, 0, object.position.y / 100]}
      rotation={[0, -object.rotation, 0]}
      scale={object.scale}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <primitive
        object={clone}
        position={asset.offset}
        rotation={asset.modelRotation}
        scale={asset.modelScale}
      />
      {selected && (
        <mesh position={[0, asset.dimensions[1] / 2, 0]}>
          <boxGeometry args={asset.dimensions} />
          <meshBasicMaterial color="#2563eb" wireframe transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}

function Floor({ width, height, theme }: { width: number; height: number; theme: 'light' | 'dark' }) {
  const w = Math.max(12, width / 1000);
  const h = Math.max(9, height / 1000);

  return (
    <mesh position={[w / 2, 0, h / 2]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color={environments[theme].floor} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}

function SceneContent({ theme }: { theme: 'light' | 'dark' }) {
  const { floorPlan, selectedElementId, setSelectedElement } = useDesignStore();
  const walls = floorPlan?.walls;
  const footprints = useMemo(() => computeWallFootprints(walls ?? []), [walls]);

  if (!floorPlan) return null;

  const environment = environments[theme];
  const gridSize = Math.max(20, Math.ceil(Math.max(floorPlan.width, floorPlan.height) / 1000));
  const gridDivisions = gridSize;

  const wallMap = new Map(floorPlan.walls.map((w) => [w.id, w]));

  return (
    <>
      <color attach="background" args={[environment.background]} />
      <fog attach="fog" args={[environment.background, 25, 60]} />

      {/* Warm-keyed lighting: low ambient, warm key light, cool fill */}
      <ambientLight intensity={0.55} color="#fff6e8" />
      <directionalLight
        position={[14, 18, 10]}
        intensity={1.15}
        color="#ffedd0"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[-8, 12, 6]} intensity={0.25} color="#dbe7f0" />

      <PerspectiveCamera makeDefault position={[14, 11, 14]} fov={45} />
      <OrbitControls enableDamping dampingFactor={0.08} target={[6, 1.5, 4.5]} />

      <Floor width={floorPlan.width} height={floorPlan.height} theme={theme} />
      {floorPlan.walls.map((wall) => {
        const footprint = footprints.get(wall.id);
        return footprint ? <WallMesh key={wall.id} wall={wall} footprint={footprint} /> : null;
      })}

      {floorPlan.doors.map((door) => {
        const wall = wallMap.get(door.wallId);
        return wall ? <DoorMesh key={door.id} door={door} wall={wall} /> : null;
      })}

      {floorPlan.windows.map((win) => {
        const wall = wallMap.get(win.wallId);
        return wall ? <WindowMesh key={win.id} window={win} wall={wall} /> : null;
      })}

      {(floorPlan.objects ?? []).map((object) => {
        const asset = OBJECT_CATALOG_BY_ID[object.assetId];
        if (!asset) return null;

        return (
          <group key={object.id} position={[object.position.x / 100, 0, object.position.y / 100]}>
            <ObjectAssetBoundary asset={asset}>
              <Suspense fallback={<ObjectPlaceholder asset={asset} />}>
                <ObjectMesh
                  object={{ ...object, position: { x: 0, y: 0 } }}
                  asset={asset}
                  selected={selectedElementId === object.id}
                  onSelect={() => setSelectedElement(object.id)}
                />
              </Suspense>
            </ObjectAssetBoundary>
          </group>
        );
      })}

      <gridHelper
        args={[gridSize, gridDivisions, environment.gridMajor, environment.gridMinor]}
        position={[gridSize / 2, 0.01, gridSize / 2]}
      />
    </>
  );
}

export function Canvas3DContainer({ theme }: { theme: 'light' | 'dark' }) {
  const { floorPlan } = useDesignStore();

  if (!floorPlan) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--editor-canvas)] text-[var(--editor-text-subtle)]">
        Preparing spatial view…
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--editor-canvas)]">
      <Canvas shadows dpr={[1, 2]}>
        <SceneContent theme={theme} />
      </Canvas>
    </div>
  );
}
