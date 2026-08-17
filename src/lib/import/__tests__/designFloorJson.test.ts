import { describe, expect, it } from "vitest";

import { importDesignFloorJson, validateDesignFloorJson } from "../designFloorJson";

describe("designFloorJson import", () => {
  it("imports Corbel's direct geometry format without losing hosted openings", () => {
    const source = {
      id: "one-bedroom",
      name: "One Bedroom Apartment",
      width: 12000,
      height: 9000,
      scale: 1,
      walls: [{
        id: "wall-1",
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 4000, y: 0 },
        thickness: 225,
        material: "sandcrete",
        type: "loadBearing",
        height: 2700,
      }],
      rooms: [{
        id: "bedroom",
        name: "Bedroom",
        vertices: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }],
        area: 12,
      }],
      doors: [{
        id: "door-1",
        wallId: "wall-1",
        position: { x: 1400, y: 0 },
        width: 900,
        type: "internal",
        swing: "left",
      }],
      windows: [],
      objects: [],
    };

    expect(validateDesignFloorJson(source)).toBe(true);
    expect(importDesignFloorJson(source)).toMatchObject({
      id: "one-bedroom",
      walls: [{ startPoint: { x: 0, y: 0 }, endPoint: { x: 4000, y: 0 }, thickness: 225 }],
      doors: [{ wallId: "wall-1", position: { x: 1400, y: 0 }, width: 900 }],
    });
  });

  it("imports Studio's canonical JSON v1 export", () => {
    const source = {
      exportVersion: 1,
      generator: "corbel",
      meta: { planId: "studio-plan", planName: "Studio plan" },
      canvas: { widthMm: 5000, heightMm: 4000 },
      library: {
        wallTypes: [],
        doorTypes: [{ id: "door-900", widthMm: 900, heightMm: 2100, swing: "inward" }],
        windowTypes: [],
      },
      walls: [{
        id: "wall-1",
        startMm: { x: 0, y: 0 },
        endMm: { x: 5000, y: 0 },
        thicknessMm: 225,
        heightMm: 2700,
        material: "sandcrete",
        type: "loadBearing",
      }],
      rooms: [{
        id: "room-1",
        name: "Bedroom",
        roomType: "bedroom",
        verticesMm: [{ x: 0, y: 0 }, { x: 5000, y: 0 }, { x: 5000, y: 4000 }, { x: 0, y: 4000 }],
        computed: { areaSqM: 20 },
      }],
      openings: [{
        id: "opening-1",
        type: "door",
        typeRef: "door-900",
        wallId: "wall-1",
        positionAlongWallMm: 1000,
        widthMm: 900,
        heightMm: 2100,
        sillHeightMm: 0,
        swing: "inward",
      }],
    };

    expect(validateDesignFloorJson(source)).toBe(true);
    expect(importDesignFloorJson(source)).toMatchObject({
      id: "studio-plan",
      rooms: [{ id: "room-1", vertices: source.rooms[0].verticesMm, area: 20 }],
      doors: [{ wallId: "wall-1", position: { x: 1000, y: 0 }, swing: "left" }],
    });
  });

  it("creates explicitly approximate editable geometry from a rendering brief", () => {
    const renderingBrief = {
      task: "generate_3d_floor_plan_visualization",
      project: { name: "One Bedroom Apartment", preserve_layout: true },
      rooms: [{ id: "bedroom", name: "Bedroom", dimensions: "12'6\" x 11'8\"", location: "upper-left" }],
    };

    expect(validateDesignFloorJson(renderingBrief)).toBe(true);
    expect(importDesignFloorJson(renderingBrief)).toMatchObject({
      name: "One Bedroom Apartment (approximate layout)",
      rooms: [{ id: "bedroom", name: "Bedroom" }],
      doors: [],
      windows: [],
    });
  });
});
