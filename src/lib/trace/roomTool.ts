/**
 * Room drawing state machine.
 * Manages room drawing workflow: start → update → finish/cancel.
 * Stores internal state, snaps to grid, validates room size.
 */

import { useFloorPlanStore } from '../store/floorPlanStore';
import { snapToGrid } from '../geometry/snap';
import { Canonical, Source } from '../../types/schema';

interface DrawingRoomState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

let drawingState: DrawingRoomState | null = null;

const MIN_ROOM_SIZE = 2000; // mm (2m × 2m minimum)

export function startRoomDraw(x: number, y: number): void {
  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  drawingState = {
    startX: snappedX,
    startY: snappedY,
    currentX: snappedX,
    currentY: snappedY,
  };

  const store = useFloorPlanStore.getState();
  store.setDrawingRoom({
    x: snappedX,
    y: snappedY,
    width: 0,
    height: 0,
  });
}

export function updateRoomDraw(x: number, y: number): void {
  if (!drawingState) return;

  const snappedX = snapToGrid(x);
  const snappedY = snapToGrid(y);

  drawingState.currentX = snappedX;
  drawingState.currentY = snappedY;

  const width = Math.abs(snappedX - drawingState.startX);
  const height = Math.abs(snappedY - drawingState.startY);

  const store = useFloorPlanStore.getState();
  store.setDrawingRoom({
    x: Math.min(drawingState.startX, snappedX),
    y: Math.min(drawingState.startY, snappedY),
    width,
    height,
  });
}

export function finishRoomDraw(): void {
  if (!drawingState) return;

  const width = Math.abs(drawingState.currentX - drawingState.startX);
  const height = Math.abs(drawingState.currentY - drawingState.startY);

  // Validate minimum room size
  if (width < MIN_ROOM_SIZE || height < MIN_ROOM_SIZE) {
    cancelRoomDraw();
    return;
  }

  const store = useFloorPlanStore.getState();
  const room: Canonical.Room = {
    id: `room_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    label: 'Room',
    vertices: [
      { x: Math.min(drawingState.startX, drawingState.currentX), y: Math.min(drawingState.startY, drawingState.currentY) },
      { x: Math.max(drawingState.startX, drawingState.currentX), y: Math.min(drawingState.startY, drawingState.currentY) },
      { x: Math.max(drawingState.startX, drawingState.currentX), y: Math.max(drawingState.startY, drawingState.currentY) },
      { x: Math.min(drawingState.startX, drawingState.currentX), y: Math.max(drawingState.startY, drawingState.currentY) },
    ],
    boundingWallIds: [],
    area: width * height,
    confidence: 1,
    source: Source.USER,
  };

  store.addRoom(room);
  cancelRoomDraw();
}

export function cancelRoomDraw(): void {
  drawingState = null;
  const store = useFloorPlanStore.getState();
  store.clearDrawingRoom();
}
