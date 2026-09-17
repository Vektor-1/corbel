import { create } from 'zustand';
import { temporal } from 'zundo';
import type { DesignObject, ElementGroup, FloorPlan, Point, Wall, Room, Door, Window, ValidationResult, TraceCalibration } from '@/types/design';
import { pixelsPerMeter } from '@/lib/geometry/scale';
import { insertWallWithIntersections, rehostWallOpening } from '@/lib/geometry/wall-intersections';
import { cloneFloorPlan, createRedesignPlan } from '@/lib/redesign';
import { getAllSelectableIds } from '@/lib/geometry/groups';

export interface TraceImageReference {
  url: string;
  scale: number;
  opacity: number;
  blur: number;
  calibration?: TraceCalibration;
}

interface DesignState {
  // Current floor plan
  floorPlan: FloorPlan | null;
  validationResults: ValidationResult[];

  // Ghost underlay (original import for Trace-to-Learn compare)
  ghostFloorPlan: FloorPlan | null;
  ghostOpacity: number;
  traceImage: TraceImageReference | null;

  /** Backend inference job id for the current import, when it came through
   * the self-hosted ML backend path. Null for hosted-LLM imports or once the
   * user starts a new design. Read by the corrections-submit action to know
   * which job to attach a correction to. */
  lastImportJobId: string | null;
  setLastImportJobId: (jobId: string | null) => void;

  // UI state
  selectedElementId: string | null;
  /** Full multi-selection. `selectedElementId` mirrors its first entry for single-select consumers. */
  selectedElementIds: string[];
  currentTool: 'select' | 'wall' | 'object' | 'room' | 'door' | 'window' | 'delete' | 'scale';
  viewMode: '2d' | '3d' | 'split';

  // Actions
  setFloorPlan: (floorPlan: FloorPlan) => void;
  clearDesign: () => void;
  applyImportedFloorPlan: (floorPlan: FloorPlan) => void;
  beginImportedEdit: (floorPlan: FloorPlan) => void;
  beginRedesign: (floorPlan: FloorPlan) => void;
  beginImageTrace: (imageUrl: string, fileName: string) => void;
  restoreGhostBaseline: () => void;
  setGhostFloorPlan: (floorPlan: FloorPlan | null) => void;
  setGhostOpacity: (opacity: number) => void;
  setTraceImage: (reference: TraceImageReference | null) => void;
  updateTraceImage: (updates: Partial<Omit<TraceImageReference, 'url'>>) => void;
  calibrateTraceFromWall: (wallId: string, knownLengthMm: number) => boolean;
  setValidationResults: (results: ValidationResult[]) => void;
  setSelectedElement: (id: string | null) => void;
  setCurrentTool: (tool: DesignState['currentTool']) => void;
  setViewMode: (mode: DesignState['viewMode']) => void;

  // Multi-selection
  setSelection: (ids: string[]) => void;
  toggleSelectionGroup: (ids: string[]) => void;
  selectAll: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;

  // Grouping ("join elements together as one object")
  groupElements: (ids: string[]) => void;
  ungroupElements: (ids: string[]) => void;

  // Bulk geometry transforms for multi-selection / groups
  translateElements: (ids: string[], dx: number, dy: number) => void;
  scaleElements: (ids: string[], factor: number, pivot: Point) => void;

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
      traceImage: null,
      selectedElementId: null,
      selectedElementIds: [],
      currentTool: 'select',
      viewMode: '2d',
      lastImportJobId: null,

