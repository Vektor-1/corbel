/**
 * 2D Canvas Editor (Konva.js)
 * Subscribes to Zustand store for read, pushes edits back to store.
 *
 * User interactions:
 * - Click and drag to draw walls
 * - Click wall to select (highlights green in 3D)
 * - Drag wall endpoint to resize
 * - Right-click wall to delete
 * - Double-click room to label
 */

import React, { useRef, useEffect, useState } from "react";
import { Stage, Layer, Line, Rect, Text, Circle, Group } from "react-konva";
import Konva from "konva";
import { useFloorPlanStore, useCurrentFloor, useSelection } from "../../lib/store/floorPlanStore";
import { Canonical } from "../../types/schema";

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE = 100; // mm
const WALL_STROKE_WIDTH = 3;
const WALL_COLOR = "#333";
const WALL_SELECTED_COLOR = "#00ff00";
const OPENING_RADIUS = 8;
const ROOM_FILL_OPACITY = 0.1;
const ROOM_STROKE_WIDTH = 1;

// ============================================================================
// WALL DRAWING STATE
// ============================================================================

interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number } | null;
}

// ============================================================================
// EDITOR COMPONENT
// ============================================================================

interface CanvasEditorProps {
  width?: number;
  height?: number;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ width = 800, height = 600 }) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [drawing, setDrawing] = useState<DrawingState>({ isDrawing: false, startPoint: null, currentPoint: null });

  const floor = useCurrentFloor();
  const selection = useSelection();
  const {
    drawWall,
    moveWall,
    deleteWall,
    selectElement,
    deselectElement,
    setHoveredElement,
    validateFloor,
    placeOpening,
  } = useFloorPlanStore((state) => ({
    drawWall: state.drawWall,
    moveWall: state.moveWall,
    deleteWall: state.deleteWall,
    selectElement: state.selectElement,
    deselectElement: state.deselectElement,
    setHoveredElement: state.setHoveredElement,
    validateFloor: state.validateFloor,
    placeOpening: state.placeOpening,
  }));

  if (!floor) {
    return <div>No floor loaded</div>;
  }

  // ========================================================================
  // MOUSE HANDLERS
  // ========================================================================

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;

    // Snap to grid
    const snappedX = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(pos.y / GRID_SIZE) * GRID_SIZE;

    if (!drawing.isDrawing) {
      // Start new wall
      setDrawing({
        isDrawing: true,
        startPoint: { x: snappedX, y: snappedY },
        currentPoint: { x: snappedX, y: snappedY },
      });
      deselectElement();
    } else {
      // End wall
      if (drawing.startPoint) {
        drawWall(drawing.startPoint, { x: snappedX, y: snappedY });
        validateFloor();
      }
      setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
    }
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;

    if (drawing.isDrawing) {
      // Update preview line as user drags
      setDrawing((prev) => ({
        ...prev,
        currentPoint: { x: pos.x, y: pos.y },
      }));
    }
  };

  const handleWallClick = (wallId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    if (e.evt.button === 2) {
      // Right-click: delete
      deleteWall(wallId);
      validateFloor();
    } else {
      // Left-click: select
      selectElement(wallId, "wall");
    }
  };

  const handleWallMouseEnter = (wallId: string) => {
    setHoveredElement(wallId);
  };

  const handleWallMouseLeave = () => {
    setHoveredElement(null);
  };

  const handleRoomClick = (roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    selectElement(roomId, "room");
  };

  const handleEndpointDrag = (wallId: string, isStart: boolean, pos: { x: number; y: number }) => {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) return;

    const snappedPos = {
      x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
      y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
    };

    const newStart = isStart ? snappedPos : wall.start;
    const newEnd = isStart ? wall.end : snappedPos;

    moveWall(wallId, { x: newStart.x - wall.start.x, y: newStart.y - wall.start.y });
    validateFloor();
  };

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div style={{ border: "1px solid #ccc", overflow: "hidden" }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleStageClick}
        onMouseMove={handleStageMouseMove}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          {/* Grid background */}
          <Grid cellSize={GRID_SIZE} width={width} height={height} />

          {/* Render room polygons */}
          {floor.rooms.map((room) => (
            <RoomPolygon
              key={`room_${room.id}`}
              room={room}
              isSelected={selection.selectedElementId === room.id}
              onClick={() => handleRoomClick(room.id, {} as any)}
            />
          ))}

          {/* Render walls */}
          {floor.walls.map((wall) => (
            <Group key={`wall_${wall.id}`}>
              {/* Wall line */}
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke={selection.selectedElementId === wall.id ? WALL_SELECTED_COLOR : WALL_COLOR}
                strokeWidth={WALL_STROKE_WIDTH}
                onClick={() => handleWallClick(wall.id, {} as any)}
                onMouseEnter={() => handleWallMouseEnter(wall.id)}
                onMouseLeave={handleWallMouseLeave}
                hitStrokeWidth={10} // Wider hit area
              />

              {/* Wall endpoints (draggable to resize) */}
              <DraggableEndpoint
                x={wall.start.x}
                y={wall.start.y}
                wallId={wall.id}
                isStart={true}
                onDrag={(pos) => handleEndpointDrag(wall.id, true, pos)}
              />
              <DraggableEndpoint
                x={wall.end.x}
                y={wall.end.y}
                wallId={wall.id}
                isStart={false}
                onDrag={(pos) => handleEndpointDrag(wall.id, false, pos)}
              />

              {/* Openings on this wall */}
              {floor.openings
                .filter((o) => o.hostWallId === wall.id)
                .map((opening) => {
                  const dx = wall.end.x - wall.start.x;
                  const dy = wall.end.y - wall.start.y;
                  const len = Math.hypot(dx, dy);
                  const t = opening.positionAlongWall / len;
                  const x = wall.start.x + t * dx;
                  const y = wall.start.y + t * dy;

                  const color = opening.kind === "door" ? "#8B4513" : "#87CEEB";

                  return (
                    <Circle
                      key={`opening_${opening.id}`}
                      x={x}
                      y={y}
                      radius={OPENING_RADIUS}
                      fill={color}
                      opacity={0.7}
                    />
                  );
                })}
            </Group>
          ))}

          {/* Preview line while drawing */}
          {drawing.isDrawing && drawing.startPoint && drawing.currentPoint && (
            <Line
              points={[drawing.startPoint.x, drawing.startPoint.y, drawing.currentPoint.x, drawing.currentPoint.y]}
              stroke="#ff6600"
              strokeWidth={2}
              dash={[5, 5]}
            />
          )}
        </Layer>
      </Stage>

      {/* Info panel */}
      <div style={{ padding: "10px", fontSize: "12px", backgroundColor: "#f5f5f5" }}>
        <div>Walls: {floor.walls.length} | Rooms: {floor.rooms.length} | Openings: {floor.openings.length}</div>
        <div>Status: {drawing.isDrawing ? "Drawing wall... (click to end)" : "Click to start drawing wall"}</div>
        {selection.selectedElementId && <div>Selected: {selection.selectedElementKind} {selection.selectedElementId}</div>}
      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface GridProps {
  cellSize: number;
  width: number;
  height: number;
}

