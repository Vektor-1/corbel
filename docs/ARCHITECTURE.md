# Corbel Architecture: Two-Tier JSON Schema & Dirty-Tracked Rendering

## Overview

Corbel's rendering pipeline operates on a two-tier JSON schema and single source of truth (Zustand store with dirty tracking). This document describes how AI-generated geometry becomes validated, topology-complete, and synchronized between 2D and 3D views without desync or render waste.

## Two-Tier Schema

### Tier 1: Draft (Loose, Confidence-Tagged)

Output from YOLOv8 + Gemini OCR + heuristic refinement. Contains:
- **Walls**: detected bounding boxes, may be fragmented or mis-aligned, confidence score per element
- **Openings**: detected door/window boxes (no host wall reference yet)
- **Labels**: OCR-extracted text (room names, dimensions)
- **Scale**: calibration result from dimension text (pixels-per-metre)
- **Warnings**: confidence-based flags for low-confidence detections

**Key property**: every element tracks `source` (AI, user, refined) and allows user override (e.g., `overrideThickness`, `overrideConfidence`).

### Tier 2: Canonical (Topology-Complete, Authoritative)

Output from lift algorithm. Input to 2D/3D renderers, validation engine, comparison engine.

**Structure**:
- **Library**: wall types, door types, window types defined once, referenced by ID
  - Walls: `{ id, thickness, material, loadBearing, fireRating?, uValue? }`
  - Doors: `{ id, width, height, swing, material?, fireRating? }`
  - Windows: `{ id, width, height, sillHeight, glazing? }`
- **Walls**: axis-snapped, junctions closed, topologically valid
  - `{ id, start, end, typeRef, openingIds[], draftSourceId?, confidence, source }`
- **Openings**: attached to host walls, positioned along wall
  - `{ id, kind, typeRef, hostWallId, positionAlongWall, draftSourceId?, confidence, source }`
- **Rooms**: closed polygons, derived from wall topology
  - `{ id, label?, boundingWallIds[], vertices[], area, confidence, source }`

**Key property**: bidirectional links (walls know what sits on them, openings know their host, rooms know their bounding walls). This enables validation and comparison without graph traversal.

## Lift Algorithm: Draft → Canonical

**Eight-step transformation**:

1. **Axis-snap walls** (100mm grid, 50mm tolerance)
   - Round wall endpoints to nearest grid point
   - Catches small misalignments from detection

2. **Close junctions** (150mm tolerance)
   - Connect walls whose endpoints are within gap tolerance
   - Detect and merge collinear segments (walls on same infinite line)
   - Core step for "nearly-touching walls that should connect"

3. **Collapse overlaps**
   - Remove duplicate walls (same segment, forward or reversed)
   - Deduplicates redundant detection outputs

4. **Detect closed loops**
   - Build graph of wall endpoints
   - DFS to find all cycles
   - Each cycle is a candidate room
   - Filter out walls shorter than 300mm

5. **Attach openings**
   - Project each opening onto all walls
   - Snap to nearest within 200mm
   - Store position as distance along wall (allows repositioning without re-projection)

6. **Resolve library types**
   - Map wall thickness → WallType (e.g., 200mm → `ext-200`)
   - Map door/window size → DoorType/WindowType
   - Keeps canonical JSON compact (definitions once, referenced by ID)

7. **Build canonical structures**
   - Convert draft walls/openings to canonical with bidirectional links
   - Extract room polygons from cycles using shoelace formula
   - Compute room area (filter out < 5 m²)

8. **Validate topology**
   - Room area ≥ 5 m²
   - Rooms are closed (all bounding walls form loop)
   - Openings attached to valid host walls
   - No orphaned elements

**Configuration**:
```typescript
{
  gridSnapTolerance: 50,        // mm
  minWallLength: 300,           // mm
  maxGapToClose: 150,           // mm
  minRoomArea: 5e6,             // mm² (5 m²)
  openingSnapDistance: 200,     // mm
}
```

## Zustand Store: Single Source of Truth

