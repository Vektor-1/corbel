/**
 * Demo floor plan fixture for testing Corbel validation UI.
 * Includes intentional rule violations to demonstrate each validation rule firing.
 *
 * Usage: Load in /studio with URL params: ?fixture=demo-validation
 * Or import and use with: loadFloor(demoFloorPlan(), demoLibrary())
 */

import { Canonical, Source } from "@/types/schema";

export function demoFloorPlanWithIssues(): Canonical.Floor {
  return {
    id: "demo-floor-validation",
    elevation: 0,
    floorHeight: 3000,

    // Intentional violations:
    // 1. Wall-1: thin load-bearing (100mm, needs 150mm) — wall-thickness-insufficient
    // 2. Wall-2: very long span (8000mm / 200mm = 40:1) — span-thickness-ratio-high
    // 3. Wall-3: oversized door that doesn't fit — opening-oversized + opening-host-fit
    // 4. Room-1: undersized bedroom (5m², needs 9m²) — room-area-small
    // 5. Room-2: undersized kitchen (4m², needs 6m²) — room-area-small

    walls: [
      // Wall-1: Thin load-bearing wall (VIOLATION: wall-thickness-insufficient)
      {
        id: "wall-thin-lb",
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        typeRef: "ext-100-lb", // Pretend this is load-bearing sandcrete, 100mm (too thin)
        openingIds: ["door-1"],
        confidence: 1.0,
        source: Source.USER,
      },

      // Wall-2: Very long span (VIOLATION: span-thickness-ratio-high)
      {
        id: "wall-long-span",
        start: { x: 0, y: 4000 },
        end: { x: 8000, y: 4000 },
        typeRef: "ext-200",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },

      // Wall-3: Short wall with oversized door that won't fit
      // (VIOLATIONS: opening-oversized, opening-host-fit)
      {
        id: "wall-short-w-oversized",
        start: { x: 0, y: 8000 },
        end: { x: 2000, y: 8000 },
        typeRef: "ext-200",
        openingIds: ["door-2"],
        confidence: 1.0,
        source: Source.USER,
      },

      // Wall-4: Interior wall separating rooms (OK)
      {
        id: "wall-interior",
        start: { x: 0, y: 2000 },
        end: { x: 0, y: 6000 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },

      // Wall-5: Closure for Room 1 (OK)
      {
        id: "wall-room1-right",
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 2000 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },
      {
        id: "wall-room1-bottom",
        start: { x: 4000, y: 2000 },
        end: { x: 0, y: 2000 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },

      // Wall-6: Closure for Room 2 (OK)
      {
        id: "wall-room2-right",
        start: { x: 4000, y: 4000 },
        end: { x: 4000, y: 6000 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },
      {
        id: "wall-room2-bottom",
        start: { x: 4000, y: 6000 },
        end: { x: 0, y: 6000 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: Source.USER,
      },
    ],

    openings: [
      // Door-1: Standard size, fits in Wall-1 (OK)
      {
        id: "door-1",
        kind: "door",
        typeRef: "d-900",
        hostWallId: "wall-thin-lb",
        positionAlongWall: 2000, // Centered
        confidence: 1.0,
        source: Source.USER,
      },

      // Door-2: Oversized door (2500mm) on a short wall (2000mm)
      // VIOLATIONS: opening-oversized, opening-host-fit
      {
        id: "door-2",
        kind: "door",
        typeRef: "d-2500", // 2500mm wide
        hostWallId: "wall-short-w-oversized", // Only 2000mm wall
        positionAlongWall: 1000, // Will extend beyond wall endpoints
        confidence: 1.0,
        source: Source.USER,
      },

      // Window-1: Standard window in Wall-2 (OK)
      {
        id: "window-1",
        kind: "window",
        typeRef: "w-1200",
        hostWallId: "wall-long-span",
        positionAlongWall: 4000, // Centered
        confidence: 1.0,
        source: Source.USER,
      },
    ],

    rooms: [
      // Room-1: Small bedroom (5m², needs 9m²)
      // VIOLATION: room-area-small
      {
        id: "room-1-small-bed",
        type: "bedroom",
        label: "Bedroom (too small)",
        boundingWallIds: ["wall-thin-lb", "wall-interior", "wall-room1-right", "wall-room1-bottom"],
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 2000 },
          { x: 0, y: 2000 },
        ],
        area: 5e6, // 5 m² (8000 × 2500 mm = 8 m² ish, but ~5 here for demo)
        confidence: 1.0,
        source: Source.USER,
      },

      // Room-2: Small kitchen (4m², needs 6m²)
      // VIOLATION: room-area-small
      {
        id: "room-2-small-kit",
        type: "kitchen",
        label: "Kitchen (cramped)",
        boundingWallIds: ["wall-long-span", "wall-interior", "wall-room2-right", "wall-room2-bottom"],
        vertices: [
          { x: 0, y: 4000 },
          { x: 4000, y: 4000 },
          { x: 4000, y: 6000 },
          { x: 0, y: 6000 },
        ],
        area: 4e6, // 4 m²
        confidence: 1.0,
        source: Source.USER,
      },
    ],
  };
}

/**
 * Library matching demo floor plan types.
 */
export function demoLibrary(): Canonical.Library {
  return {
    wallTypes: new Map([
      ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
      ["ext-100-lb", { id: "ext-100-lb", thickness: 100, material: "sandcrete", loadBearing: true }], // Thin (violation)
      ["int-100", { id: "int-100", thickness: 100, material: "sandcrete", loadBearing: false }],
    ]),
    doorTypes: new Map([
      ["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }],
      ["d-2500", { id: "d-2500", width: 2500, height: 2100, swing: "inward" }], // Oversized
    ]),
    windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
  };
}
