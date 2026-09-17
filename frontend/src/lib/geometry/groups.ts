// Group membership lookups shared by selection, drag, and scale logic.

import type { FloorPlan } from '@/types/design';

/** All element ids in the plan that can be selected/grouped (walls, rooms, doors, windows, objects). */
export function getAllSelectableIds(floorPlan: FloorPlan | null): string[] {
  if (!floorPlan) return [];
  return [
    ...floorPlan.walls.map((w) => w.id),
    ...floorPlan.rooms.map((r) => r.id),
    ...floorPlan.doors.map((d) => d.id),
    ...floorPlan.windows.map((w) => w.id),
    ...(floorPlan.objects ?? []).map((o) => o.id),
  ];
}

/** The full member list of the group containing `id`, or `[id]` if it isn't grouped. */
export function getGroupMemberIds(floorPlan: FloorPlan | null, id: string): string[] {
  const group = floorPlan?.groups?.find((g) => g.memberIds.includes(id));
  return group ? group.memberIds : [id];
}

/**
 * Expand a set of clicked/boxed ids to include every member of any group they
 * touch, so selecting one grouped element always selects the whole group.
 */
export function expandGroupSelection(floorPlan: FloorPlan | null, ids: string[]): string[] {
  if (!floorPlan?.groups?.length) return ids;
  const result = new Set<string>();
  for (const id of ids) {
    for (const memberId of getGroupMemberIds(floorPlan, id)) result.add(memberId);
  }
  return Array.from(result);
}
