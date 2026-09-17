import { describe, expect, it } from "vitest";
import { Source, type Canonical } from "@/types/schema";
import { loadFloorPlanSnapshot, saveFloorPlanSnapshot, type StorageLike } from "../floorPlanSnapshot";

const library: Canonical.Library = {
  wallTypes: new Map([["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }]]),
  doorTypes: new Map([["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }]]),
  windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
};

const floor: Canonical.Floor = {
  id: "saved-floor",
  elevation: 0,
  floorHeight: 2800,
  walls: [{ id: "wall-1", start: { x: 0, y: 0 }, end: { x: 4000, y: 0 }, typeRef: "ext-200", openingIds: ["door-1"], confidence: 1, source: Source.USER }],
  openings: [{ id: "door-1", kind: "door", typeRef: "d-900", hostWallId: "wall-1", positionAlongWall: 1200, confidence: 1, source: Source.USER }],
  rooms: [],
};

function memoryStorage(): StorageLike & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe("floor plan snapshots", () => {
  it("round-trips a canonical floor and its type library", () => {
    const storage = memoryStorage();
    saveFloorPlanSnapshot(storage, floor, library);

    expect(loadFloorPlanSnapshot(storage)).toMatchObject({
      floor: { id: "saved-floor", openings: [{ id: "door-1", hostWallId: "wall-1" }] },
    });
    expect(loadFloorPlanSnapshot(storage)?.library.doorTypes.get("d-900")?.width).toBe(900);
  });

  it("clears an unreadable snapshot instead of blocking the editor", () => {
    const storage = memoryStorage();
    storage.setItem("corbel:floor-plan-snapshot:v1", "not-json");

    expect(loadFloorPlanSnapshot(storage)).toBeNull();
    expect(storage.getItem("corbel:floor-plan-snapshot:v1")).toBeNull();
  });
});
