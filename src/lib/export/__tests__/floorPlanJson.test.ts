import { describe, expect, it } from "vitest";
import { Canonical, Source } from "../../../types/schema";
import { createFloorPlanJsonExport, createReconstructionPrompt, exportFileName } from "../floorPlanJson";

const library: Canonical.Library = {
  wallTypes: new Map([
    ["ext-200", { id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }],
    ["int-100", { id: "int-100", thickness: 100, material: "concrete", loadBearing: false }],
  ]),
  doorTypes: new Map([["d-900", { id: "d-900", width: 900, height: 2100, swing: "inward" }]]),
  windowTypes: new Map([["w-1200", { id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]]),
};

const floor: Canonical.Floor = {
  id: "ground-floor",
  elevation: 0,
  floorHeight: 2800,
  walls: [
    { id: "wall-1", start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, typeRef: "ext-200", openingIds: ["door-1"], confidence: 1, source: Source.USER },
    { id: "wall-2", start: { x: 1000, y: 0 }, end: { x: 1000, y: 800 }, typeRef: "int-100", openingIds: [], confidence: 1, source: Source.USER },
  ],
  openings: [
    { id: "door-1", kind: "door", typeRef: "d-900", hostWallId: "wall-1", positionAlongWall: 500, confidence: 1, source: Source.USER },
  ],
  rooms: [
    { id: "room-1", label: "Living room", type: "living", boundingWallIds: ["wall-1", "wall-2"], vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 800 }], area: 400000, confidence: 1, source: Source.USER },
  ],
};

describe("createFloorPlanJsonExport", () => {
  it("maps a canonical floor to the documented v1 contract", () => {
    const exported = createFloorPlanJsonExport(
      { floor, library, validationIssues: [{ id: "issue-1", ruleId: "min-area", severity: "warning", message: "Room too small", elementIds: ["room-1"] }] },
      "2026-08-13T12:00:00.000Z",
    );

    expect(exported).toMatchObject({
      exportVersion: 1,
      exportedAt: "2026-08-13T12:00:00.000Z",
      generator: "corbel",
      canvas: { widthMm: 1000, heightMm: 800, originCorner: "top-left" },
      source: { fileName: null, pixelsPerMeter: null, overallConfidence: null },
      library: {
        wallTypes: expect.arrayContaining([{ id: "ext-200", thickness: 200, material: "sandcrete", loadBearing: true }]),
        doorTypes: expect.arrayContaining([{ id: "d-900", width: 900, height: 2100, swing: "inward" }]),
        windowTypes: expect.arrayContaining([{ id: "w-1200", width: 1200, height: 1200, sillHeight: 900 }]),
      },
      walls: [
        { id: "wall-1", typeRef: "ext-200", openingIds: ["door-1"], thicknessMm: 200, heightMm: 2800, isExternal: true, material: "sandcrete", type: "loadBearing", provenance: { confidence: 1, source: "user" } },
        { id: "wall-2", typeRef: "int-100", openingIds: [], thicknessMm: 100, isExternal: false, type: "partition", provenance: { confidence: 1, source: "user" } },
      ],
      rooms: [{ id: "room-1", name: "Living room", roomType: "living", boundingWallIds: ["wall-1", "wall-2"], computed: { areaSqM: 0.4, centroidMm: { x: 666.667, y: 266.667 } }, provenance: { confidence: 1, source: "user" } }],
      openings: [{ id: "door-1", type: "door", typeRef: "d-900", wallId: "wall-1", centerPointMm: { x: 500, y: 0 }, widthMm: 900, heightMm: 2100, sillHeightMm: 0, swing: "inward", doorType: "d-900", provenance: { confidence: 1, source: "user" } }],
      compliance: { issues: [{ id: "issue-1", severity: "warning", rule: "min-area", targetId: "room-1" }] },
    });
    expect(exported.aiContext.coordinateSystem).toContain("top-left");
    expect(exported.aiContext.reconstructionNote).toContain("library catalog");
  });

  it("copies geometry and uses safe fallback values for unknown references", () => {
    const exported = createFloorPlanJsonExport({
      floor: { ...floor, walls: [{ ...floor.walls[0], typeRef: "unknown" }], openings: [{ ...floor.openings[0], hostWallId: "missing", typeRef: "missing" }] },
      library,
      validationIssues: [],
    });

    floor.walls[0].start.x = 99;
    expect(exported.walls[0].startMm).toEqual({ x: 0, y: 0 });
    expect(exported.walls[0].thicknessMm).toBeNull();
    expect(exported.openings[0].centerPointMm).toBeNull();
    expect(exported.openings[0].widthMm).toBeNull();
  });

  it("preserves room type instead of hardcoding 'other'", () => {
    const floorWithTypes: Canonical.Floor = {
      ...floor,
      rooms: [
        { ...floor.rooms[0], type: "bedroom" },
        { id: "room-2", label: "Kitchen", type: "kitchen", boundingWallIds: [], vertices: [], area: 600000, confidence: 1, source: Source.USER },
        { id: "room-3", label: "Hallway", type: undefined, boundingWallIds: [], vertices: [], area: 100000, confidence: 1, source: Source.USER }, // Undefined type should fallback to "other"
      ],
    };

    const exported = createFloorPlanJsonExport({ floor: floorWithTypes, library, validationIssues: [] });

    expect(exported.rooms[0].roomType).toBe("bedroom");
    expect(exported.rooms[1].roomType).toBe("kitchen");
    expect(exported.rooms[2].roomType).toBe("other"); // Fallback for undefined
  });

  it("populates door swing from library doorType", () => {
    const exported = createFloorPlanJsonExport({ floor, library, validationIssues: [] });
    const opening = exported.openings[0];

    expect(opening.swing).toBe("inward");
    expect(opening.doorType).toBe("d-900");
  });

  it("exports library catalog with typeRef references on walls and openings", () => {
    const exported = createFloorPlanJsonExport({ floor, library, validationIssues: [] });

    // Verify library is present
    expect(exported.library.wallTypes).toHaveLength(2);
    expect(exported.library.doorTypes).toHaveLength(1);
    expect(exported.library.windowTypes).toHaveLength(1);

    // Verify walls reference library by typeRef
    const wall1 = exported.walls.find((w) => w.id === "wall-1");
    expect(wall1?.typeRef).toBe("ext-200");
    const wallType = exported.library.wallTypes.find((t) => t.id === "ext-200");
    expect(wallType?.thickness).toBe(200);

    // Verify opening references library by typeRef
    const door = exported.openings[0];
    expect(door.typeRef).toBe("d-900");
    const doorType = exported.library.doorTypes.find((t) => t.id === "d-900");
    expect(doorType?.swing).toBe("inward");
  });

  it("creates a reconstruction prompt that preserves the export contract", () => {
    const exported = createFloorPlanJsonExport({ floor, library, validationIssues: [] });
    const prompt = createReconstructionPrompt(exported);

    expect(prompt).toContain("attached Corbel JSON v1");
    expect(prompt).toContain("All coordinates and dimensions are in millimeters");
    expect(prompt).toContain("Preserve every Corbel object ID");
    expect(prompt).toContain("library.wallTypes");
    expect(prompt).toContain("door swing");
  });
});

describe("exportFileName", () => {
  it("uses a portable corbel extension and fallback name", () => {
    expect(exportFileName("ground floor/1")).toBe("ground-floor-1.corbel.json");
    expect(exportFileName("")).toBe("corbel-floor.corbel.json");
  });
});
