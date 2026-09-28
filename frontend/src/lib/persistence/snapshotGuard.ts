import type { FloorPlan } from '@/types/design';

export function geometryCount(plan: FloorPlan): number {
  return plan.walls.length + plan.rooms.length + plan.doors.length + plan.windows.length + plan.objects.length;
}

/** Blocks an accidental transient wipe while retaining intentional clear actions in memory. */
export function isSuspiciousSnapshotWipe(previous: FloorPlan | null, next: FloorPlan): boolean {
  return previous !== null && geometryCount(previous) > 4 && geometryCount(next) === 0;
}
