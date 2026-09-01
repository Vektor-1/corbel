import type { FloorPlan } from '@/types/design';
import type { TraceImageReference } from '@/store/designStore';
import type { StorageLike } from './floorPlanSnapshot';

export const DESIGN_SNAPSHOT_KEY = 'corbel:editor-design:v1';

export interface DesignSnapshot {
  floorPlan: FloorPlan;
  ghostFloorPlan: FloorPlan | null;
  ghostOpacity: number;
  traceImage: TraceImageReference | null;
}

type SerializedSnapshot = DesignSnapshot & { version: 1 };

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
  storage.setItem(DESIGN_SNAPSHOT_KEY, JSON.stringify({ version: 1, floorPlan, ghostFloorPlan, ghostOpacity, traceImage } satisfies SerializedSnapshot));
}

export function loadDesignSnapshot(storage: StorageLike): DesignSnapshot | null {
  const raw = storage.getItem(DESIGN_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SerializedSnapshot>;
    const floorPlan = revivePlan(value.floorPlan);
    const ghostFloorPlan = value.ghostFloorPlan === null ? null : revivePlan(value.ghostFloorPlan);
    if (value.version !== 1 || !floorPlan || (value.ghostFloorPlan !== null && !ghostFloorPlan)) throw new Error('Invalid snapshot');
    return { floorPlan, ghostFloorPlan, ghostOpacity: Math.max(0, Math.min(1, Number(value.ghostOpacity) || 0.25)), traceImage: reviveTraceImage(value.traceImage) };
  } catch {
    storage.removeItem(DESIGN_SNAPSHOT_KEY);
    return null;
  }
}

export function clearDesignSnapshot(storage: StorageLike): void {
  storage.removeItem(DESIGN_SNAPSHOT_KEY);
}
