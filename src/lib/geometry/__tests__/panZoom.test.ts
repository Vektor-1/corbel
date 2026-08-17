import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIEW,
  panView,
  screenToWorld,
  worldToScreen,
  zoomView,
} from "../panZoom";

describe("panZoom", () => {
  it("pans by screen deltas", () => {
    expect(panView(DEFAULT_VIEW, 40, -20)).toEqual({ panX: 40, panY: -20, scale: 1 });
  });

  it("zooms about a screen center and keeps that world point fixed", () => {
    const view = zoomView(DEFAULT_VIEW, 1, 100, 50); // scale → 2
    expect(view.scale).toBe(2);
    expect(screenToWorld(100, 50, view)).toEqual({ x: 100, y: 50 });
  });

  it("round-trips screen and world coordinates", () => {
    const view = panView(zoomView(DEFAULT_VIEW, 0.5, 0, 0), 30, 10);
    const world = { x: 400, y: 200 };
    const screen = worldToScreen(world.x, world.y, view);
    expect(screenToWorld(screen.x, screen.y, view).x).toBeCloseTo(world.x);
    expect(screenToWorld(screen.x, screen.y, view).y).toBeCloseTo(world.y);
  });
});
