/**
 * Smoke test for Trace-to-Learn flow:
 * Load baseline, freeze as ghost, edit in 2D, verify comparison updates, check 3D renders.
 *
 * This test cannot run in regular vitest (requires browser + canvas).
 * Placeholder for browser-based Playwright/Cypress e2e suite.
 */

import { describe, it, expect } from "vitest";
import { Canonical, Source } from "../../../types/schema";
import { cloneFloorAsGhost, compareFloorToGhost } from "../../utils/ghostClone";

describe("Trace-to-Learn smoke flow (unit version)", () => {
  it("loads baseline and freezes as ghost", () => {
    const baseline: Canonical.Floor = {
      id: "baseline",
      elevation: 0,
      floorHeight: 3000,
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w2", start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w3", start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w4", start: { x: 0, y: 3000 }, end: { x: 0, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
      ],
      openings: [],
      rooms: [
        {
          id: "r1",
          boundingWallIds: ["w1", "w2", "w3", "w4"],
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          area: 12e6,
          confidence: 1,
          source: Source.YOLO,
        },
      ],
    };

    const ghost = cloneFloorAsGhost(baseline);
    expect(ghost.walls.length).toBe(4);
    expect(ghost.rooms.length).toBe(1);
  });

  it("compares ghost to current floor after edit", () => {
    const baseline: Canonical.Floor = {
      id: "baseline",
      elevation: 0,
      floorHeight: 3000,
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w2", start: { x: 4000, y: 0 }, end: { x: 4000, y: 3000 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w3", start: { x: 4000, y: 3000 }, end: { x: 0, y: 3000 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
        { id: "w4", start: { x: 0, y: 3000 }, end: { x: 0, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
      ],
      openings: [],
      rooms: [
        {
          id: "r1",
          boundingWallIds: ["w1", "w2", "w3", "w4"],
          vertices: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
          area: 12e6,
          confidence: 1,
          source: Source.YOLO,
        },
      ],
    };

    const ghost = cloneFloorAsGhost(baseline);

    // Simulate drawing a new wall in current floor
    const current: Canonical.Floor = {
      ...baseline,
      walls: [
        ...baseline.walls,
        {
          id: "w5",
          start: { x: 2000, y: 0 },
          end: { x: 2000, y: 3000 },
          typeRef: "int-100",
          openingIds: [],
          confidence: 1,
          source: Source.USER,
        },
      ],
    };

    const comparison = compareFloorToGhost(current, ghost);

    expect(comparison.ghostWallCount).toBe(4);
    expect(comparison.currentWallCount).toBe(5);
    expect(comparison.ghostRoomCount).toBe(1);
    expect(comparison.currentRoomCount).toBe(1); // Still 1 until topology recalc
  });

  it("verifies ghost immutability during comparison", () => {
    const baseline: Canonical.Floor = {
      id: "baseline",
      elevation: 0,
      floorHeight: 3000,
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.YOLO },
      ],
      openings: [],
      rooms: [],
    };

    const ghost = cloneFloorAsGhost(baseline);
    const ghostWallCountBefore = ghost.walls.length;

    // Compare multiple times
    const current = { ...baseline, walls: [...baseline.walls] };
    compareFloorToGhost(current, ghost);
    compareFloorToGhost(current, ghost);
    compareFloorToGhost(current, ghost);

    // Ghost should remain unchanged
    expect(ghost.walls.length).toBe(ghostWallCountBefore);
    expect(ghost.walls[0].id).toBe("w1");
  });
});
