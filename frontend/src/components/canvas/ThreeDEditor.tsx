'use client';

import React, { useRef, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { Canonical3D } from '@/lib/types/3d';

type TransformMode = 'translate' | 'rotate' | 'scale';

interface ThreeDEditorProps {
  floor3D: Canonical3D.Floor3D | null;
  onElementSelect?: (elementId: string, type: 'wall' | 'room' | 'opening') => void;
  onElementUpdate?: (elementId: string, newGeometry: any) => void;
  editMode?: boolean;
  transformMode?: TransformMode;
}

interface SelectableObject {
  id: string;
  type: 'wall' | 'room' | 'opening';
  mesh: THREE.Mesh;
  originalPosition: THREE.Vector3;
}

interface EditorSceneProps extends ThreeDEditorProps {
  transformMode?: TransformMode;
  onTransformModeChange?: (mode: TransformMode) => void;
}

function EditorScene({
  floor3D,
  onElementSelect,
  onElementUpdate,
  editMode,
  transformMode = 'translate',
  onTransformModeChange,
}: EditorSceneProps) {
  const { scene, camera } = useThree();
  const transformControlsRef = useRef<any>(null);
  const [selectedObject, setSelectedObject] = useState<SelectableObject | null>(null);
  const [selectables, setSelectables] = useState<Map<string, SelectableObject>>(new Map());
  const [mode, setMode] = useState<TransformMode>(transformMode);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  // Handle mouse move for raycasting
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!editMode) return;

    const canvas = (e.target as HTMLElement).closest('canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }, [editMode]);

  // Handle mouse click for selection
  const handleMouseClick = useCallback(
    (e: MouseEvent) => {
      if (!editMode) return;

      raycasterRef.current.setFromCamera(mouseRef.current, camera);

      const meshes = Array.from(selectables.values()).map(s => s.mesh);
      const intersects = raycasterRef.current.intersectObjects(meshes);

      if (intersects.length > 0) {
        const clickedMesh = intersects[0].object as THREE.Mesh;
        const selectable = Array.from(selectables.values()).find(s => s.mesh === clickedMesh);

        if (selectable) {
          setSelectedObject(selectable);
          onElementSelect?.(selectable.id, selectable.type);

          // Attach transform controls to selected object
          if (transformControlsRef.current) {
            transformControlsRef.current.attach(clickedMesh);
          }
        }
      } else {
        setSelectedObject(null);
        if (transformControlsRef.current) {
          transformControlsRef.current.detach();
        }
      }
    },
    [editMode, camera, selectables, onElementSelect]
  );

  // Render walls as selectable boxes
  const wallElements = floor3D?.walls.map(wall => {
    const width = Math.hypot(
      wall.end.x - wall.start.x,
      wall.end.y - wall.start.y
    ) / 1000;
    const depth = wall.thickness / 1000;
    const height = wall.height / 1000;

    const centerX = (wall.start.x + wall.end.x) / 2 / 1000;
    const centerY = (wall.start.y + wall.end.y) / 2 / 1000;
    const centerZ = height / 2;

    const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);

    return (
      <WallObject
        key={wall.id}
        wall={wall}
        width={width}
        depth={depth}
        height={height}
        position={[centerX, centerZ, centerY]}
        rotation={[0, angle, 0]}
        onSelect={(id) => {
          onElementSelect?.(id, 'wall');
        }}
        isSelected={selectedObject?.id === wall.id}
      />
    );
  }) || [];

  // Render rooms as selectable spheres
  const roomElements = floor3D?.rooms.map(room => (
    <RoomObject
      key={room.id}
      room={room}
      position={[room.vertices[0]?.x / 1000 || 0, room.height / 2000, room.vertices[0]?.y / 1000 || 0]}
      onSelect={(id) => {
        onElementSelect?.(id, 'room');
      }}
      isSelected={selectedObject?.id === room.id}
    />
  )) || [];

  // Render openings as selectable boxes
  const openingElements = floor3D?.openings.map(opening => (
    <OpeningObject
      key={opening.id}
      opening={opening}
      position={[opening.position.x / 1000, opening.height / 2000, opening.position.y / 1000]}
      onSelect={(id) => {
        onElementSelect?.(id, 'opening');
      }}
      isSelected={selectedObject?.id === opening.id}
    />
  )) || [];

  // Handle keyboard shortcuts for transform mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!editMode) return;

      if (e.key === 't' || e.key === 'T') {
        setMode('translate');
        onTransformModeChange?.('translate');
      } else if (e.key === 'r' || e.key === 'R') {
        setMode('rotate');
        onTransformModeChange?.('rotate');
      } else if (e.key === 's' || e.key === 'S') {
        setMode('scale');
        onTransformModeChange?.('scale');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editMode, onTransformModeChange]);

  React.useEffect(() => {
    if (editMode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('click', handleMouseClick);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('click', handleMouseClick);
      };
    }
  }, [editMode, handleMouseMove, handleMouseClick]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} castShadow />
      <pointLight position={[-10, 10, -10]} intensity={0.4} />

      {/* Environment */}
      <gridHelper args={[40, 40]} />
      <axesHelper args={[5]} />

      {/* Scene objects */}
      {wallElements}
      {roomElements}
      {openingElements}

      {/* Controls */}
      <OrbitControls enableDamping dampingFactor={0.05} />

      {editMode && selectedObject && (
        <TransformControls
          ref={transformControlsRef}
          mode={mode}
          space="world"
          onObjectChange={() => {
            if (selectedObject && transformControlsRef.current) {
              const obj = transformControlsRef.current.object;
              const newPos = obj.position;
              const newRot = obj.rotation;
              const newScale = obj.scale;

              onElementUpdate?.(selectedObject.id, {
                position: { x: newPos.x * 1000, y: newPos.y * 1000, z: newPos.z * 1000 },
                rotation: { x: newRot.x, y: newRot.y, z: newRot.z },
                scale: { x: newScale.x, y: newScale.y, z: newScale.z },
              });
            }
          }}
        />
      )}

      {/* Gizmo helper */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  );
}

