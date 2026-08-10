import { create } from 'zustand';
import { temporal } from 'zundo';
import type { DesignObject, FloorPlan, Wall, Room, Door, Window, ValidationResult } from '@/types/design';
import { insertWallWithIntersections, rehostWallOpening } from '@/lib/geometry/wall-intersections';
import { cloneFloorPlan, createRedesignPlan } from '@/lib/redesign';

interface DesignState {
  // Current floor plan
  floorPlan: FloorPlan | null;
  validationResults: ValidationResult[];

  // Ghost underlay (original import for Trace-to-Learn compare)
  ghostFloorPlan: FloorPlan | null;
  ghostOpacity: number;

  // UI state
  selectedElementId: string | null;
  currentTool: 'select' | 'wall' | 'object' | 'room' | 'door' | 'window' | 'delete';
  viewMode: '2d' | '3d' | 'split';

  // Actions
  setFloorPlan: (floorPlan: FloorPlan) => void;
  applyImportedFloorPlan: (floorPlan: FloorPlan) => void;
  beginRedesign: (floorPlan: FloorPlan) => void;
  setGhostFloorPlan: (floorPlan: FloorPlan | null) => void;
  setGhostOpacity: (opacity: number) => void;
  setValidationResults: (results: ValidationResult[]) => void;
  setSelectedElement: (id: string | null) => void;
  setCurrentTool: (tool: DesignState['currentTool']) => void;
  setViewMode: (mode: DesignState['viewMode']) => void;

  // Editing actions (all trigger history)
  addWall: (wall: Wall) => void;
  updateWall: (id: string, wall: Partial<Wall>) => void;
  deleteWall: (id: string) => void;

  setRooms: (rooms: Room[]) => void;
  addRoom: (room: Room) => void;
  updateRoom: (id: string, room: Partial<Room>) => void;
  deleteRoom: (id: string) => void;

  addDoor: (door: Door) => void;
  updateDoor: (id: string, door: Partial<Door>) => void;
  deleteDoor: (id: string) => void;

  addWindow: (window: Window) => void;
  updateWindow: (id: string, window: Partial<Window>) => void;
  deleteWindow: (id: string) => void;

  addObject: (object: DesignObject) => void;
  updateObject: (id: string, object: Partial<DesignObject>) => void;
  deleteObject: (id: string) => void;

  // Metadata
  setFloorPlanName: (name: string) => void;
}

export const useDesignStore = create<DesignState>(
  temporal((set: any) => ({
      floorPlan: null,
      validationResults: [],
      ghostFloorPlan: null,
      ghostOpacity: 0.25,
      selectedElementId: null,
      currentTool: 'select',
      viewMode: '2d',

      setFloorPlan: (floorPlan: FloorPlan) => set({ floorPlan }),
      applyImportedFloorPlan: (floorPlan: FloorPlan) =>
        set({
          floorPlan,
          ghostFloorPlan: null,
          selectedElementId: null,
          currentTool: 'select',
          viewMode: '2d',
          validationResults: [],
        }),
      beginRedesign: (floorPlan: FloorPlan) => {
        const original = cloneFloorPlan(floorPlan);
        set({
          ghostFloorPlan: original,
          ghostOpacity: 0.25,
          floorPlan: createRedesignPlan(original),
          selectedElementId: null,
          currentTool: 'wall',
          viewMode: '2d',
          validationResults: [],
        });
      },
      setGhostFloorPlan: (floorPlan: FloorPlan | null) =>
        set({ ghostFloorPlan: floorPlan ? cloneFloorPlan(floorPlan) : null }),
      setGhostOpacity: (opacity: number) =>
        set({ ghostOpacity: Math.max(0, Math.min(1, opacity)) }),
      setValidationResults: (results: ValidationResult[]) => set({ validationResults: results }),
      setSelectedElement: (id: string | null) => set({ selectedElementId: id }),
      setCurrentTool: (tool: DesignState['currentTool']) => set({ currentTool: tool }),
      setViewMode: (mode: DesignState['viewMode']) => set({ viewMode: mode }),

      addWall: (wall: Wall) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          const previousWalls = state.floorPlan.walls;
          const nextWalls = insertWallWithIntersections(previousWalls, wall);
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: nextWalls,
              doors: state.floorPlan.doors.map((door) => rehostWallOpening(door, previousWalls, nextWalls)),
              windows: state.floorPlan.windows.map((window) =>
                rehostWallOpening(window, previousWalls, nextWalls)
              ),
            },
          };
        }),

      updateWall: (id: string, updates: Partial<Wall>) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: state.floorPlan.walls.map((w) => (w.id === id ? { ...w, ...updates } : w)),
            },
          };
        }),

      deleteWall: (id: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: state.floorPlan.walls.filter((w) => w.id !== id),
              doors: state.floorPlan.doors.filter((door) => door.wallId !== id),
              windows: state.floorPlan.windows.filter((window) => window.wallId !== id),
            },
          };
        }),

      setRooms: (rooms: Room[]) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              rooms,
            },
          };
        }),

      addRoom: (room: Room) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              rooms: [...state.floorPlan.rooms, room],
            },
          };
        }),

      updateRoom: (id: string, updates: Partial<Room>) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              rooms: state.floorPlan.rooms.map((r) => (r.id === id ? { ...r, ...updates } : r)),
            },
          };
        }),

      deleteRoom: (id: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              rooms: state.floorPlan.rooms.filter((r) => r.id !== id),
            },
          };
        }),

      addDoor: (door: Door) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              doors: [...state.floorPlan.doors, door],
            },
          };
        }),

      updateDoor: (id: string, updates: Partial<Door>) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              doors: state.floorPlan.doors.map((door) => (door.id === id ? { ...door, ...updates } : door)),
            },
          };
        }),

      deleteDoor: (id: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              doors: state.floorPlan.doors.filter((d) => d.id !== id),
            },
          };
        }),

      addWindow: (window: Window) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              windows: [...state.floorPlan.windows, window],
            },
          };
        }),

      updateWindow: (id: string, updates: Partial<Window>) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              windows: state.floorPlan.windows.map((window) =>
                window.id === id ? { ...window, ...updates } : window
              ),
            },
          };
        }),

      deleteWindow: (id: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              windows: state.floorPlan.windows.filter((w) => w.id !== id),
            },
          };
        }),

      addObject: (object: DesignObject) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              objects: [...(state.floorPlan.objects ?? []), object],
            },
          };
        }),

      updateObject: (id: string, updates: Partial<DesignObject>) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              objects: (state.floorPlan.objects ?? []).map((object) =>
                object.id === id ? { ...object, ...updates } : object
              ),
            },
          };
        }),

      deleteObject: (id: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              objects: (state.floorPlan.objects ?? []).filter((object) => object.id !== id),
            },
          };
        }),

      setFloorPlanName: (name: string) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              name,
            },
          };
        }),
    }),
    {
      limit: 30,
      partialize: (state) => ({
        floorPlan: state.floorPlan,
        selectedElementId: state.selectedElementId,
        currentTool: state.currentTool,
        viewMode: state.viewMode,
        // ghostFloorPlan and ghostOpacity intentionally excluded from undo history
      }),
    } as const
  ) as any
);
