/**
 * 2D Canvas Editor (Konva.js)
 * Subscribes to Zustand store for read, pushes edits back to store.
 *
 * User interactions:
 * - Click once to start and again to place walls (default tool)
 * - R key: room draw tool (click → drag preview → click to place)
 * - Click wall/room to select; right-click to delete
 * - Drag wall endpoint to resize
 * - Escape cancels in-progress room draw
 */

import React, { useRef, useState, useCallback, useEffect } from "react";
import { Stage, Layer, Line, Rect, Text, Circle, Group } from "react-konva";
import Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { useFloorPlanStore, useCurrentFloor, useSelection } from "../../lib/store/floorPlanStore";
import { GRID_SIZE, snapToGrid, ENDPOINT_SNAP_DISTANCE } from "../../lib/geometry/snap";
import {
  startRoomDraw,
  updateRoomDraw,
  finishRoomDraw,
  cancelRoomDraw,
} from "../../lib/trace/roomTool";
import { Canonical } from "../../types/schema";
import { GridComponent } from "./GridComponent";
import { StatusBar } from "./StatusBar";

// ============================================================================
// CONSTANTS
// ============================================================================

const WALL_STROKE_WIDTH = 3;
const WALL_COLOR = "#333";
const WALL_SELECTED_COLOR = "#00ff00";
const OPENING_RADIUS = 8;
const ROOM_STROKE_WIDTH = 1;
const ROOM_HOVER_FILL = "#22c55e55";
const ROOM_SELECTED_FILL = "#ffff0055";
const ROOM_DEFAULT_FILL = "#cccccc55";