      setFloorPlan: (floorPlan: FloorPlan) => set({ floorPlan }),
      setLastImportJobId: (jobId: string | null) => set({ lastImportJobId: jobId }),
      clearDesign: () =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: [],
              rooms: [],
              doors: [],
              windows: [],
              objects: [],
              updatedAt: new Date(),
            },
            ghostFloorPlan: null,
            ghostOpacity: 0.25,
            traceImage: null,
            selectedElementId: null,
            selectedElementIds: [],
            currentTool: 'select',
            validationResults: [],
            lastImportJobId: null,
          };
        }),
      applyImportedFloorPlan: (floorPlan: FloorPlan) =>
        set({
          floorPlan,
          ghostFloorPlan: null,
          traceImage: null,
          selectedElementId: null,
          selectedElementIds: [],
          currentTool: 'select',
          viewMode: '2d',
          validationResults: [],
        }),
      beginImportedEdit: (floorPlan: FloorPlan) => {
        const baseline = cloneFloorPlan(floorPlan);
        const editable = cloneFloorPlan(floorPlan);
        editable.id = `edit-${baseline.id}`;
        editable.name = `${baseline.name} · editable copy`;
        editable.updatedAt = new Date();
        set({
          floorPlan: editable,
          ghostFloorPlan: baseline,
          ghostOpacity: 0.18,
          traceImage: null,
          selectedElementId: null,
          selectedElementIds: [],
          currentTool: 'select',
          viewMode: '2d',
          validationResults: [],
          lastImportJobId: null,
        });
      },
      beginRedesign: (floorPlan: FloorPlan) => {
        const original = cloneFloorPlan(floorPlan);
        set({
          ghostFloorPlan: original,
          ghostOpacity: 0.25,
          traceImage: null,
          floorPlan: createRedesignPlan(original),
          selectedElementId: null,
          selectedElementIds: [],
          currentTool: 'wall',
          viewMode: '2d',
          validationResults: [],
        });
      },
      beginImageTrace: (imageUrl: string, fileName: string) => {
        const now = new Date();
        const name = fileName.replace(/\.[^.]+$/, '').trim() || 'Reference plan';
        set({
          floorPlan: {
            id: `trace-${crypto.randomUUID()}`,
            name: `${name} · trace study`,
            width: 12000,
            height: 9000,
            scale: 100,
            walls: [],
            rooms: [],
            doors: [],
            windows: [],
            objects: [],
            createdAt: now,
            updatedAt: now,
          },
          ghostFloorPlan: null,
          ghostOpacity: 0.25,
          traceImage: { url: imageUrl, scale: 0.7, opacity: 0.58, blur: 2 },
          selectedElementId: null,
          selectedElementIds: [],
          currentTool: 'wall',
          viewMode: '2d',
          validationResults: [],
        });
      },
      restoreGhostBaseline: () =>
        set((state: DesignState) => {
          if (!state.ghostFloorPlan || !state.floorPlan) return state;
          const restored = cloneFloorPlan(state.ghostFloorPlan);
          restored.id = state.floorPlan.id;
          restored.name = `${state.ghostFloorPlan.name} · editable copy`;
          restored.updatedAt = new Date();
          return {
            floorPlan: restored,
            selectedElementId: null,
            selectedElementIds: [],
            currentTool: 'select',
            validationResults: [],
          };
        }),
      setGhostFloorPlan: (floorPlan: FloorPlan | null) =>
        set({ ghostFloorPlan: floorPlan ? cloneFloorPlan(floorPlan) : null }),
      setGhostOpacity: (opacity: number) =>
        set({ ghostOpacity: Math.max(0, Math.min(1, opacity)) }),
      setTraceImage: (traceImage: TraceImageReference | null) => set({ traceImage }),
      updateTraceImage: (updates: Partial<Omit<TraceImageReference, 'url'>>) =>
        set((state: DesignState) => {
          if (!state.traceImage) return state;
          return {
            traceImage: {
              ...state.traceImage,
              ...updates,
              scale: Math.max(0.1, Math.min(3, updates.scale ?? state.traceImage.scale)),
              opacity: Math.max(0, Math.min(1, updates.opacity ?? state.traceImage.opacity)),
              blur: Math.max(0, Math.min(20, updates.blur ?? state.traceImage.blur)),
            },
          };
        }),
      calibrateTraceFromWall: (wallId: string, knownLengthMm: number) => {
        let calibrated = false;
        set((state: DesignState) => {
          const wall = state.floorPlan?.walls.find((candidate) => candidate.id === wallId);
          if (!state.floorPlan || !state.traceImage || !wall || !Number.isFinite(knownLengthMm) || knownLengthMm <= 0) return state;
          const wallPixels = Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y);
          const nextPixelsPerMeter = wallPixels / (knownLengthMm / 1_000);
          if (!Number.isFinite(nextPixelsPerMeter) || nextPixelsPerMeter < 20 || nextPixelsPerMeter > 2_000) return state;
          calibrated = true;
          return {
            floorPlan: { ...state.floorPlan, scale: pixelsPerMeter(nextPixelsPerMeter), updatedAt: new Date() },
            traceImage: {
              ...state.traceImage,
              calibration: { wallId, knownLengthMm, pixelsPerMeter: nextPixelsPerMeter, calibratedAt: new Date().toISOString() },
            },
          };
        });
        return calibrated;
      },
      setValidationResults: (results: ValidationResult[]) => set({ validationResults: results }),
      setSelectedElement: (id: string | null) =>
        set({ selectedElementId: id, selectedElementIds: id ? [id] : [] }),
      setCurrentTool: (tool: DesignState['currentTool']) => set({ currentTool: tool }),
      setViewMode: (mode: DesignState['viewMode']) => set({ viewMode: mode }),

      setSelection: (ids: string[]) =>
        set({ selectedElementIds: ids, selectedElementId: ids[0] ?? null }),

      toggleSelectionGroup: (ids: string[]) =>
        set((state: DesignState) => {
          if (ids.length === 0) return state;
          const allSelected = ids.every((id) => state.selectedElementIds.includes(id));
          const next = allSelected
            ? state.selectedElementIds.filter((id) => !ids.includes(id))
            : Array.from(new Set([...state.selectedElementIds, ...ids]));
          return { selectedElementIds: next, selectedElementId: next[0] ?? null };
        }),

      selectAll: () =>
        set((state: DesignState) => {
          const ids = getAllSelectableIds(state.floorPlan);
          return { selectedElementIds: ids, selectedElementId: ids[0] ?? null };
        }),

      clearSelection: () => set({ selectedElementIds: [], selectedElementId: null }),

      deleteSelection: () =>
        set((state: DesignState) => {
          if (!state.floorPlan || state.selectedElementIds.length === 0) return state;
          const idSet = new Set(state.selectedElementIds);
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: state.floorPlan.walls.filter((w) => !idSet.has(w.id)),
              rooms: state.floorPlan.rooms.filter((r) => !idSet.has(r.id)),
              doors: state.floorPlan.doors.filter((d) => !idSet.has(d.id) && !idSet.has(d.wallId)),
              windows: state.floorPlan.windows.filter((w) => !idSet.has(w.id) && !idSet.has(w.wallId)),
              objects: (state.floorPlan.objects ?? []).filter((o) => !idSet.has(o.id)),
              groups: (state.floorPlan.groups ?? []).filter((g) => !g.memberIds.some((m) => idSet.has(m))),
            },
            selectedElementIds: [],
            selectedElementId: null,
          };
        }),

      groupElements: (ids: string[]) =>
        set((state: DesignState) => {
          if (!state.floorPlan || ids.length < 2) return state;
          // A member belongs to at most one group; regrouping lifts it out of any prior group.
          const survivingGroups = (state.floorPlan.groups ?? []).filter(
            (g) => !g.memberIds.some((m) => ids.includes(m))
          );
          const newGroup: ElementGroup = { id: `group-${crypto.randomUUID()}`, memberIds: [...ids] };
          return {
            floorPlan: { ...state.floorPlan, groups: [...survivingGroups, newGroup] },
            selectedElementIds: ids,
            selectedElementId: ids[0] ?? null,
          };
        }),

      ungroupElements: (ids: string[]) =>
        set((state: DesignState) => {
          if (!state.floorPlan) return state;
          const groups = (state.floorPlan.groups ?? []).filter(
            (g) => !g.memberIds.some((m) => ids.includes(m))
          );
          return { floorPlan: { ...state.floorPlan, groups } };
        }),

      translateElements: (ids: string[], dx: number, dy: number) =>
        set((state: DesignState) => {
          if (!state.floorPlan || ids.length === 0 || (dx === 0 && dy === 0)) return state;
          const idSet = new Set(ids);
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: state.floorPlan.walls.map((w) =>
                idSet.has(w.id)
                  ? {
                      ...w,
                      startPoint: { x: w.startPoint.x + dx, y: w.startPoint.y + dy },
                      endPoint: { x: w.endPoint.x + dx, y: w.endPoint.y + dy },
                    }
                  : w
              ),
              rooms: state.floorPlan.rooms.map((r) =>
                idSet.has(r.id)
                  ? { ...r, vertices: r.vertices.map((v) => ({ x: v.x + dx, y: v.y + dy })) }
                  : r
              ),
              objects: (state.floorPlan.objects ?? []).map((o) =>
                idSet.has(o.id)
                  ? { ...o, position: { x: o.position.x + dx, y: o.position.y + dy } }
                  : o
              ),
            },
          };
        }),

      scaleElements: (ids: string[], factor: number, pivot: Point) =>
        set((state: DesignState) => {
          if (!state.floorPlan || ids.length === 0 || !Number.isFinite(factor) || factor <= 0) return state;
          const idSet = new Set(ids);
          const scalePoint = (p: Point): Point => ({
            x: pivot.x + (p.x - pivot.x) * factor,
            y: pivot.y + (p.y - pivot.y) * factor,
          });
          // Doors/windows follow their host wall's new length even when only the wall
          // (not the opening itself) is part of the scaled selection.
          const scaledWallIds = new Set(state.floorPlan.walls.filter((w) => idSet.has(w.id)).map((w) => w.id));
          return {
            floorPlan: {
              ...state.floorPlan,
              walls: state.floorPlan.walls.map((w) =>
                idSet.has(w.id)
                  ? { ...w, startPoint: scalePoint(w.startPoint), endPoint: scalePoint(w.endPoint) }
                  : w
              ),
              rooms: state.floorPlan.rooms.map((r) =>
                idSet.has(r.id) ? { ...r, vertices: r.vertices.map(scalePoint) } : r
              ),
              objects: (state.floorPlan.objects ?? []).map((o) =>
                idSet.has(o.id)
                  ? { ...o, position: scalePoint(o.position), scale: o.scale * factor }
                  : o
              ),
              doors: state.floorPlan.doors.map((d) =>
                scaledWallIds.has(d.wallId) ? { ...d, position: { ...d.position, x: d.position.x * factor } } : d
              ),
              windows: state.floorPlan.windows.map((w) =>
                scaledWallIds.has(w.wallId) ? { ...w, position: { ...w.position, x: w.position.x * factor } } : w
              ),
            },
          };
        }),

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
        selectedElementIds: state.selectedElementIds,
        currentTool: state.currentTool,
        viewMode: state.viewMode,
        // ghostFloorPlan and ghostOpacity intentionally excluded from undo history
      }),
      equality: (past: any, current: any) => {
        // Avoid creating duplicate history entries on rapid, micro-delta writes
        // (e.g., Konva drag events firing 60x per second).
        if (!past?.floorPlan || !current?.floorPlan) return past?.floorPlan === current?.floorPlan;

        // Quick structural checks first
        if (
          past.floorPlan.walls.length !== current.floorPlan.walls.length ||
          past.floorPlan.doors.length !== current.floorPlan.doors.length ||
          past.floorPlan.windows.length !== current.floorPlan.windows.length ||
          past.floorPlan.rooms.length !== current.floorPlan.rooms.length ||
          (past.floorPlan.groups?.length ?? 0) !== (current.floorPlan.groups?.length ?? 0) ||
          past.selectedElementId !== current.selectedElementId ||
          (past.selectedElementIds?.join(',') ?? '') !== (current.selectedElementIds?.join(',') ?? '') ||
          past.currentTool !== current.currentTool ||
          past.viewMode !== current.viewMode
        ) {
          return false;
        }

        // If structures match, treat as equivalent for undo purposes
        return true;
      },
    } as const
  ) as any
);