**State**:
```typescript
{
  currentFloor: Canonical.Floor | null
  library: Canonical.Library
  ghostFloor: Canonical.Floor | null        // frozen baseline (Trace-to-Learn)
  ghostOpacity: number                       // 0.0–1.0 for rendering
  
  // Dirty tracking
  dirtyWallIds: Set<string>
  dirtyRoomIds: Set<string>
  dirtyOpeningIds: Set<string>
  isDirtyGlobal: boolean
  
  // UI
  selectedElementId: string | null
  selectedElementKind: 'wall' | 'room' | 'opening' | null
  hoveredElementId: string | null
  validationIssues: Canonical.ValidationResult[]
}
```

**Edit Actions** (2D editor calls these):
- `drawWall(start, end, thickness)` → creates wall, marks wall + rooms dirty
- `moveWall(wallId, delta)` → updates wall position, marks wall + rooms dirty
- `resizeWall(wallId, newStart, newEnd)` → extends/shortens wall
- `deleteWall(wallId)` → cascades to openings, invalidates rooms
- `placeOpening(kind, wallId, positionAlongWall, typeRef)` → adds door/window
- `moveOpening(openingId, positionAlongWall)` → repositions along wall
- `deleteOpening(openingId)` → removes opening
- `setRoomLabel(roomId, label)` → labels room
- `validateFloor()` → runs validation rule engine, updates issues
- `clearDirty()` → called by 3D renderer post-frame

**Query Helpers** (read-only):
- `getWall(wallId)`, `getRoom(roomId)`, `getOpening(openingId)`
- `getRoomBoundingWalls(roomId)`
- `getWallOpenings(wallId)`

**Hooks**:
- `useCurrentFloor()` → subscribe to current floor
- `useDirtyFlags()` → subscribe to dirty tracking
- `useValidationIssues()` → subscribe to validation results
- `useSelection()` → subscribe to selected element

## 2D Editor (Konva.js)

**Rendering**:
- Grid background (100mm cells)
- Walls as lines (snapped endpoints)
- Rooms as filled polygons
- Openings as circles on walls
- Selection highlights (green)

**Interactions**:
- Click + drag to draw wall (snapped to grid)
- Click wall to select (highlights in 2D and 3D)
- Right-click wall to delete
- Drag wall endpoint to resize
- Double-click room to label

**Data flow**:
```
User input (click/drag)
    ↓
Konva event handler
    ↓
Store action (drawWall, moveWall, etc.)
    ↓
Zustand state update + dirty flags set
    ↓
2D re-renders (Konva uses new state)
3D detects isDirtyGlobal, recreates dirty meshes
```

## 3D Renderer (React Three Fiber)

**On-Demand Rendering**:
- Canvas configured `frameloop="demand"` (no continuous render loop)
- Only renders when state changes or user interacts
- Saves battery on student devices

**Dirty Tracking**:
```typescript
const { dirtyWallIds, dirtyRoomIds, dirtyOpeningIds, isDirtyGlobal } = useDirtyFlags()

// In useFrame callback:
if (isDirtyGlobal) {
  // Recreate geometry for walls in dirtyWallIds
  // Recreate rooms in dirtyRoomIds
  // Recreate openings in dirtyOpeningIds
  clearDirty() // Stop re-rendering until next change
}
```

**Mesh Components**:
- **WallMesh**: box geometry (wall endpoints → length, thickness → width, floorHeight → z-extrusion)
- **OpeningMesh**: projected onto host wall, positioned by `positionAlongWall`
- **RoomMesh**: polygon extruded to z=0 (floor surface)

