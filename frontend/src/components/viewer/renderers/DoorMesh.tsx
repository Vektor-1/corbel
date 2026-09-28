import { materials } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import type { ColorPreset } from '@/store/designStore';
import { tintForConfidence } from '@/lib/geometry/confidence-tint';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall, Door } from '@/types/design';

export function DoorMesh({
  door,
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
  door: Door;
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
  const doorWidth = Math.max(0.6, door.width / 1000);
  const doorHeight = Math.min(wall.height / 1000, 2.1);

  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const wallLength = Math.sqrt(dx * dx + dy * dy);
  const t = door.position.x / wallLength;

  const doorX = (wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t) / pixelsPerMetre;
  const doorZ = (wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t) / pixelsPerMetre;
  const angle = Math.atan2(dy, dx);

  const baseColor = door.type === 'entry' ? materials[theme].doorEntry : materials[theme].doorInternal;
  const doorColor = selected
    ? '#2563eb'
    : colorPreset === 'validation'
      ? tintForConfidence(baseColor, door.confidence)
      : baseColor;

  return (
    <mesh
      position={[doorX, doorHeight / 2, doorZ]}
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
      <boxGeometry args={[doorWidth, doorHeight, 0.05]} />
      <ElementMaterial color={doorColor} shading={shading} roughness={0.55} metalness={0.05} />
      <ElementEdges show={showEdges} color={edgeColor} />
    </mesh>
  );
}
