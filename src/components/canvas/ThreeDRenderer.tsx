'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { Canonical3D } from '@/lib/types/3d';

interface ThreeDRendererProps {
  floor3D: Canonical3D.Floor3D | null;
  onElementSelect?: (elementId: string) => void;
}

function FloorModel({ floor3D }: { floor3D: Canonical3D.Floor3D }) {
  if (!floor3D) return null;

  return (
    <group>
      {/* Render walls */}
      {floor3D.walls.map(wall => (
        <WallGeometry key={wall.id} wall={wall} />
      ))}

      {/* Render rooms */}
      {floor3D.rooms.map(room => (
        <RoomGeometry key={room.id} room={room} />
      ))}

      {/* Render openings */}
      {floor3D.openings.map(opening => (
        <OpeningGeometry key={opening.id} opening={opening} />
      ))}
    </group>
  );
}

function WallGeometry({ wall }: { wall: Canonical3D.Wall3D }) {
  const dx = wall.end.x - wall.start.x;
  const dy = wall.end.y - wall.start.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);

  const centerX = (wall.start.x + wall.end.x) / 2 / 1000;
  const centerY = (wall.start.y + wall.end.y) / 2 / 1000;
  const centerZ = wall.height / 2 / 1000;

  return (
    <mesh position={[centerX, centerZ, centerY]}>
      <boxGeometry args={[length / 1000, wall.height / 1000, wall.thickness / 1000]} />
      <meshStandardMaterial color="#888888" />
    </mesh>
  );
}

function RoomGeometry({ room }: { room: Canonical3D.Room3D }) {
  const centerX = room.vertices.reduce((sum, v) => sum + v.x, 0) / room.vertices.length / 1000;
  const centerY = room.vertices.reduce((sum, v) => sum + v.y, 0) / room.vertices.length / 1000;
  const centerZ = room.height / 2 / 1000;

  return (
    <mesh position={[centerX, centerZ, centerY]}>
      <boxGeometry args={[2, room.height / 1000, 2]} />
      <meshStandardMaterial color="#e8e8e8" transparent opacity={0.3} />
    </mesh>
  );
}

function OpeningGeometry({ opening }: { opening: Canonical3D.Opening3D }) {
  const x = opening.position.x / 1000;
  const y = opening.position.y / 1000;
  const z = (opening.kind === 'door' ? opening.height / 2 : opening.sillHeight + opening.height / 2) / 1000;

  return (
    <mesh position={[x, z, y]}>
      <boxGeometry
        args={[opening.width / 1000, opening.height / 1000, opening.frameDepth / 1000]}
      />
      <meshStandardMaterial
        color={opening.kind === 'door' ? '#4CAF50' : '#87CEEB'}
        emissive={opening.kind === 'door' ? 0x2e7d32 : 0x4fa3d1}
      />
    </mesh>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />
      <pointLight position={[-10, 10, -10]} intensity={0.4} />
    </>
  );
}

export function ThreeDRenderer({ floor3D, onElementSelect }: ThreeDRendererProps) {
  return (
    <Canvas style={{ width: '100%', height: '100%' }}>
      <PerspectiveCamera makeDefault position={[0, 5, 5]} />
      <Lights />
      <Suspense fallback={null}>
        {floor3D ? (
          <FloorModel floor3D={floor3D} />
        ) : (
          <mesh>
            <boxGeometry args={[2, 2, 2]} />
            <meshStandardMaterial color="#cccccc" />
          </mesh>
        )}
      </Suspense>
      <OrbitControls
        autoRotate={!floor3D}
        autoRotateSpeed={2}
        enableDamping
        dampingFactor={0.05}
      />
      <gridHelper args={[20, 20]} />
      <axesHelper args={[5]} />
    </Canvas>
  );
}