function WallObject({
  wall,
  width,
  depth,
  height,
  position,
  rotation,
  onSelect,
  isSelected,
}: {
  wall: Canonical3D.Wall3D;
  width: number;
  depth: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      castShadow
      receiveShadow
      onClick={() => onSelect(wall.id)}
    >
      <boxGeometry args={[width, height, depth]} />
      <meshStandardMaterial
        color={isSelected ? '#ff6b6b' : '#888888'}
        metalness={0.3}
        roughness={0.6}
        emissive={isSelected ? '#ff0000' : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  );
}

function RoomObject({
  room,
  position,
  onSelect,
  isSelected,
}: {
  room: Canonical3D.Room3D;
  position: [number, number, number];
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const scale = Math.sqrt((room.area / 1e6) * 10); // Rough scaling

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      receiveShadow
      onClick={() => onSelect(room.id)}
    >
      <sphereGeometry args={[scale / 2, 16, 16]} />
      <meshStandardMaterial
        color={isSelected ? '#4ecdc4' : '#e8e8e8'}
        transparent
        opacity={0.6}
        metalness={0.2}
        roughness={0.8}
        emissive={isSelected ? '#00ffff' : '#000000'}
        emissiveIntensity={isSelected ? 0.2 : 0}
      />
    </mesh>
  );
}

function OpeningObject({
  opening,
  position,
  onSelect,
  isSelected,
}: {
  opening: Canonical3D.Opening3D;
  position: [number, number, number];
  onSelect: (id: string) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const width = opening.width / 1000;
  const height = opening.height / 1000;

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      receiveShadow
      onClick={() => onSelect(opening.id)}
    >
      <boxGeometry args={[width, height, 0.1]} />
      <meshStandardMaterial
        color={isSelected ? '#ffa500' : opening.kind === 'door' ? '#4CAF50' : '#87CEEB'}
        metalness={0.5}
        roughness={0.4}
        emissive={isSelected ? '#ffff00' : '#000000'}
        emissiveIntensity={isSelected ? 0.3 : 0}
      />
    </mesh>
  );
}

export function ThreeDEditor({
  floor3D,
  onElementSelect,
  onElementUpdate,
  editMode = false,
  transformMode = 'translate',
}: ThreeDEditorProps) {
  const [mode, setMode] = React.useState<TransformMode>(transformMode);

  return (
    <div className="w-full h-full flex flex-col">
      {/* Transform Mode Controls */}
      {editMode && (
        <div className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex gap-2 items-center">
          <span className="text-xs text-slate-400 uppercase font-semibold">Transform:</span>
          {(['translate', 'rotate', 'scale'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                mode === m
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {m.charAt(0).toUpperCase() + m.slice(1)} ({m[0].toUpperCase()})
            </button>
          ))}
          <div className="text-xs text-slate-500 ml-auto">
            Keyboard: T/R/S for modes
          </div>
        </div>
      )}

      <div className="flex-1">
        <Canvas camera={{ position: [15, 15, 15], fov: 50 }} shadows>
          <EditorScene
            floor3D={floor3D}
            onElementSelect={onElementSelect}
            onElementUpdate={onElementUpdate}
            editMode={editMode}
            transformMode={mode}
            onTransformModeChange={setMode}
          />
        </Canvas>
      </div>
    </div>
  );
}
