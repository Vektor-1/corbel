import type { FloorPlan } from '@/types/design';

export function cloneFloorPlan(plan: FloorPlan): FloorPlan {
  return {
    ...plan,
    walls: plan.walls.map((wall) => ({
      ...wall,
      startPoint: { ...wall.startPoint },
      endPoint: { ...wall.endPoint },
    })),
    rooms: plan.rooms.map((room) => ({
      ...room,
      vertices: room.vertices.map((point) => ({ ...point })),
    })),
    doors: plan.doors.map((door) => ({ ...door, position: { ...door.position } })),
    windows: plan.windows.map((window) => ({ ...window, position: { ...window.position } })),
    objects: plan.objects.map((object) => ({ ...object, position: { ...object.position } })),
    createdAt: new Date(plan.createdAt),
    updatedAt: new Date(plan.updatedAt),
  };
}

export function createRedesignPlan(original: FloorPlan, now = new Date()): FloorPlan {
  return {
    id: `redesign-${original.id}`,
    name: `${original.name} Redesign`,
    width: original.width,
    height: original.height,
    scale: original.scale,
    walls: [],
    rooms: [],
    doors: [],
    windows: [],
    objects: [],
    createdAt: now,
    updatedAt: now,
  };
}
