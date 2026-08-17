/**
 * Demo: Corbel compliance rule engine validation tests.
 * Shows each rule firing correctly against example floor plans.
 */

import { describe, it, expect } from "vitest";
import {
  validateWallThickness,
  validateSpanThickness,
  validateOpeningSize,
  validateOpeningHostFit,
  validateRoomLayout,
  validateCanonicalFloor,
} from "../canonicalValidation";
import { Canonical } from "@/types/schema";

describe("Corbel Validation Rules", () => {
  const mockLibrary: Canonical.Library = {
    wallTypes: new Map([
      ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
      ["int-100", { id: "int-100", thickness: 100, material: "sandcrete", loadBearing: false }],
      ["int-50", { id: "int-50", thickness: 50, material: "sandcrete", loadBearing: false }], // Too thin
    ]),
    doorTypes: new Map([
      ["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }],
      ["d-2500", { id: "d-2500", width: 2500, height: 2100, swing: "inward" }], // Oversized
    ]),
    windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
  };

  describe("Wall Thickness Validation", () => {
    it("should pass for thick load-bearing wall (200mm sandcrete)", () => {
      const wall: Canonical.Wall = {
        id: "wall-1",
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        typeRef: "ext-200",
        openingIds: [],
        confidence: 1.0,
        source: "user" as const,
      };

      const wallType = mockLibrary.wallTypes.get("ext-200")!;
      const result = validateWallThickness(wall, wallType, 1);
      expect(result).toBeNull();
    });

    it("should fail for thin partition (50mm)", () => {
      const wall: Canonical.Wall = {
        id: "wall-2",
        start: { x: 0, y: 0 },
        end: { x: 3000, y: 0 },
        typeRef: "int-50",
        openingIds: [],
        confidence: 1.0,
        source: "user" as const,
      };

      const wallType = mockLibrary.wallTypes.get("int-50")!;
      const result = validateWallThickness(wall, wallType, 1);
      expect(result).toBeNull(); // Partitions skip validation
    });

    it("should fail for thin load-bearing wall (100mm but needs 150mm for sandcrete 1-story)", () => {
      const wall: Canonical.Wall = {
        id: "wall-3",
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        typeRef: "int-100",
        openingIds: [],
        confidence: 1.0,
        source: "user" as const,
      };

      // Pretend this is load-bearing
      const wallTypeLoadBearing: Canonical.WallType = {
        id: "ext-100",
        thickness: 100,
        material: "sandcrete",
        loadBearing: true,
      };

      const result = validateWallThickness(wall, wallTypeLoadBearing, 1);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("wall-thickness-insufficient");
      expect(result?.severity).toBe("error");
    });
  });

  describe("Span-to-Thickness Ratio Validation", () => {
    it("should pass for reasonable span (5000mm / 200mm = 25:1)", () => {
      const wall: Canonical.Wall = {
        id: "wall-4",
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        typeRef: "ext-200",
        openingIds: [],
        confidence: 1.0,
        source: "user" as const,
      };

      const wallType = mockLibrary.wallTypes.get("ext-200")!;
      const result = validateSpanThickness(wall, wallType);
      expect(result).toBeNull();
    });

    it("should warn for very long wall (7000mm / 200mm = 35:1)", () => {
      const wall: Canonical.Wall = {
        id: "wall-5",
        start: { x: 0, y: 0 },
        end: { x: 7000, y: 0 },
        typeRef: "ext-200",
        openingIds: [],
        confidence: 1.0,
        source: "user" as const,
      };

      const wallType = mockLibrary.wallTypes.get("ext-200")!;
      const result = validateSpanThickness(wall, wallType);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("span-thickness-ratio-high");
      expect(result?.severity).toBe("warning");
    });
  });

  describe("Opening Size Validation", () => {
    it("should pass for standard door (900mm)", () => {
      const opening: Canonical.Opening = {
        id: "door-1",
        kind: "door",
        typeRef: "d-900",
        hostWallId: "wall-1",
        positionAlongWall: 2000,
        confidence: 1.0,
        source: "user" as const,
      };

      const doorType = mockLibrary.doorTypes.get("d-900")!;
      const result = validateOpeningSize(opening, doorType);
      expect(result).toBeNull();
    });

    it("should warn for oversized door (2500mm)", () => {
      const opening: Canonical.Opening = {
        id: "door-2",
        kind: "door",
        typeRef: "d-2500",
        hostWallId: "wall-1",
        positionAlongWall: 2500,
        confidence: 1.0,
        source: "user" as const,
      };

      const doorType = mockLibrary.doorTypes.get("d-2500")!;
      const result = validateOpeningSize(opening, doorType);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("opening-oversized");
      expect(result?.severity).toBe("warning");
    });
  });

  describe("Opening Host Fit Validation", () => {
    it("should pass when opening fits in wall", () => {
      const wall: Canonical.Wall = {
        id: "wall-6",
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
        typeRef: "ext-200",
        openingIds: ["door-3"],
        confidence: 1.0,
        source: "user" as const,
      };

      const opening: Canonical.Opening = {
        id: "door-3",
        kind: "door",
        typeRef: "d-900",
        hostWallId: "wall-6",
        positionAlongWall: 2500, // Centered
        confidence: 1.0,
        source: "user" as const,
      };

      const doorType = mockLibrary.doorTypes.get("d-900")!;
      const result = validateOpeningHostFit(opening, wall, doorType);
      expect(result).toBeNull();
    });

    it("should error when opening extends beyond wall end", () => {
      const wall: Canonical.Wall = {
        id: "wall-7",
        start: { x: 0, y: 0 },
        end: { x: 2000, y: 0 }, // Very short wall
        typeRef: "ext-200",
        openingIds: ["door-4"],
        confidence: 1.0,
        source: "user" as const,
      };

      const opening: Canonical.Opening = {
        id: "door-4",
        kind: "door",
        typeRef: "d-900",
        hostWallId: "wall-7",
        positionAlongWall: 1800, // Too close to end
        confidence: 1.0,
        source: "user" as const,
      };

      const doorType = mockLibrary.doorTypes.get("d-900")!;
      const result = validateOpeningHostFit(opening, wall, doorType);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("opening-host-fit");
      expect(result?.severity).toBe("error");
    });
  });

  describe("Room Layout Validation", () => {
    it("should pass for properly-sized bedroom (12 m²)", () => {
      const room: Canonical.Room = {
        id: "room-1",
        type: "bedroom",
        label: "Master Bedroom",
        boundingWallIds: [],
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
          { x: 0, y: 3000 },
        ],
        area: 12e6, // 12 m² in mm²
        confidence: 1.0,
        source: "user" as const,
      };

      const result = validateRoomLayout(room);
      expect(result).toBeNull();
    });

    it("should warn for undersized bedroom (5 m², needs 9 m²)", () => {
      const room: Canonical.Room = {
        id: "room-2",
        type: "bedroom",
        label: "Bedroom 2",
        boundingWallIds: [],
        vertices: [
          { x: 0, y: 0 },
          { x: 2500, y: 0 },
          { x: 2500, y: 2000 },
          { x: 0, y: 2000 },
        ],
        area: 5e6, // 5 m² in mm²
        confidence: 1.0,
        source: "user" as const,
      };

      const result = validateRoomLayout(room);
      expect(result).not.toBeNull();
      expect(result?.ruleId).toBe("room-area-small");
      expect(result?.severity).toBe("warning");
    });

    it("should warn for undersized kitchen (4 m², needs 6 m²)", () => {
      const room: Canonical.Room = {
        id: "room-3",
        type: "kitchen",
        label: "Kitchen",
        boundingWallIds: [],
        vertices: [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
          { x: 2000, y: 2000 },
          { x: 0, y: 2000 },
        ],
        area: 4e6, // 4 m² in mm²
        confidence: 1.0,
        source: "user" as const,
      };

      const result = validateRoomLayout(room);
      expect(result).not.toBeNull();
      expect(result?.severity).toBe("warning");
    });
  });

  describe("Orchestrator - Full Floor Plan Validation", () => {
    it("should report multiple violations on a flawed floor plan", () => {
      const floor: Canonical.Floor = {
        id: "floor-1",
        elevation: 0,
        floorHeight: 3000,
        walls: [
          // Thin load-bearing wall (violation)
          {
            id: "wall-thin",
            start: { x: 0, y: 0 },
            end: { x: 8000, y: 0 },
            typeRef: "int-50",
            openingIds: ["door-1"],
            confidence: 1.0,
            source: "user" as const,
          },
          // Oversized opening that might not fit
          {
            id: "wall-short",
            start: { x: 0, y: 4000 },
            end: { x: 2000, y: 4000 },
            typeRef: "ext-200",
            openingIds: ["door-2"],
            confidence: 1.0,
            source: "user" as const,
          },
        ],
        openings: [
          {
            id: "door-1",
            kind: "door",
            typeRef: "d-900",
            hostWallId: "wall-thin",
            positionAlongWall: 4000,
            confidence: 1.0,
            source: "user" as const,
          },
          {
            id: "door-2",
            kind: "door",
            typeRef: "d-2500", // Oversized
            hostWallId: "wall-short",
            positionAlongWall: 1000, // Won't fit
            confidence: 1.0,
            source: "user" as const,
          },
        ],
        rooms: [
          {
            id: "room-small",
            type: "bedroom",
            boundingWallIds: [],
            vertices: [
              { x: 0, y: 0 },
              { x: 2000, y: 0 },
              { x: 2000, y: 2000 },
              { x: 0, y: 2000 },
            ],
            area: 4e6, // Too small
            confidence: 1.0,
            source: "user" as const,
          },
        ],
      };

      const results = validateCanonicalFloor(floor, mockLibrary);

      // Should report: room too small, opening oversized, opening doesn't fit
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results.some((r) => r.ruleId === "room-area-small")).toBe(true);
      expect(results.some((r) => r.ruleId === "opening-oversized")).toBe(true);
    });
  });
});
