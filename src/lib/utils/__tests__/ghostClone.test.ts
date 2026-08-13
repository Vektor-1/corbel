import { describe, it, expect } from "vitest";
import { cloneFloorAsGhost, compareFloorToGhost } from "../ghostClone";
import { Canonical, Source } from "../../../types/schema";

describe("cloneFloorAsGhost", () => {
  const createTestFloor = (): Canonical.Floor => ({
    id: "floor_1",
    elevation: 0,
    floorHeight: 3000,
    walls: [
      {
        id: "w1",
        start: { x: 0, y: 0 },
        end: { x: 4000, y: 0 },
        typeRef: "ext-200",
        openingIds: ["o1"],
        confidence: 0.95,
        source: Source.AI,
      },
      {
        id: "w2",
        start: { x: 4000, y: 0 },
        end: { x: 4000, y: 3000 },
        typeRef: "ext-200",
        openingIds: [],
        confidence: 0.9,
        source: Source.AI,
      },
    ],
    openings: [
      {
        id: "o1",
        kind: "door",
        typeRef: "d-900",
        hostWallId: "w1",
        positionAlongWall: 1000,
        confidence: 0.85,
        source: Source.AI,
      },
    ],
    rooms: [
      {
        id: "r1",
        label: "Living Room",
        boundingWallIds: ["w1", "w2"],
        vertices: [
          { x: 0, y: 0 },
          { x: 4000, y: 0 },
          { x: 4000, y: 3000 },
        ],
        area: 12e6,
        confidence: 0.9,
        source: Source.AI,
      },
    ],
  });

  it("creates independent deep copy", () => {
    const original = createTestFloor();
    const ghost = cloneFloorAsGhost(original);

    expect(ghost.id).toBe(original.id);
    expect(ghost.walls.length).toBe(original.walls.length);
    expect(ghost.openings.length).toBe(original.openings.length);
    expect(ghost.rooms.length).toBe(original.rooms.length);
  });

  it("prevents mutation of ghost when original changes", () => {
    const original = createTestFloor();
    const ghost = cloneFloorAsGhost(original);

    original.walls[0].start.x = 999;
    original.walls[0].openingIds.push("fake-opening");

    expect(ghost.walls[0].start.x).toBe(0);
    expect(ghost.walls[0].openingIds).toEqual(["o1"]);
  });

  it("prevents mutation of original when ghost changes", () => {
    const original = createTestFloor();
    const ghost = cloneFloorAsGhost(original);

    ghost.walls[0].end.y = 9999;
    ghost.openings[0].confidence = 0.0;

    expect(original.walls[0].end.y).toBe(0);
    expect(original.openings[0].confidence).toBe(0.85);
  });

  it("preserves room vertex structure independently", () => {
    const original = createTestFloor();
    const ghost = cloneFloorAsGhost(original);

    if (ghost.rooms[0].vertices[0]) {
      ghost.rooms[0].vertices[0].x = -9999;
    }

    expect(original.rooms[0].vertices[0].x).toBe(0);
  });

  it("clones empty floor correctly", () => {
    const empty: Canonical.Floor = {
      id: "empty",
      elevation: 0,
      floorHeight: 3000,
      walls: [],
      openings: [],
      rooms: [],
    };

    const ghost = cloneFloorAsGhost(empty);
    expect(ghost.walls.length).toBe(0);
    expect(ghost.openings.length).toBe(0);
    expect(ghost.rooms.length).toBe(0);
  });
});

describe("compareFloorToGhost", () => {
  it("counts elements correctly", () => {
    const ghost: Canonical.Floor = {
      id: "floor_1",
      elevation: 0,
      floorHeight: 3000,
      walls: [
        { id: "w1", start: { x: 0, y: 0 }, end: { x: 100, y: 100 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.USER },
        { id: "w2", start: { x: 100, y: 100 }, end: { x: 200, y: 0 }, typeRef: "ext-200", openingIds: [], confidence: 1, source: Source.USER },
      ],
      openings: [{ id: "o1", kind: "door", typeRef: "d-900", hostWallId: "w1", positionAlongWall: 50, confidence: 1, source: Source.USER }],
      rooms: [{ id: "r1", boundingWallIds: ["w1", "w2"], vertices: [], area: 1e6, confidence: 1, source: Source.USER }],
    };

    const current: Canonical.Floor = {
      id: "floor_1",
      elevation: 0,
      floorHeight: 3000,
      walls: [
        ...ghost.walls,
        { id: "w3", start: { x: 200, y: 0 }, end: { x: 0, y: 0 }, typeRef: "int-100", openingIds: [], confidence: 1, source: Source.USER },
      ],
      openings: [
        ...ghost.openings,
        { id: "o2", kind: "window", typeRef: "w-1200", hostWallId: "w3", positionAlongWall: 50, confidence: 1, source: Source.USER },
      ],
      rooms: [
        ...ghost.rooms,
        { id: "r2", boundingWallIds: ["w3"], vertices: [], area: 2e6, confidence: 1, source: Source.USER },
      ],
    };

    const comparison = compareFloorToGhost(current, ghost);

    expect(comparison.ghostWallCount).toBe(2);
    expect(comparison.currentWallCount).toBe(3);
    expect(comparison.ghostOpeningCount).toBe(1);
    expect(comparison.currentOpeningCount).toBe(2);
    expect(comparison.ghostRoomCount).toBe(1);
    expect(comparison.currentRoomCount).toBe(2);
  });
});
