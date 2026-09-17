import { Canonical, Source } from "../../types/schema";

export const traceFixtureLibrary: Canonical.Library = {
  wallTypes: new Map([
    ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
    ["int-100", { id: "int-100", thickness: 100, material: "sandcrete", loadBearing: false }],
  ]),
  doorTypes: new Map(),
  windowTypes: new Map(),
};

/** Deterministic browser fixture: a 4-wall rectangular frozen baseline. */
export const createTraceFixtureFloor = (): Canonical.Floor => ({
  id: "trace-smoke-fixture",
  elevation: 0,
  floorHeight: 2800,
  walls: [
    [100, 100, 500, 100],
    [500, 100, 500, 500],
    [500, 500, 100, 500],
    [100, 500, 100, 100],
  ].map(([startX, startY, endX, endY], index) => ({
    id: `fixture-wall-${index + 1}`,
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
