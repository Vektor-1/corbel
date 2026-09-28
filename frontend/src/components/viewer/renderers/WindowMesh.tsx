import { materials } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import type { ColorPreset } from '@/store/designStore';
import { tintForConfidence } from '@/lib/geometry/confidence-tint';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall, Window } from '@/types/design';

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

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = win.position.x / wallLength;

  const winX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const winZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);
  const windowSillHeight = win.sillHeight / 1000;
  const baseColor = materials[theme].windowGlass;
  const color = selected
    ? '#2563eb'
    : colorPreset === 'validation'
      ? tintForConfidence(baseColor, win.confidence)
      : baseColor;

  return (
    <mesh
      position={[winX, windowSillHeight + winHeight / 2, winZ]}
      rotation={[0, -angle, 0]}
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
      <boxGeometry args={[winWidth, winHeight, 0.04]} />
      <ElementMaterial color={color} shading={shading} roughness={0.15} metalness={0.4} transparent opacity={0.55} />
      <ElementEdges show={showEdges} color={edgeColor} />
    </mesh>
  );
}
