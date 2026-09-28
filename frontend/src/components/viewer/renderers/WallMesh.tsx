import * as THREE from 'three';
import { useMemo } from 'react';
import { createWallBrush, computeOpeningBrushes, evaluateWallWithOpenings } from '@/lib/geometry/wall-openings';
import type { WallFootprint } from '@/lib/geometry/wall-joints';
import { materials } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import type { ColorPreset } from '@/store/designStore';
import { tintForConfidence } from '@/lib/geometry/confidence-tint';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall, Door, Window } from '@/types/design';

const EMPTY_DOORS: Door[] = [];
const EMPTY_WINDOWS: Window[] = [];

export function WallMesh({
  wall,
  footprint,
  pixelsPerMetre,
  doors = EMPTY_DOORS,
  windows = EMPTY_WINDOWS,
  selected = false,
  theme,
  colorPreset = 'standard',
  shading = 'rendered',
  showEdges = false,
  edgeColor = '#232323',
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  wall: Wall;
  footprint: WallFootprint;
  pixelsPerMetre: number;
  doors?: Door[];
  windows?: Window[];
  selected?: boolean;
  theme: ViewerTheme;
  colorPreset?: ColorPreset;
  shading?: Shading;
  showEdges?: boolean;
  edgeColor?: string;
  onSelect?: () => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
}) {
  const height = Math.max(1.2, wall.height / 1000);
  const wallThicknessMm = wall.thickness;
  const baseColor = wall.type === 'loadBearing' ? materials[theme].loadBearing : materials[theme].partition;
  const color = selected
    ? '#2563eb'
    : colorPreset === 'validation'
      ? tintForConfidence(baseColor, wall.confidence)
      : baseColor;

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
      onPointerOver={(e) => {
        e.stopPropagation();
        onHoverStart?.();
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        onHoverEnd?.();
      }}
    >
      <ElementMaterial color={color} shading={shading} roughness={0.85} metalness={0.02} />
      <ElementEdges show={showEdges} color={edgeColor} />
    </mesh>
  );
}
