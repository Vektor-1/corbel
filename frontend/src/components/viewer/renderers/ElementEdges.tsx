import { Edges } from '@react-three/drei';

/** Optional hard-edge line overlay (geometry-based, not a post-processing
 * pass -- Corbel has no EffectComposer pipeline). Reads the parent
 * `<mesh>`'s own geometry, so it's always placed as a sibling of
 * `<ElementMaterial>` inside the same mesh. */
export function ElementEdges({ show, color }: { show: boolean; color: string }) {
  if (!show) return null;
  return <Edges color={color} threshold={15} />;
}
