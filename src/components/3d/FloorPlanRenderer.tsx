/**
 * 3D Floor Plan Renderer (React Three Fiber)
 * Subscribes to Zustand store and renders only dirty elements.
 *
 * Architecture:
 * - Every wall, room, opening is a separate mesh with a unique key
 * - Dirty tracking tells us which meshes to recreate
 * - Scene renders on-demand (frameloop="demand"), not continuously
 * - This saves battery on student devices
 */

import React, { useMemo, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera, OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { useFloorPlanStore, useDirtyFlags } from "../../lib/store/floorPlanStore";
import { Canonical } from "../../types/schema";

// ============================================================================
// WALL MESH COMPONENT
// ============================================================================

interface WallMeshProps {
  wall: Canonical.Wall;
  thickness: number;
  height: number; // extrusion height in mm
  color?: string;
  isSelected?: boolean;
}

const WallMesh: React.FC<WallMeshProps> = ({ wall, thickness, height, color = "#888", isSelected = false }) => {
  const geometry = useMemo(() => {
    // Create a box: wall endpoints become length, thickness is width, height is extrusion
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const length = Math.hypot(dx, dy);

    const box = new THREE.BoxGeometry(length, thickness, height);
    return box;
  }, [wall, thickness, height]);

  const position = useMemo(() => {
    const midX = (wall.start.x + wall.end.x) / 2;
    const midY = (wall.start.y + wall.end.y) / 2;
    return [midX, thickness / 2, height / 2];
  }, [wall, thickness, height]);

  const rotation = useMemo(() => {
    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    return Math.atan2(dy, dx);
  }, [wall]);

  const materialColor = isSelected ? "#00ff00" : color;

  return (
    <mesh
      key={`wall_${wall.id}`}
      geometry={geometry}
      position={position as [number, number, number]}
      rotation={[0, rotation, 0]}
    >
      <meshStandardMaterial color={materialColor} roughness={0.7} metalness={0.1} />
    </mesh>
  );
};

// ============================================================================
// OPENING (DOOR/WINDOW) MESH COMPONENT
// ============================================================================

interface OpeningMeshProps {
  opening: Canonical.Opening;
  hostWall: Canonical.Wall;
  libraryType: { width: number; height: number; sillHeight?: number };
  wallThickness: number;
  wallHeight: number;
  isSelected?: boolean;
}

const OpeningMesh: React.FC<OpeningMeshProps> = ({
  opening,
  hostWall,
  libraryType,
  wallThickness,
  wallHeight,
  isSelected = false,
}) => {
  // Position opening along wall
  const dx = hostWall.end.x - hostWall.start.x;
  const dy = hostWall.end.y - hostWall.start.y;
  const len = Math.hypot(dx, dy);
  const t = opening.positionAlongWall / len;

  const posX = hostWall.start.x + t * dx;
  const posY = hostWall.start.y + t * dy;

  const sillHeight = libraryType.sillHeight || 900; // mm
  const posZ = sillHeight + libraryType.height / 2;

  const geometry = useMemo(() => {
    return new THREE.BoxGeometry(libraryType.width, wallThickness, libraryType.height);
  }, [libraryType, wallThickness]);

  const rotation = Math.atan2(dy, dx);

  const materialColor = isSelected ? "#00ff00" : opening.kind === "door" ? "#8B4513" : "#87CEEB";

  return (
    <mesh
      key={`opening_${opening.id}`}
      geometry={geometry}
      position={[posX, wallThickness / 2, posZ]}
      rotation={[0, rotation, 0]}
    >
      <meshStandardMaterial color={materialColor} roughness={0.6} metalness={0.2} />
    </mesh>
  );
};

// ============================================================================
// ROOM FLOOR MESH COMPONENT
// ============================================================================

interface RoomMeshProps {
  room: Canonical.Room;
  height: number; // z-position of floor
  isSelected?: boolean;
}

const RoomMesh: React.FC<RoomMeshProps> = ({ room, height, isSelected = false }) => {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    if (room.vertices.length === 0) return null;

    shape.moveTo(room.vertices[0].x, room.vertices[0].y);
    for (let i = 1; i < room.vertices.length; i++) {
      shape.lineTo(room.vertices[i].x, room.vertices[i].y);
    }
    shape.lineTo(room.vertices[0].x, room.vertices[0].y);

    const geo = new THREE.ShapeGeometry(shape);
    return geo;
  }, [room.vertices]);

  if (!geometry) return null;

  const materialColor = isSelected ? "#ffff00" : "#cccccc";

  return (
    <mesh
      key={`room_${room.id}`}
      geometry={geometry}
      position={[0, 0, height]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <meshStandardMaterial color={materialColor} side={THREE.DoubleSide} roughness={0.8} />
    </mesh>
  );
};

