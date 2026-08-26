import { beforeEach, describe, expect, it } from "vitest";
import { Canonical } from "../../../types/schema";
import { useFloorPlanStore } from "../../store/floorPlanStore";
import { cancelRoomDraw, finishRoomDraw, startRoomDraw, updateRoomDraw } from "../roomTool";

const library: Canonical.Library = {
  wallTypes: new Map(),
  doorTypes: new Map(),
  windowTypes: new Map(),
};

const floor = (): Canonical.Floor => ({
  id: "room-tool-test",
  elevation: 0,
  floorHeight: 2800,
  walls: [],
  openings: [],
  rooms: [],
});

describe("room drawing tool", () => {
  beforeEach(() => {
    cancelRoomDraw();
    useFloorPlanStore.getState().loadFloor(floor(), library);
  });

  it("snaps its preview and adds a canonical room that meets the minimum size", () => {
    startRoomDraw(51, 149);
    updateRoomDraw(2_049, 2_051);

    expect(useFloorPlanStore.getState().drawingRoom).toEqual({
      x: 100,
      y: 100,
      width: 1900,
      height: 2000,
    });

    updateRoomDraw(2_149, 2_051);
    finishRoomDraw();

    const state = useFloorPlanStore.getState();
    expect(state.drawingRoom).toBeNull();
    expect(state.currentFloor?.rooms).toHaveLength(1);
    expect(state.currentFloor?.rooms[0]).toMatchObject({
      label: "Room",
      boundingWallIds: [],
      area: 4_000_000,
      confidence: 1,
      source: "user",
      vertices: [
        { x: 100, y: 100 },
        { x: 2100, y: 100 },
        { x: 2100, y: 2100 },
        { x: 100, y: 2100 },
      ],
    });
    expect(state.dirtyRoomIds.size).toBe(1);
    expect(state.isDirtyGlobal).toBe(true);
  });

  it("clears an undersized preview without adding a room", () => {
    startRoomDraw(0, 0);
    updateRoomDraw(1_899, 2_000);
    finishRoomDraw();

    const state = useFloorPlanStore.getState();
    expect(state.drawingRoom).toBeNull();
    expect(state.currentFloor?.rooms).toHaveLength(0);
  });

  it("cancels an active preview", () => {
    startRoomDraw(0, 0);
    updateRoomDraw(2_000, 2_000);
    cancelRoomDraw();

    expect(useFloorPlanStore.getState().drawingRoom).toBeNull();
    expect(useFloorPlanStore.getState().currentFloor?.rooms).toHaveLength(0);
  });
});
