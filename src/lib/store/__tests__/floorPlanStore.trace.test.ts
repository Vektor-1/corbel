import { beforeEach, describe, expect, it } from "vitest";
import { Source, Canonical } from "../../../types/schema";
import { useFloorPlanStore } from "../floorPlanStore";

const library: Canonical.Library = {
  wallTypes: new Map([["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }]]),
  doorTypes: new Map([["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }]]),
  windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
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

  it("keeps a placed door inside its host wall and records the reciprocal link", () => {
    const floor = floorWithFourWalls();
    floor.walls[0].end = { x: 3100, y: 100 };
    useFloorPlanStore.getState().loadFloor(floor, library);

    const store = useFloorPlanStore.getState();
    const openingId = store.placeOpening("door", "wall-1", -200, "d-900");
    const state = useFloorPlanStore.getState();

    expect(openingId).toBeTruthy();
    expect(state.getOpening(openingId)).toMatchObject({
      kind: "door",
      hostWallId: "wall-1",
      positionAlongWall: 450,
    });
    expect(state.getWall("wall-1")?.openingIds).toContain(openingId);
  });
});
