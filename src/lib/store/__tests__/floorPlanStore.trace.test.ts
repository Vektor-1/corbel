import { beforeEach, describe, expect, it } from "vitest";
import { Source, Canonical } from "../../../types/schema";
import { useFloorPlanStore } from "../floorPlanStore";

const library: Canonical.Library = {
  wallTypes: new Map([["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }]]),
  doorTypes: new Map(),
  windowTypes: new Map(),
};

const floorWithFourWalls = (): Canonical.Floor => ({
  id: "trace-fixture",
  elevation: 0,
  floorHeight: 2800,
  walls: [
    [100, 100, 500, 100], [500, 100, 500, 500], [500, 500, 100, 500], [100, 500, 100, 100],
  ].map(([startX, startY, endX, endY], index) => ({
    id: `wall-${index + 1}`,
    start: { x: startX, y: startY },
    end: { x: endX, y: endY },
    typeRef: "ext-200",
    openingIds: [],
    confidence: 1,
    source: Source.USER,
  })),
  openings: [],
  rooms: [],
});

describe("Trace-to-Learn state", () => {
  beforeEach(() => {
    useFloorPlanStore.getState().loadFloor(floorWithFourWalls(), library);
  });

  it("keeps the four-wall baseline frozen while a fifth wall is drawn", () => {
    const store = useFloorPlanStore.getState();
    store.freezeAsGhost();
    store.setGhostOpacity(0.5);
    store.drawWall({ x: 100, y: 300 }, { x: 500, y: 300 });

    const state = useFloorPlanStore.getState();
    expect(state.ghostFloor?.walls).toHaveLength(4);
    expect(state.currentFloor?.walls).toHaveLength(5);
    expect(state.ghostOpacity).toBe(0.5);
    expect(state.getTraceComparison()).toMatchObject({ ghostWallCount: 4, currentWallCount: 5 });
    expect(state.isDirtyGlobal).toBe(true);
  });
});
