/**
 * Zustand middleware for automatic wall snapping and joint constraints
 */

import { StateCreator } from 'zustand';
import {
  snapPoint,
  applyJointConstraints,
  canConnectWalls,
} from '@/lib/geometry/wall-snapping';

export function createSnappingMiddleware<T extends { currentFloor: any; moveWall: (wallId: string, delta: { x: number; y: number }) => void }>(
  config: StateCreator<T>
): StateCreator<T> {
  return (set, get, api) => {
    const base = config(set, get, api) as T;

    return {
      ...base,
      moveWall: (wallId: string, delta: { x: number; y: number }) => {
        const state = get();
        if (!state.currentFloor) return;

        // Call original moveWall
        const originalMoveWall = (base as any).moveWall;
        if (originalMoveWall) originalMoveWall(wallId, delta);

        // Apply snapping and constraints
        const updatedState = get();
        if (updatedState.currentFloor) {
          // Snap endpoints to nearby points
          const wall = updatedState.currentFloor.walls.find((w: any) => w.id === wallId);
          if (wall) {
            const snappedStart = snapPoint(wall.start.x, wall.start.y, updatedState.currentFloor);
            const snappedEnd = snapPoint(wall.end.x, wall.end.y, updatedState.currentFloor);

            let updated = updatedState.currentFloor;
            if (snappedStart.snapped || snappedEnd.snapped) {
              updated = {
                ...updated,
                walls: updated.walls.map((w: any) =>
                  w.id === wallId
                    ? {
                        ...w,
                        start: snappedStart.snapped
                          ? { x: snappedStart.x, y: snappedStart.y }
                          : w.start,
                        end: snappedEnd.snapped ? { x: snappedEnd.x, y: snappedEnd.y } : w.end,
                      }
                    : w
                ),
              };
            }

            // Apply joint constraints
            updated = applyJointConstraints(updated, wallId, 'start');
            updated = applyJointConstraints(updated, wallId, 'end');

            set({ currentFloor: updated } as any);
          }
        }
      },

      resizeWall: (wallId: string, newStart: { x: number; y: number }, newEnd: { x: number; y: number }) => {
        const state = get();
        if (!state.currentFloor) return;

        // Snap new endpoints
        const snappedStart = snapPoint(newStart.x, newStart.y, state.currentFloor);
        const snappedEnd = snapPoint(newEnd.x, newEnd.y, state.currentFloor);

        // Call original resizeWall with snapped values
        (base as any).resizeWall(
          wallId,
          snappedStart.snapped ? { x: snappedStart.x, y: snappedStart.y } : newStart,
          snappedEnd.snapped ? { x: snappedEnd.x, y: snappedEnd.y } : newEnd
        );

        // Apply joint constraints
        const updatedState = get();
        if (updatedState.currentFloor) {
          let updated = applyJointConstraints(updatedState.currentFloor, wallId, 'start');
          updated = applyJointConstraints(updated, wallId, 'end');

          set((() => ({
            currentFloor: updated,
          })) as any);
        }
      },

      drawWall: (start: { x: number; y: number }, end: { x: number; y: number }, thickness?: number) => {
        const state = get();
        if (!state.currentFloor) return '';

        // Snap endpoints before drawing
        const snappedStart = snapPoint(start.x, start.y, state.currentFloor);
        const snappedEnd = snapPoint(end.x, end.y, state.currentFloor);

        // Call original drawWall with snapped values
        const wallId = (base as any).drawWall(
          snappedStart.snapped ? { x: snappedStart.x, y: snappedStart.y } : start,
          snappedEnd.snapped ? { x: snappedEnd.x, y: snappedEnd.y } : end,
          thickness
        );

        // Validate connection
        const updatedState = get();
        if (updatedState.currentFloor) {
          const newWall = updatedState.currentFloor.walls.find((w: any) => w.id === wallId);
          if (newWall) {
            // Check for possible T-junctions or crosses
            const possibleConnections = updatedState.currentFloor.walls.filter(
              (w: any) => w.id !== wallId && canConnectWalls(w, newWall)
            );

            // Apply joint constraints
            let updated = updatedState.currentFloor;
            updated = applyJointConstraints(updated, wallId, 'start');
            updated = applyJointConstraints(updated, wallId, 'end');

            (set as any)(() => ({
              currentFloor: updated,
            }));
          }
        }

        return wallId;
      },
    };
  };
}