type EditorTool = "wall" | "room";

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
  /** Reserved for the Trace image baseline integration. */
  ghostImageUrl?: string;
  ghostImageBlur?: boolean;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  width = 800,
  height = 600,
}) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tool, setTool] = useState<EditorTool>("wall");
  const [drawing, setDrawing] = useState<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
  });

  const floor = useCurrentFloor();
  const selection = useSelection();
  const drawingRoom = useFloorPlanStore((state) => state.drawingRoom);
  const hoveredElementId = useFloorPlanStore((state) => state.hoveredElementId);
  const ghostFloor = useFloorPlanStore((state) => state.ghostFloor);
  const ghostOpacity = useFloorPlanStore((state) => state.ghostOpacity);
  const {
    drawWall,
    resizeWall,
    deleteWall,
    deleteRoom,
    selectElement,
    deselectElement,
    setHoveredElement,
    validateFloor,
  } = useFloorPlanStore(
    useShallow((state) => ({
      drawWall: state.drawWall,
      resizeWall: state.resizeWall,
      deleteWall: state.deleteWall,
      deleteRoom: state.deleteRoom,
      selectElement: state.selectElement,
      deselectElement: state.deselectElement,
      setHoveredElement: state.setHoveredElement,
      validateFloor: state.validateFloor,
    }))
  );

  // R → room tool; Escape → cancel room draw / return to wall tool
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
        setTool("room");
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        cancelRoomDraw();
        setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
        setTool("wall");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const getSnappedPointer = useCallback(() => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return null;
    return { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
  }, []);

  const snapPoint = (point: { x: number; y: number }) => {
    if (!floor) return point;
    const endpoint = floor.walls
      .flatMap((wall) => [wall.start, wall.end])
      .find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= ENDPOINT_SNAP_DISTANCE);
    return endpoint ? { ...endpoint } : point;
  };

  if (!floor) {
    return <div>No floor loaded</div>;
  }

  // ========================================================================
  // MOUSE HANDLERS
  // ========================================================================

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const gridPoint = getSnappedPointer();
    if (!gridPoint) return;

    if (tool === "room") {
      if (!drawingRoom) {
        startRoomDraw(gridPoint.x, gridPoint.y);
        deselectElement();
      } else {
        finishRoomDraw();
        validateFloor();
      }
      return;
    }

    const snappedPoint = snapPoint(gridPoint);

    if (!drawing.isDrawing) {
      setDrawing({
        isDrawing: true,
        startPoint: snappedPoint,
        currentPoint: snappedPoint,
      });
      deselectElement();
    } else {
      if (drawing.startPoint) {
        drawWall(drawing.startPoint, snappedPoint);
        validateFloor();
      }
      setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
    }
  };

  const handleStageMouseMove = () => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;

    if (tool === "room" && drawingRoom) {
      updateRoomDraw(pos.x, pos.y);
      return;
    }

    if (drawing.isDrawing) {
      setDrawing((prev) => ({
        ...prev,
        currentPoint: { x: pos.x, y: pos.y },
      }));
    }
  };

  const handleWallClick = (wallId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    if (e.evt.button === 2) {
      deleteWall(wallId);
      validateFloor();
    } else {
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
    if (e.evt.button === 2) {
      deleteRoom(roomId);
      validateFloor();
      return;
    }
    selectElement(roomId, "room");
  };

  const handleRoomMouseEnter = (roomId: string) => {
    setHoveredElement(roomId);
  };

  const handleRoomMouseLeave = () => {
    setHoveredElement(null);
  };

  const handleEndpointDrag = (wallId: string, isStart: boolean, pos: { x: number; y: number }) => {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) return;

    const snappedPos = {
      x: snapToGrid(pos.x),
      y: snapToGrid(pos.y),
    };

    const newStart = isStart ? snappedPos : wall.start;
    const newEnd = isStart ? wall.end : snappedPos;

    resizeWall(wallId, newStart, newEnd);
    validateFloor();
  };

  const statusLabel =
    tool === "room"
      ? drawingRoom
        ? "Drawing room… (click to place, Esc to cancel)"
        : "Room tool (click to start, Esc for wall tool)"
      : drawing.isDrawing
        ? "Drawing wall… (click to end)"
        : "Wall tool — press R for rooms";
  const totalAreaMm2 = floor.rooms.reduce((total, room) => total + room.area, 0);

  // ========================================================================
  // RENDER
  // ========================================================================

  return (
    <div data-testid="floor-plan-2d" style={{ border: "1px solid #ccc", overflow: "hidden" }}>
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        onMouseDown={handleStageClick}
        onMouseMove={handleStageMouseMove}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          <GridComponent width={width} height={height} />

          {ghostFloor &&
            ghostOpacity > 0 &&
            ghostFloor.walls.map((wall) => (
              <Line
                key={`ghost-wall_${wall.id}`}
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke="#2563eb"
                strokeWidth={WALL_STROKE_WIDTH + 1}
                opacity={ghostOpacity}
                dash={[8, 5]}
                listening={false}
              />
            ))}

          {/* Room draw preview — behind finished room polygons */}
          {drawingRoom && drawingRoom.width > 0 && drawingRoom.height > 0 && (
            <Rect
              x={drawingRoom.x}
              y={drawingRoom.y}
              width={drawingRoom.width}
              height={drawingRoom.height}
              stroke="#22c55e"
              strokeWidth={2}
              dash={[8, 4]}
              fill="rgba(34, 197, 94, 0.3)"
              listening={false}
            />
          )}

          {floor.rooms.map((room) => (
            <RoomPolygon
              key={`room_${room.id}`}
              room={room}
              isSelected={selection.selectedElementId === room.id}
              isHovered={hoveredElementId === room.id}
              onClick={(e) => handleRoomClick(room.id, e)}
              onMouseEnter={() => handleRoomMouseEnter(room.id)}
              onMouseLeave={handleRoomMouseLeave}
            />
          ))}

          {floor.walls.map((wall) => (
            <Group key={`wall_${wall.id}`}>
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke={selection.selectedElementId === wall.id ? WALL_SELECTED_COLOR : WALL_COLOR}
                strokeWidth={WALL_STROKE_WIDTH}
                onClick={(e) => handleWallClick(wall.id, e)}
                onMouseEnter={() => handleWallMouseEnter(wall.id)}
                onMouseLeave={handleWallMouseLeave}
                hitStrokeWidth={10}
              />

              <DraggableEndpoint
                x={wall.start.x}
                y={wall.start.y}
                onDrag={(pos) => handleEndpointDrag(wall.id, true, pos)}
              />
              <DraggableEndpoint
                x={wall.end.x}
                y={wall.end.y}
                onDrag={(pos) => handleEndpointDrag(wall.id, false, pos)}
              />

              {floor.openings
                .filter((o) => o.hostWallId === wall.id)
                .map((opening) => {
                  const dx = wall.end.x - wall.start.x;
                  const dy = wall.end.y - wall.start.y;
                  const len = Math.hypot(dx, dy) || 1;
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

          {drawing.isDrawing && drawing.startPoint && drawing.currentPoint && (
            <Line
              points={[
                drawing.startPoint.x,
                drawing.startPoint.y,
                drawing.currentPoint.x,
                drawing.currentPoint.y,
              ]}
              stroke="#ff6600"
              strokeWidth={2}
              dash={[5, 5]}
            />
          )}
        </Layer>
      </Stage>

      <StatusBar
        wallCount={floor.walls.length}
        roomCount={floor.rooms.length}
        totalAreaMm2={totalAreaMm2}
        statusLabel={statusLabel}
      />
    </div>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface RoomPolygonProps {
  room: Canonical.Room;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

const RoomPolygon: React.FC<RoomPolygonProps> = ({
  room,
  isSelected,
  isHovered,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const points = room.vertices.flatMap((v) => [v.x, v.y]);
  const fill = isSelected ? ROOM_SELECTED_FILL : isHovered ? ROOM_HOVER_FILL : ROOM_DEFAULT_FILL;
  const stroke = isSelected ? "#ffff00" : isHovered ? "#22c55e" : "#999";

  return (
    <Group
      onMouseDown={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Line
        points={points}
        closed
        fill={fill}
        stroke={stroke}
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
  onDrag: (pos: { x: number; y: number }) => void;
}

const DraggableEndpoint: React.FC<DraggableEndpointProps> = ({ x, y, onDrag }) => {
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