**Selection Highlighting**:
- Selected wall renders in green (#00ff00)
- Selected room floor renders in yellow

## Synchronization Guarantee

**Single Source of Truth**:
- All geometry lives in `currentFloor` (Canonical.Floor)
- Both 2D and 3D read from same state
- No parallel models, no desync

**Example**: User moves wall in 2D
```
1. Konva click+drag handler calls moveWall(wallId, delta)
2. Zustand updates wall.start, wall.end; marks wallId dirty
3. 2D automatically re-renders (Konva subscribes to state)
4. 3D detects isDirtyGlobal=true in next frame
5. 3D recreates WallMesh for wallId
6. 3D calls clearDirty()
7. No further renders until next edit
```

## Undo/Redo (Ready for Integration)

Zustand + immer middleware supports time-travel out-of-the-box. Wire with zundo:

```typescript
import { useShallow } from 'zustand/react'
import { temporalStorage } from 'zundo'

const useFloorPlanStoreWithUndo = temporalStorage(
  useFloorPlanStore,
  { limit: 30 } // keep 30 undo states
)
```

Then: `undo()`, `redo()` become available.

## Validation Engine (Extensible Rule Set)

Rules run on canonical floor after edits. Example rules:
- Minimum room area (5 m²)
- Corridor width (min 1500mm)
- Door swing clearance (min 300mm)
- Window-to-wall ratio (min 10%)

Each rule returns:
```typescript
{
  id: string
  ruleId: string
  severity: 'info' | 'warning' | 'error'
  message: string // "Corridor width 1200mm below minimum 1500mm"
  standard?: string // "GS 1207:2018, Section 3.2"
  elementIds: string[] // walls, rooms affected
  remediation?: string // what to do
}
```

## Comparison & Trace-to-Learn

Ghost state (frozen baseline) is a deep copy of canonical floor at the moment student accepts reconstruction.

```typescript
freezeAsGhost() {
  state.ghostFloor = JSON.parse(JSON.stringify(state.currentFloor))
}
```

Comparison engine:
1. Reads `ghostFloor` (immutable) and `currentFloor` (current redesign)
2. Matches elements by proximity (not ID, since detection produces no persistent ID)
3. Classifies each: added, removed, moved, resized, unchanged
4. Computes metric deltas (area, count, perimeter)
5. Scores rubric (spatial adequacy, circulation, wall suitability, compliance)
6. Renders diff: removed = red, moved/resized = amber

## Directory Structure

```
lib/
  types/
    schema.ts              # Draft, Canonical, Library interfaces; LiftConfig
  refinement/
    lift.ts                # Lift algorithm: Draft → Canonical
  store/
    floorPlanStore.ts      # Zustand store with dirty tracking + hooks
  
components/
  2d/
    CanvasEditor.tsx       # Konva.js 2D editor, grid, walls, rooms, openings
  3d/
    FloorPlanRenderer.tsx  # React Three Fiber, on-demand rendering, dirty tracking

docs/
  ARCHITECTURE.md          # This file
  fyp-proposal.md          # FYP proposal (with diagrams embedded)
```

## Performance Notes

**2D Editor**:
- Konva redraws only changed layers (built-in dirty tracking)
- Grid is static (render once)
- Wall lines are lightweight

**3D Renderer**:
- `frameloop="demand"` stops continuous render loop
- Dirty set tracks which meshes need recreation
- `InstancedMesh` for repeated geometry (e.g., 30 windows of same type = 1 geometry rendered 30 times)
- Level-of-detail (LOD) optional: simplified geometry when zoomed out

**Memory**:
- Library (wall/door/window types) is shared, not duplicated per element
- Canonical floor is compact (20-room residential plan ≈ 50 KB JSON)
- Ghost floor is a deep copy, kept in memory only during Trace-to-Learn session

## Testing Strategy

1. **Schema validation**: Parse draft JSON, verify all required fields present
2. **Lift algorithm**: Run on real CubiCasa5K plans, verify:
   - All walls are axis-snapped
   - All junctions within tolerance
   - No duplicate walls
   - All detected rooms are closed and > 5 m²
   - All openings attached to valid walls
3. **Store actions**: Unit test each action (drawWall, moveWall, etc.) in isolation
4. **Sync**: E2E test: draw wall in 2D, verify 3D renders correct mesh
5. **Dirty tracking**: Verify dirty flags set on edits, cleared after render
6. **Undo/redo**: Verify state history and reversal

## Future Extensions

1. **Multi-floor buildings**: Each floor is an independent 2D space with elevation offset. 3D renderer stacks by elevation.
2. **Layer visibility**: Show/hide walls, openings, rooms (toggle `visible` property)
3. **Material assignment**: Pick material from library for walls (currently hardcoded)
4. **Annotation layer**: Sticky notes, arrows, measurement tools
5. **Collaboration**: WebSockets to sync state between multiple users (broadcast dirty flags)
6. **Mobile input**: Touch-friendly drag handles, larger hit areas for fingers
7. **Accessibility**: Keyboard shortcuts, screen reader support for room labels
