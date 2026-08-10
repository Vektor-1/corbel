/**
 * Zustand store: single source of truth for floor plan state.
 * 2D editor and 3D renderer both subscribe to this.
 * Undo/redo via zundo wrapper.
 *
 * Design: all geometry edits go through actions that update canonical state.
 * Dirty tracking marks which elements changed since last render.
 */

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { Canonical, Source } from "../../types/schema";

// ============================================================================
// STORE STATE
// ============================================================================

export interface FloorPlanStoreState {
  // Canonical floor plan (source of truth)
  currentFloor: Canonical.Floor | null;
  library: Canonical.Library;

  // Trace-to-Learn state
  ghostFloor: Canonical.Floor | null; // frozen baseline (immutable)
  ghostOpacity: number; // 0.0–1.0, for rendering

  // Dirty tracking (what changed since last render)
  dirtyWallIds: Set<string>;
  dirtyRoomIds: Set<string>;
  dirtyOpeningIds: Set<string>;
  isDirtyGlobal: boolean; // any change at all

  // UI state
  selectedElementId: string | null;
  selectedElementKind: "wall" | "room" | "opening" | null;
  hoveredElementId: string | null;
  validationIssues: Canonical.ValidationResult[];

  // ========================================================================
  // ACTIONS: 2D EDITOR
  // ========================================================================

  /** Load a canonical floor plan into the editor. Clears undo/redo. */
  loadFloor: (floor: Canonical.Floor, lib: Canonical.Library) => void;

  /** Freeze current floor as ghost (for Trace-to-Learn). */
  freezeAsGhost: () => void;

  /** Draw a new wall from start to end. Auto-detects/updates rooms. */
  drawWall: (start: { x: number; y: number }, end: { x: number; y: number }, thickness?: number) => string; // returns wall ID

  /** Move wall by delta. Updates connected rooms. */
  moveWall: (wallId: string, delta: { x: number; y: number }) => void;

  /** Resize wall (extend/shorten). */
  resizeWall: (wallId: string, newStart: { x: number; y: number }, newEnd: { x: number; y: number }) => void;

  /** Delete wall. Cascades to openings on that wall. Updates/invalidates rooms. */
  deleteWall: (wallId: string) => void;

  /** Place a door or window on a wall. */
  placeOpening: (
    kind: "door" | "window",
    wallId: string,
    positionAlongWall: number,
    typeRef: string
  ) => string; // returns opening ID

  /** Move opening along its host wall. */
  moveOpening: (openingId: string, positionAlongWall: number) => void;

  /** Delete opening. */
  deleteOpening: (openingId: string) => void;

  /** Label or rename a room. */
  setRoomLabel: (roomId: string, label: string) => void;

  // ========================================================================
  // ACTIONS: SELECTION & VALIDATION
  // ========================================================================

  /** Select an element (wall, room, or opening). */
  selectElement: (elementId: string, kind: "wall" | "room" | "opening") => void;

  /** Deselect. */
  deselectElement: () => void;

  /** Set hovered element (for UI highlight). */
  setHoveredElement: (elementId: string | null) => void;

  /** Run validation on current floor, update issues list. */
  validateFloor: () => void;

  /** Clear dirty flags (after render). Called by 3D renderer post-frame. */
  clearDirty: () => void;

  // ========================================================================
  // QUERY HELPERS (read-only)
  // ========================================================================

  /** Get wall by ID. */
  getWall: (wallId: string) => Canonical.Wall | undefined;

  /** Get room by ID. */
  getRoom: (roomId: string) => Canonical.Room | undefined;

  /** Get opening by ID. */
  getOpening: (openingId: string) => Canonical.Opening | undefined;

  /** Get all walls bounding a room. */
  getRoomBoundingWalls: (roomId: string) => Canonical.Wall[];

