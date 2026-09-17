/**
 * Pan and zoom utilities for 2D canvas.
 */

export interface ViewState {
  panX: number;
  panY: number;
  scale: number; // 1.0 = 100%
}

export const DEFAULT_VIEW: ViewState = { panX: 0, panY: 0, scale: 1 };

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

export function panView(view: ViewState, deltaX: number, deltaY: number): ViewState {
  return {
    ...view,
    panX: view.panX + deltaX,
    panY: view.panY + deltaY,
  };
}

/**
 * Zoom relative to an optional screen-space center (defaults to origin).
 * `zoomDelta` > 0 zooms in; < 0 zooms out. Typical wheel step: ±0.1.
 */
export function zoomView(
  view: ViewState,
  zoomDelta: number,
  centerX = 0,
  centerY = 0
): ViewState {
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * (1 + zoomDelta)));
  if (nextScale === view.scale) return view;

  // Keep the world point under the cursor fixed while scale changes.
  const worldX = (centerX - view.panX) / view.scale;
  const worldY = (centerY - view.panY) / view.scale;

  return {
    scale: nextScale,
    panX: centerX - worldX * nextScale,
    panY: centerY - worldY * nextScale,
  };
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  view: ViewState
): { x: number; y: number } {
  return {
    x: (screenX - view.panX) / view.scale,
    y: (screenY - view.panY) / view.scale,
  };
}

export function worldToScreen(
  worldX: number,
  worldY: number,
  view: ViewState
): { x: number; y: number } {
  return {
    x: worldX * view.scale + view.panX,
    y: worldY * view.scale + view.panY,
  };
}