const Grid: React.FC<GridProps> = ({ cellSize, width, height }) => {
  const lines = [];

  for (let x = 0; x < width; x += cellSize) {
    lines.push(
      <Line key={`v_${x}`} points={[x, 0, x, height]} stroke="#ddd" strokeWidth={0.5} opacity={0.3} />
    );
  }

  for (let y = 0; y < height; y += cellSize) {
    lines.push(
      <Line key={`h_${y}`} points={[0, y, width, y]} stroke="#ddd" strokeWidth={0.5} opacity={0.3} />
    );
  }

  return <Group>{lines}</Group>;
};

interface RoomPolygonProps {
  room: Canonical.Room;
  isSelected: boolean;
  onClick: () => void;
}

const RoomPolygon: React.FC<RoomPolygonProps> = ({ room, isSelected, onClick }) => {
  const points = room.vertices.flatMap((v) => [v.x, v.y]);

  return (
    <Group onClick={onClick}>
      <Line
        points={points}
        closed
        fill={isSelected ? "#ffff0055" : "#cccccc55"}
        stroke={isSelected ? "#ffff00" : "#999"}
        strokeWidth={ROOM_STROKE_WIDTH}
      />
      {room.label && (
        <Text
          x={room.vertices[0]?.x ?? 0}
          y={room.vertices[0]?.y ?? 0}
          text={room.label}
          fontSize={12}
          fill="#333"
        />
      )}
    </Group>
  );
};

interface DraggableEndpointProps {
  x: number;
  y: number;
  wallId: string;
  isStart: boolean;
  onDrag: (pos: { x: number; y: number }) => void;
}

const DraggableEndpoint: React.FC<DraggableEndpointProps> = ({ x, y, wallId, isStart, onDrag }) => {
  return (
    <Circle
      x={x}
      y={y}
      radius={4}
      fill="#666"
      draggable
      onDragEnd={(e) => {
        onDrag({ x: e.target.x(), y: e.target.y() });
      }}
      hitStrokeWidth={8}
    />
  );
};
