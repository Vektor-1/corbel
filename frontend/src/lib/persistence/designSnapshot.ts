import type { FloorPlan } from '@/types/design';
import type { TraceImageReference } from '@/store/designStore';
import type { StorageLike } from './floorPlanSnapshot';
import { centerizeFloorPlan } from '@/lib/geometry/origin';

// v2: plan coordinates are stored CENTERED on the sheet (0,0 = sheet center).
// v1: coordinates were anchored to the sheet's top-left corner. v1 snapshots
// are migrated in place on first load and the legacy key is removed.
export const DESIGN_SNAPSHOT_KEY = 'corbel:editor-design:v2';
const LEGACY_DESIGN_SNAPSHOT_KEY = 'corbel:editor-design:v1';

export interface DesignSnapshot {
  floorPlan: FloorPlan;
  ghostFloorPlan: FloorPlan | null;
  ghostOpacity: number;
  traceImage: TraceImageReference | null;
}

type SerializedSnapshot = DesignSnapshot & { version: 2 };

function revivePlan(value: unknown): FloorPlan | null {
  if (!value || typeof value !== 'object') return null;
  const plan = value as Partial<FloorPlan>;
  if (typeof plan.id !== 'string' || !Array.isArray(plan.walls) || !Array.isArray(plan.rooms) || !Array.isArray(plan.doors) || !Array.isArray(plan.windows)) return null;
  return {
    ...plan,
    name: plan.name ?? 'Recovered design',
    width: plan.width ?? 12000,
    height: plan.height ?? 9000,
    scale: plan.scale ?? 100,
    objects: Array.isArray(plan.objects) ? plan.objects : [],
    createdAt: plan.createdAt ? new Date(plan.createdAt) : new Date(),
    updatedAt: plan.updatedAt ? new Date(plan.updatedAt) : new Date(),
  } as FloorPlan;
}

function reviveTraceImage(value: unknown): TraceImageReference | null {
  if (!value || typeof value !== 'object') return null;
  const image = value as Partial<TraceImageReference>;
  if (typeof image.url !== 'string') return null;
  return {
    url: image.url,
    scale: Math.max(0.1, Math.min(3, Number(image.scale) || 0.7)),
    opacity: Math.max(0, Math.min(1, Number(image.opacity) || 0.58)),
    blur: Math.max(0, Math.min(20, Number(image.blur) || 0)),
    calibration: image.calibration && typeof image.calibration.wallId === 'string' && Number.isFinite(image.calibration.knownLengthMm) && Number.isFinite(image.calibration.pixelsPerMeter)
      ? image.calibration
      : undefined,
  };
}

export function saveDesignSnapshot(storage: StorageLike, floorPlan: FloorPlan, ghostFloorPlan: FloorPlan | null, ghostOpacity: number, traceImage: TraceImageReference | null = null): void {
  storage.setItem(DESIGN_SNAPSHOT_KEY, JSON.stringify({ version: 2, floorPlan, ghostFloorPlan, ghostOpacity, traceImage } satisfies SerializedSnapshot));
}

function readSnapshot(storage: StorageLike, key: string): DesignSnapshot | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SerializedSnapshot>;
    const floorPlan = revivePlan(value.floorPlan);
    const ghostFloorPlan = value.ghostFloorPlan === null ? null : revivePlan(value.ghostFloorPlan);
    if (!floorPlan || (value.ghostFloorPlan !== null && !ghostFloorPlan)) throw new Error('Invalid snapshot');
    return { floorPlan, ghostFloorPlan, ghostOpacity: Math.max(0, Math.min(1, Number(value.ghostOpacity) || 0.25)), traceImage: reviveTraceImage(value.traceImage) };
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function loadDesignSnapshot(storage: StorageLike): DesignSnapshot | null {
  const current = readSnapshot(storage, DESIGN_SNAPSHOT_KEY);
  if (current) return current;

  // v1 migration: shift coordinates from top-left-anchored to centered, then
  // re-save under the v2 key so the migration runs exactly once.
  const legacy = readSnapshot(storage, LEGACY_DESIGN_SNAPSHOT_KEY);
  if (!legacy) return null;

  const migrated: DesignSnapshot = {
    floorPlan: centerizeFloorPlan(legacy.floorPlan),
    ghostFloorPlan: legacy.ghostFloorPlan ? centerizeFloorPlan(legacy.ghostFloorPlan) : null,
    ghostOpacity: legacy.ghostOpacity,
    traceImage: legacy.traceImage,
  };
  saveDesignSnapshot(storage, migrated.floorPlan, migrated.ghostFloorPlan, migrated.ghostOpacity, migrated.traceImage);
  storage.removeItem(LEGACY_DESIGN_SNAPSHOT_KEY);
  return migrated;
}

export function clearDesignSnapshot(storage: StorageLike): void {
  storage.removeItem(DESIGN_SNAPSHOT_KEY);
  storage.removeItem(LEGACY_DESIGN_SNAPSHOT_KEY);
}