  /** Get all openings on a wall. */
  getWallOpenings: (wallId: string) => Canonical.Opening[];
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const INITIAL_STATE: Omit<
  FloorPlanStoreState,
  keyof {
    [K in keyof FloorPlanStoreState as FloorPlanStoreState[K] extends (...args: any[]) => any
      ? K
      : never]: any;
  }
> = {
  currentFloor: null,
  library: {
    wallTypes: new Map([
      ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
      ["int-100", { id: "int-100", thickness: 100, material: "sandcrete", loadBearing: false }],
    ]),
    doorTypes: new Map([["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }]]),
    windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
  },
  ghostFloor: null,
  ghostOpacity: 0.3,
  dirtyWallIds: new Set(),
  dirtyRoomIds: new Set(),
  dirtyOpeningIds: new Set(),
  isDirtyGlobal: false,
  selectedElementId: null,
  selectedElementKind: null,
  hoveredElementId: null,
  validationIssues: [],
};

// ============================================================================
// STORE CREATION
// ============================================================================

export const useFloorPlanStore = create<FloorPlanStoreState>()(
  immer((set, get) => ({
    ...INITIAL_STATE,

    // ========================================================================
    // LOAD / FREEZE
    // ========================================================================

    loadFloor: (floor, lib) => {
      set((state) => {
        state.currentFloor = floor;
        state.library = lib;
        state.ghostFloor = null;
        state.dirtyWallIds.clear();
        state.dirtyRoomIds.clear();
        state.dirtyOpeningIds.clear();
        state.isDirtyGlobal = false;
      });
    },

    freezeAsGhost: () => {
      set((state) => {
        if (state.currentFloor) {
          // Deep copy current floor as ghost
          state.ghostFloor = JSON.parse(JSON.stringify(state.currentFloor));
        }
      });
    },

    // ========================================================================
    // WALL EDITING
    // ========================================================================

    drawWall: (start, end, thickness = 200) => {
      let newWallId = "";
      set((state) => {
        if (!state.currentFloor) return;

        const wall: Canonical.Wall = {
          id: `wall_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          start,
          end,
          typeRef: thickness > 150 ? "ext-200" : "int-100",
          openingIds: [],
          confidence: 1.0,
          source: Source.USER,
        };

        newWallId = wall.id;
        state.currentFloor.walls.push(wall);
        state.dirtyWallIds.add(wall.id);
        state.isDirtyGlobal = true;

        // Mark rooms dirty (topology may have changed)
        state.currentFloor.rooms.forEach((r: Canonical.Room) => state.dirtyRoomIds.add(r.id));
      });
      return newWallId;
    },

    moveWall: (wallId, delta) => {
      set((state) => {
        if (!state.currentFloor) return;

        const wall = state.currentFloor.walls.find((w: Canonical.Wall) => w.id === wallId);
        if (!wall) return;

        wall.start.x += delta.x;
        wall.start.y += delta.y;
        wall.end.x += delta.x;
        wall.end.y += delta.y;

        state.dirtyWallIds.add(wallId);
        state.isDirtyGlobal = true;

        // Mark rooms dirty (may have changed shape)
        const affectedRooms = state.currentFloor.rooms.filter((r: Canonical.Room) =>
          r.boundingWallIds.includes(wallId)
        );
        affectedRooms.forEach((r: Canonical.Room) => state.dirtyRoomIds.add(r.id));
      });
    },

    resizeWall: (wallId, newStart, newEnd) => {
      set((state) => {
        if (!state.currentFloor) return;

        const wall = state.currentFloor.walls.find((w: Canonical.Wall) => w.id === wallId);
        if (!wall) return;

        wall.start = newStart;
        wall.end = newEnd;

        state.dirtyWallIds.add(wallId);
        state.isDirtyGlobal = true;

        const affectedRooms = state.currentFloor.rooms.filter((r: Canonical.Room) =>
          r.boundingWallIds.includes(wallId)
        );
        affectedRooms.forEach((r: Canonical.Room) => state.dirtyRoomIds.add(r.id));
      });
    },

    deleteWall: (wallId) => {
      set((state) => {
        if (!state.currentFloor) return;

        // Remove wall
        state.currentFloor.walls = state.currentFloor.walls.filter((w: Canonical.Wall) => w.id !== wallId);

        // Remove openings on that wall
        const openingsToDelete = state.currentFloor.openings.filter((o: Canonical.Opening) => o.hostWallId === wallId);
        openingsToDelete.forEach((o: Canonical.Opening) => {
          state.currentFloor!.openings = state.currentFloor!.openings.filter((x: Canonical.Opening) => x.id !== o.id);
          state.dirtyOpeningIds.delete(o.id);
        });

        // Remove rooms that referenced this wall
        state.currentFloor.rooms = state.currentFloor.rooms.filter(
          (r: Canonical.Room) => !r.boundingWallIds.includes(wallId)
        );

        state.dirtyWallIds.delete(wallId);
        state.isDirtyGlobal = true;
      });
    },

    // ========================================================================
    // OPENING EDITING
    // ========================================================================

    placeOpening: (kind, wallId, positionAlongWall, typeRef) => {
      let newOpeningId = "";
      set((state) => {
        if (!state.currentFloor) return;

        const wall = state.currentFloor.walls.find((w: Canonical.Wall) => w.id === wallId);
        if (!wall) return;

        const opening: Canonical.Opening = {
          id: `opening_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          kind,
          typeRef,
          hostWallId: wallId,
          positionAlongWall,
          confidence: 1.0,
          source: Source.USER,
        };

        newOpeningId = opening.id;
        state.currentFloor.openings.push(opening);
        wall.openingIds.push(opening.id);

        state.dirtyOpeningIds.add(opening.id);
        state.dirtyWallIds.add(wallId);
        state.isDirtyGlobal = true;
      });
      return newOpeningId;
    },

    moveOpening: (openingId, positionAlongWall) => {
      set((state) => {
        if (!state.currentFloor) return;

        const opening = state.currentFloor.openings.find((o: Canonical.Opening) => o.id === openingId);
        if (!opening) return;

        opening.positionAlongWall = positionAlongWall;
        state.dirtyOpeningIds.add(openingId);
        state.isDirtyGlobal = true;
      });
    },

    deleteOpening: (openingId) => {
      set((state) => {
        if (!state.currentFloor) return;

        const opening = state.currentFloor.openings.find((o: Canonical.Opening) => o.id === openingId);
        if (!opening) return;

        const wall = state.currentFloor.walls.find((w: Canonical.Wall) => w.id === opening.hostWallId);
        if (wall) {
          wall.openingIds = wall.openingIds.filter((id: string) => id !== openingId);
          state.dirtyWallIds.add(wall.id);
        }

        state.currentFloor.openings = state.currentFloor.openings.filter((o: Canonical.Opening) => o.id !== openingId);
        state.dirtyOpeningIds.delete(openingId);
        state.isDirtyGlobal = true;
      });
    },

    // ========================================================================
    // ROOM EDITING
    // ========================================================================

    setRoomLabel: (roomId, label) => {
      set((state) => {
        if (!state.currentFloor) return;

        const room = state.currentFloor.rooms.find((r: Canonical.Room) => r.id === roomId);
        if (room) {
          room.label = label;
          state.dirtyRoomIds.add(roomId);
          state.isDirtyGlobal = true;
        }
      });
    },

    // ========================================================================
    // SELECTION & VALIDATION
    // ========================================================================

    selectElement: (elementId, kind) => {
      set((state) => {
        state.selectedElementId = elementId;
        state.selectedElementKind = kind;
      });
    },

    deselectElement: () => {
      set((state) => {
        state.selectedElementId = null;
        state.selectedElementKind = null;
      });
    },

    setHoveredElement: (elementId) => {
      set((state) => {
        state.hoveredElementId = elementId;
      });
    },

    validateFloor: () => {
      set((state) => {
        if (!state.currentFloor) return;

        const issues: Canonical.ValidationResult[] = [];

        // Example rules (would be a full rule engine in practice)
        state.currentFloor.rooms.forEach((room: Canonical.Room) => {
          // Rule: minimum room area 12 m² (12e6 mm²)
          if (room.area < 12e6) {
            issues.push({
              id: `issue_${room.id}`,
              ruleId: "min_room_area",
              severity: "warning",
              message: `Room ${room.label || room.id} is ${(room.area / 1e6).toFixed(1)} m², below minimum 12 m².`,
              standard: "GS 1207:2018, §3.2",
              elementIds: [room.id],
              remediation: "Expand room or merge with adjacent space.",
            });
          }
        });

        state.validationIssues = issues;
      });
    },

    clearDirty: () => {
      set((state) => {
        state.dirtyWallIds.clear();
        state.dirtyRoomIds.clear();
        state.dirtyOpeningIds.clear();
        state.isDirtyGlobal = false;
      });
    },

    // ========================================================================
    // QUERY HELPERS
    // ========================================================================

    getWall: (wallId) => {
      const state = get();
      return state.currentFloor?.walls.find((w) => w.id === wallId);
    },

    getRoom: (roomId) => {
      const state = get();
      return state.currentFloor?.rooms.find((r) => r.id === roomId);
    },

    getOpening: (openingId) => {
      const state = get();
      return state.currentFloor?.openings.find((o) => o.id === openingId);
    },

    getRoomBoundingWalls: (roomId) => {
      const state = get();
      const room = state.currentFloor?.rooms.find((r) => r.id === roomId);
      if (!room || !state.currentFloor) return [];

      return state.currentFloor.walls.filter((w) => room.boundingWallIds.includes(w.id));
    },

    getWallOpenings: (wallId) => {
      const state = get();
      const wall = state.currentFloor?.walls.find((w) => w.id === wallId);
      if (!wall || !state.currentFloor) return [];

      return state.currentFloor.openings.filter((o) => o.hostWallId === wallId);
    },
  }))
);

// ============================================================================
// HOOKS FOR COMPONENTS
// ============================================================================

/** Subscribe to current floor (for 2D editor). */
export const useCurrentFloor = () => useFloorPlanStore((state) => state.currentFloor);

/** Subscribe to dirty flags (for 3D renderer to know what to re-render). */
export const useDirtyFlags = () =>
  useFloorPlanStore((state) => ({
    dirtyWallIds: state.dirtyWallIds,
    dirtyRoomIds: state.dirtyRoomIds,
    dirtyOpeningIds: state.dirtyOpeningIds,
    isDirtyGlobal: state.isDirtyGlobal,
  }));

/** Subscribe to validation issues (for inspector panel). */
export const useValidationIssues = () => useFloorPlanStore((state) => state.validationIssues);

/** Subscribe to selection (for UI highlight). */
export const useSelection = () =>
  useFloorPlanStore((state) => ({
    selectedElementId: state.selectedElementId,
    selectedElementKind: state.selectedElementKind,
  }));
