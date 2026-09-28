import { getPlanBounds } from '@/lib/viewer/plan-bounds';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import { ElementMaterial } from './ElementMaterial';
import { ElementEdges } from './ElementEdges';
import type { Wall } from '@/types/design';

export function Roof({
  walls,
  wallHeight,
  theme,
  pixelsPerMetre,
  shading = 'rendered',
  showEdges = false,
  edgeColor = '#232323',
}: {
  walls: Wall[];
  wallHeight: number;
  theme: ViewerTheme;
  pixelsPerMetre: number;
  shading?: Shading;
  showEdges?: boolean;
  edgeColor?: string;
}) {
  const bounds = getPlanBounds(walls, pixelsPerMetre);
  if (!bounds || bounds.width < 0.1 || bounds.depth < 0.1) return null;

  const wallHeightM = Math.max(1.2, wallHeight / 1000);
  const roofColor = theme === 'dark' ? '#3a3a3a' : '#c0c0c0';

  return (
    <mesh
      position={[bounds.centerX, wallHeightM + 0.15, bounds.centerZ]}
      rotation={[-Math.PI / 2, 0, 0]}
      castShadow
      receiveShadow
    >
      <planeGeometry args={[bounds.width + 1, bounds.depth + 1]} />
      <ElementMaterial color={roofColor} shading={shading} roughness={0.7} metalness={0.05} />
      <ElementEdges show={showEdges} color={edgeColor} />
    </mesh>
  );
}
