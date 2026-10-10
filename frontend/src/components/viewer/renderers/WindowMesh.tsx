import { materials } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import type { ColorPreset } from '@/store/designStore';
import { tintForConfidence } from '@/lib/geometry/confidence-tint';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall, Window } from '@/types/design';

const FRAME_THICKNESS = 0.06;

export function WindowMesh({
  window: win,
  wall,
  pixelsPerMetre,
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
  window: Window;
  wall: Wall;
  pixelsPerMetre: number;
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
  const winWidth = Math.max(0.8, win.width / 1000);
  const winHeight = Math.max(0.6, win.height / 1000);
  const wallDepth = Math.max(0.05, wall.thickness / 1000);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = win.position.x / wallLength;

  const winX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const winZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);
  const windowSillHeight = win.sillHeight / 1000;
  const glassColor = selected
    ? '#2563eb'
    : colorPreset === 'validation'
      ? tintForConfidence(materials[theme].windowGlass, win.confidence)
      : materials[theme].windowGlass;
  const frameColor = selected ? '#2563eb' : materials[theme].windowFrame;

  // Frame bars sit flush with both wall faces (full wall depth) so the
  // opening reads as a reveal cut through the wall, not a decal on its
  // face. The glass pane sits recessed at wall-centre, inset inside the
  // frame's inner edge -- its own size is the opening size minus the
  // frame border on every side.
  const innerWidth = Math.max(0.05, winWidth - FRAME_THICKNESS * 2);
  const innerHeight = Math.max(0.05, winHeight - FRAME_THICKNESS * 2);

  const handlers = {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onSelect?.();
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHoverStart?.();
    },
    onPointerOut: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      onHoverEnd?.();
    },
  };

  return (
    <group position={[winX, windowSillHeight + winHeight / 2, winZ]} rotation={[0, -angle, 0]} {...handlers}>
      {/* Sill and head */}
      <mesh position={[0, (winHeight - FRAME_THICKNESS) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[winWidth, FRAME_THICKNESS, wallDepth]} />
        <ElementMaterial color={frameColor} shading={shading} roughness={0.7} metalness={0.05} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
      <mesh position={[0, -(winHeight - FRAME_THICKNESS) / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[winWidth, FRAME_THICKNESS, wallDepth]} />
        <ElementMaterial color={frameColor} shading={shading} roughness={0.7} metalness={0.05} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
      {/* Left and right jambs */}
      <mesh position={[(winWidth - FRAME_THICKNESS) / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[FRAME_THICKNESS, innerHeight, wallDepth]} />
        <ElementMaterial color={frameColor} shading={shading} roughness={0.7} metalness={0.05} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
      <mesh position={[-(winWidth - FRAME_THICKNESS) / 2, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[FRAME_THICKNESS, innerHeight, wallDepth]} />
        <ElementMaterial color={frameColor} shading={shading} roughness={0.7} metalness={0.05} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
      {/* Recessed glass pane, centred in the wall thickness */}
      <mesh castShadow={false} receiveShadow={false}>
        <boxGeometry args={[innerWidth, innerHeight, 0.02]} />
        <ElementMaterial color={glassColor} shading={shading} transparent opacity={0.35} roughness={0.05} metalness={0.6} />
        <ElementEdges show={showEdges} color={edgeColor} />
      </mesh>
    </group>
  );
}
