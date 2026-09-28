import type { FloorPlan } from '@/types/design';
import type { PlanChatOperation } from './types';

/** Applies validated operations without touching Zustand, for previews and tests. */
export function applyPlanOperationsToFloorPlan(plan: FloorPlan, operations: PlanChatOperation[]): FloorPlan {
  const next: FloorPlan = {
    ...plan,
    walls: [...plan.walls],
    rooms: [...plan.rooms],
    doors: [...plan.doors],
    windows: [...plan.windows],
    objects: [...(plan.objects ?? [])],
    updatedAt: new Date(),
  };

  for (const operation of operations) {
    switch (operation.type) {
      case 'update-wall':
        next.walls = next.walls.map((wall) => wall.id === operation.id ? { ...wall, ...operation.updates, source: 'user' } : wall);
        break;
      case 'update-door':
        next.doors = next.doors.map((door) => door.id === operation.id ? { ...door, ...operation.updates, source: 'user' } : door);
        break;
      case 'update-window':
        next.windows = next.windows.map((window) => window.id === operation.id ? { ...window, ...operation.updates, source: 'user' } : window);
        break;
      case 'update-room':
        next.rooms = next.rooms.map((room) => room.id === operation.id ? { ...room, ...operation.updates } : room);
        break;
      case 'add-wall':
        if (!next.walls.some((wall) => wall.id === operation.wall.id)) next.walls.push({ ...operation.wall, source: 'user' });
        break;
      case 'add-door':
        if (!next.doors.some((door) => door.id === operation.door.id) && next.walls.some((wall) => wall.id === operation.door.wallId)) {
          next.doors.push({ ...operation.door, source: 'user' });
        }
        break;
      case 'add-window':
        if (!next.windows.some((window) => window.id === operation.window.id) && next.walls.some((wall) => wall.id === operation.window.wallId)) {
          next.windows.push({ ...operation.window, source: 'user' });
        }
        break;
      case 'set-scale':
        next.scale = operation.scale;
        break;
      case 'rename-plan':
        next.name = operation.name.trim();
        break;
      case 'delete-element':
        if (operation.element === 'wall') {
          next.walls = next.walls.filter((wall) => wall.id !== operation.id);
          next.doors = next.doors.filter((door) => door.wallId !== operation.id);
          next.windows = next.windows.filter((window) => window.wallId !== operation.id);
        } else if (operation.element === 'door') {
          next.doors = next.doors.filter((door) => door.id !== operation.id);
        } else if (operation.element === 'window') {
          next.windows = next.windows.filter((window) => window.id !== operation.id);
        } else {
          next.rooms = next.rooms.filter((room) => room.id !== operation.id);
        }
        break;
    }
  }

  return next;
}
