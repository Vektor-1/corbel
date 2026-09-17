import { useDesignStore } from '@/store/designStore';
import type { Wall, Door, Window, Room, DesignObject, ValidationResult } from '@/types/design';

export interface CorbelAPI {
  // Read state
  getState: () => {
    walls: Wall[];
    doors: Door[];
    windows: Window[];
    rooms: Room[];
    objects: DesignObject[];
  };
  getValidationIssues: () => ValidationResult[];
  
  // Write state
  addWall: (wall: Wall) => void;
  updateWall: (id: string, wall: Partial<Wall>) => void;
  deleteWall: (id: string) => void;
  
  addDoor: (door: Door) => void;
  updateDoor: (id: string, door: Partial<Door>) => void;
  deleteDoor: (id: string) => void;
  
  addWindow: (window: Window) => void;
  updateWindow: (id: string, window: Partial<Window>) => void;
  deleteWindow: (id: string) => void;
  
  addRoom: (room: Room) => void;
  updateRoom: (id: string, room: Partial<Room>) => void;
  deleteRoom: (id: string) => void;
  
  clear: () => void;
}

export function initBrowserSDK() {
  if (typeof window === 'undefined') return;
  
  const api: CorbelAPI = {
    getState: () => {
      const { floorPlan } = useDesignStore.getState();
      if (!floorPlan) return { walls: [], doors: [], windows: [], rooms: [], objects: [] };
      return {
        walls: floorPlan.walls,
        doors: floorPlan.doors,
        windows: floorPlan.windows,
        rooms: floorPlan.rooms,
        objects: floorPlan.objects,
      };
    },
    getValidationIssues: () => {
      return useDesignStore.getState().validationResults;
    },
    addWall: (wall: Wall) => useDesignStore.getState().addWall(wall),
    updateWall: (id: string, wall: Partial<Wall>) => useDesignStore.getState().updateWall(id, wall),
    deleteWall: (id: string) => useDesignStore.getState().deleteWall(id),
    
    addDoor: (door: Door) => useDesignStore.getState().addDoor(door),
    updateDoor: (id: string, door: Partial<Door>) => useDesignStore.getState().updateDoor(id, door),
    deleteDoor: (id: string) => useDesignStore.getState().deleteDoor(id),
    
    addWindow: (window: Window) => useDesignStore.getState().addWindow(window),
    updateWindow: (id: string, window: Partial<Window>) => useDesignStore.getState().updateWindow(id, window),
    deleteWindow: (id: string) => useDesignStore.getState().deleteWindow(id),
    
    addRoom: (room: Room) => useDesignStore.getState().addRoom(room),
    updateRoom: (id: string, room: Partial<Room>) => useDesignStore.getState().updateRoom(id, room),
    deleteRoom: (id: string) => useDesignStore.getState().deleteRoom(id),
    
    clear: () => useDesignStore.getState().clearDesign(),
  };

  (window as any).CorbelAPI = api;
  console.log('[Corbel] AI Browser SDK initialized on window.CorbelAPI');
}