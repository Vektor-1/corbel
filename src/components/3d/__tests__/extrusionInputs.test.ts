/**
 * Verifies 3D extrusion inputs: wall thickness from library + floor height.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { useFloorPlanStore } from "../../../lib/store/floorPlanStore";
import { Canonical, Source } from "../../../types/schema";

const library: Canonical.Library = {
  wallTypes: new Map([
    ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
    ["int-100", { id: "int-100", thickness: 100, material: "sandcrete", loadBearing: false }],
  ]),
  doorTypes: new Map(),
  windowTypes: new Map(),
};

const floor = (): Canonical.Floor => ({
  id: "3d-verify",
  elevation: 0,
  floorHeight: 2800,
  walls: [
    {
      id: "ext-wall",
      start: { x: 0, y: 0 },
      end: { x: 4000, y: 0 },
      typeRef: "ext-200",
      openingIds: [],
      confidence: 1,
      source: Source.USER,
    },
    {
      id: "int-wall",
      start: { x: 0, y: 0 },
      end: { x: 0, y: 3000 },
      typeRef: "int-100",
      openingIds: [],
      confidence: 1,
      source: Source.USER,
    },
  ],
  openings: [],
  rooms: [
    {
      id: "room-1",
      label: "My Room",
      type: "Other",
      boundingWallIds: [],
      vertices: [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 3000 },
        { x: 0, y: 3000 },
      ],
      area: 12_000_000,
      confidence: 1,
      source: Source.USER,
    },
  ],
});

describe("3D extrusion inputs", () => {
  beforeEach(() => {
    useFloorPlanStore.getState().loadFloor(floor(), library);
  });

  it("resolves 200mm exterior and 100mm interior wall thickness", () => {
    const state = useFloorPlanStore.getState();
    const ext = state.library.wallTypes.get("ext-200");
    const int = state.library.wallTypes.get("int-100");
    expect(ext?.thickness).toBe(200);
    expect(int?.thickness).toBe(100);

    const extWall = state.getWall("ext-wall")!;
    const intWall = state.getWall("int-wall")!;
    expect(state.library.wallTypes.get(extWall.typeRef)?.thickness).toBe(200);
    expect(state.library.wallTypes.get(intWall.typeRef)?.thickness).toBe(100);
  });

  it("uses floorHeight 2800mm for extrusion", () => {
    expect(useFloorPlanStore.getState().currentFloor?.floorHeight).toBe(2800);
  });

  it("keeps room label when type changes", () => {
    const store = useFloorPlanStore.getState();
    store.setRoomType("room-1", "Bedroom");
    const room = useFloorPlanStore.getState().getRoom("room-1");
    expect(room?.label).toBe("My Room");
    expect(room?.type).toBe("Bedroom");
  });
});
