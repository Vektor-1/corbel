import * as THREE from 'three';
import { environments } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import { ElementMaterial } from './ElementMaterial';

export function Floor({
  width,
  height,
  theme,
  shading = 'rendered',
}: {
  width: number;
  height: number;
  theme: ViewerTheme;
  shading?: Shading;
}) {
  const w = Math.max(12, width / 1000);
  const h = Math.max(9, height / 1000);

  return (
    <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[w, h]} />
      <ElementMaterial color={environments[theme].floor} shading={shading} roughness={0.95} side={THREE.DoubleSide} />
    </mesh>
  );
}