// ============================================================================
// MAIN RENDERER SCENE
// ============================================================================

interface FloorPlanSceneProps {
  floorHeight: number; // mm (default 2800)
}

const FloorPlanScene: React.FC<FloorPlanSceneProps> = ({ floorHeight }) => {
  const floor = useFloorPlanStore((state) => state.currentFloor);
  const library = useFloorPlanStore((state) => state.library);
  const { dirtyWallIds, dirtyRoomIds, dirtyOpeningIds, isDirtyGlobal } = useDirtyFlags();
  const selectedElement = useFloorPlanStore((state) => ({
    id: state.selectedElementId,
    kind: state.selectedElementKind,
  }));

  const clearDirty = useFloorPlanStore((state) => state.clearDirty);

  // After render, clear dirty flags so 3D only updates on change
  useFrame(({ gl }) => {
    // On next frame after render, clear dirty
    if (isDirtyGlobal) {
      clearDirty();
      // Scene will re-render on-demand next time something changes
      gl.render(gl.scene, gl.camera);
    }
  });

  if (!floor) {
    return (
      <group>
        <Grid args={[10000, 10000]} cellSize={1000} cellColor="#6f6f6f" sectionSize={5000} sectionColor="#9d4edd" />
      </group>
    );
  }

  return (
    <group>
      {/* Grid floor */}
      <Grid args={[10000, 10000]} cellSize={1000} cellColor="#6f6f6f" sectionSize={5000} sectionColor="#9d4edd" />

      {/* Render walls (recreate only if wall in dirtyWallIds) */}
      {floor.walls.map((wall) => {
        const wallType = library.wallTypes.get(wall.typeRef);
        if (!wallType) return null;

        // Skip if not dirty and not selected
        const isDirty = dirtyWallIds.has(wall.id);
        const isSelected = selectedElement.id === wall.id && selectedElement.kind === "wall";

        if (!isDirty && !isSelected) {
          // Use cached mesh (not re-creating geometry)
          return <WallMesh key={`wall_${wall.id}`} wall={wall} thickness={wallType.thickness} height={floorHeight} />;
        }

        return (
          <WallMesh
            key={`wall_${wall.id}`}
            wall={wall}
            thickness={wallType.thickness}
            height={floorHeight}
            color="#888"
            isSelected={isSelected}
          />
        );
      })}

      {/* Render openings (doors/windows) */}
      {floor.openings.map((opening) => {
        const hostWall = floor.walls.find((w) => w.id === opening.hostWallId);
        if (!hostWall) return null;

        const wallType = library.wallTypes.get(hostWall.typeRef);
        const libraryType =
          opening.kind === "door"
            ? library.doorTypes.get(opening.typeRef)
            : library.windowTypes.get(opening.typeRef);

        if (!wallType || !libraryType) return null;

        const isDirty = dirtyOpeningIds.has(opening.id);
        const isSelected = selectedElement.id === opening.id && selectedElement.kind === "opening";

        if (!isDirty && !isSelected) {
          return (
            <OpeningMesh
              key={`opening_${opening.id}`}
              opening={opening}
              hostWall={hostWall}
              libraryType={libraryType}
              wallThickness={wallType.thickness}
              wallHeight={floorHeight}
            />
          );
        }

        return (
          <OpeningMesh
            key={`opening_${opening.id}`}
            opening={opening}
            hostWall={hostWall}
            libraryType={libraryType}
            wallThickness={wallType.thickness}
            wallHeight={floorHeight}
            isSelected={isSelected}
          />
        );
      })}

      {/* Render room floors */}
      {floor.rooms.map((room) => {
        const isDirty = dirtyRoomIds.has(room.id);
        const isSelected = selectedElement.id === room.id && selectedElement.kind === "room";

        if (!isDirty && !isSelected) {
          return <RoomMesh key={`room_${room.id}`} room={room} height={0} />;
        }

        return <RoomMesh key={`room_${room.id}`} room={room} height={0} isSelected={isSelected} />;
      })}

      {/* Lighting */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5000, 5000, 5000]} intensity={0.8} castShadow />
    </group>
  );
};

// ============================================================================
// CANVAS WRAPPER
// ============================================================================

export const FloorPlanRenderer: React.FC<{ floorHeight?: number }> = ({ floorHeight = 2800 }) => {
  return (
    <Canvas
      frameloop="demand" // Only render on state change, not every frame
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true }}
    >
      <PerspectiveCamera makeDefault position={[0, 3000, 3000]} fov={50} />
      <OrbitControls />
      <FloorPlanScene floorHeight={floorHeight} />
    </Canvas>
  );
};
