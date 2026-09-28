import type { Wall, Door, Window, DesignObject, ObjectAsset } from '@/types/design';

/** Read-only quantities for the 3D hover HUD. All length/height/thickness
 * values are in millimetres, matching the schema's stored units -- callers
 * format them with `formatLength` at display time. `object` has no
 * `confidence`: furniture is always user-placed, never AI-detected. */
export type ElementMetrics =
  | { kind: 'wall'; label: string; length: number; height: number; thickness: number; confidence?: number }
  | { kind: 'door'; label: string; width: number; height: number; confidence?: number }
  | { kind: 'window'; label: string; width: number; height: number; sillHeight: number; confidence?: number }
  | { kind: 'object'; label: string; width: number; height: number; depth: number };

export function getWallMetrics(wall: Wall, pixelsPerMetre: number): ElementMetrics {
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const lengthMm = (Math.hypot(dx, dy) / pixelsPerMetre) * 1000;

  return {
    kind: 'wall',
    label: wall.type === 'loadBearing' ? 'Load-bearing wall' : 'Partition wall',
    length: lengthMm,
    height: wall.height,
    thickness: wall.thickness,
    confidence: wall.confidence,
  };
}

export function getDoorMetrics(door: Door, wall: Wall): ElementMetrics {
  return {
    kind: 'door',
    label: door.type === 'entry' ? 'Entry door' : 'Internal door',
    width: door.width,
    height: Math.min(wall.height, 2100),
    confidence: door.confidence,
  };
}

export function getWindowMetrics(win: Window): ElementMetrics {
  return {
    kind: 'window',
    label: 'Window',
    width: win.width,
    height: win.height,
    sillHeight: win.sillHeight,
    confidence: win.confidence,
  };
}

export function getObjectMetrics(object: DesignObject, asset: ObjectAsset): ElementMetrics {
  return {
    kind: 'object',
    label: asset.name,
    width: asset.dimensions[0] * object.scale * 1000,
    height: asset.dimensions[1] * object.scale * 1000,
    depth: asset.dimensions[2] * object.scale * 1000,
  };
}
