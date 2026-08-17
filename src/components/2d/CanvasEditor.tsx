/**
 * 2D Canvas Editor (Konva.js)
 * Day 2: pan (Space+drag), zoom (Ctrl+scroll), StatusBar, green selection.
 */

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Stage, Layer, Line, Rect, Text, Circle, Group, Image as KonvaImage } from "react-konva";
import Konva from "konva";
import { useShallow } from "zustand/react/shallow";
import { useFloorPlanStore, useCurrentFloor, useSelection } from "../../lib/store/floorPlanStore";
import { GRID_SIZE, snapToGrid, ENDPOINT_SNAP_DISTANCE } from "../../lib/geometry/snap";
import {
  DEFAULT_VIEW,
  panView,
  screenToWorld,
  zoomView,
  type ViewState,
} from "../../lib/geometry/panZoom";
import {
  startRoomDraw,
  updateRoomDraw,
  finishRoomDraw,
  cancelRoomDraw,
} from "../../lib/trace/roomTool";
import { StatusBar } from "./StatusBar";
import { Canonical } from "../../types/schema";

const WALL_STROKE_WIDTH = 3;
const WALL_COLOR = "#333";
const WALL_SELECTED_COLOR = "#00ff00";
const OPENING_RADIUS = 8;
const ROOM_STROKE_WIDTH = 1;
const ROOM_HOVER_FILL = "#22c55e55";
const ROOM_SELECTED_FILL = "#00ff0055";
const ROOM_DEFAULT_FILL = "#cccccc55";

type EditorTool = "wall" | "room";

interface DrawingState {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoint: { x: number; y: number } | null;
}

interface CanvasEditorProps {
  width?: number;
  height?: number;
  ghostImageUrl?: string;
  ghostImageBlur?: boolean;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  width = 800,
  height = 600,
  ghostImageUrl,
  ghostImageBlur = false,
}) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [tool, setTool] = useState<EditorTool>("wall");
  const [drawing, setDrawing] = useState<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoint: null,
  });
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [spaceDown, setSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const lastPanPoint = useRef<{ x: number; y: number } | null>(null);
  const [ghostImage, setGhostImage] = useState<HTMLImageElement | null>(null);

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

  useEffect(() => {
    if (!ghostImageUrl) {
      setGhostImage(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setGhostImage(img);
    img.onerror = () => console.error(`Failed to load ghost image: ${ghostImageUrl}`);
    img.src = ghostImageUrl;
  }, [ghostImageUrl]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setSpaceDown(true);
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
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpaceDown(false);
        setIsPanning(false);
        lastPanPoint.current = null;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const pointerWorld = useCallback(() => {
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return null;
    const world = screenToWorld(pos.x, pos.y, view);
    return { x: snapToGrid(world.x), y: snapToGrid(world.y), raw: world, screen: pos };
  }, [view]);

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

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    if (!(e.evt.ctrlKey || e.evt.metaKey)) return;
    const pos = stageRef.current?.getPointerPosition();
    if (!pos) return;
    const zoomDelta = e.evt.deltaY < 0 ? 0.1 : -0.1;
    setView((prev) => zoomView(prev, zoomDelta, pos.x, pos.y));
  };

  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = stageRef.current?.getPointerPosition();
    if (spaceDown && pos) {
      setIsPanning(true);
      lastPanPoint.current = pos;
      return;
    }

    // Ignore bubbled shape clicks for empty-stage draw starts
    if (e.target !== e.target.getStage()) return;

    const ptr = pointerWorld();
    if (!ptr) return;
    const gridPoint = { x: ptr.x, y: ptr.y };

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
      setDrawing({ isDrawing: true, startPoint: snappedPoint, currentPoint: snappedPoint });
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

    if (isPanning && lastPanPoint.current) {
      const dx = pos.x - lastPanPoint.current.x;
      const dy = pos.y - lastPanPoint.current.y;
      lastPanPoint.current = pos;
      setView((prev) => panView(prev, dx, dy));
      return;
    }

    const world = screenToWorld(pos.x, pos.y, view);

    if (tool === "room" && drawingRoom) {
      updateRoomDraw(world.x, world.y);
      return;
    }

    if (drawing.isDrawing) {
      setDrawing((prev) => ({ ...prev, currentPoint: world }));
    }
  };

  const handleStageMouseUp = () => {
    setIsPanning(false);
    lastPanPoint.current = null;
  };

  const handleWallClick = (wallId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (spaceDown) return;
    if (e.evt.button === 2) {
      deleteWall(wallId);
      validateFloor();
    } else {
      selectElement(wallId, "wall");
    }
  };

  const handleRoomClick = (roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (spaceDown) return;
    if (e.evt.button === 2) {
      deleteRoom(roomId);
      validateFloor();
      return;
    }
    selectElement(roomId, "room");
  };

  const handleEndpointDrag = (wallId: string, isStart: boolean, pos: { x: number; y: number }) => {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) return;
    const snappedPos = { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
    resizeWall(wallId, isStart ? snappedPos : wall.start, isStart ? wall.end : snappedPos);
    validateFloor();
  };

  const statusLabel = isPanning || spaceDown
    ? "Pan (Space + drag) — Ctrl+scroll to zoom"
    : tool === "room"
      ? drawingRoom
        ? "Drawing room… (click to place, Esc to cancel)"
        : "Room tool (click to start, Esc for wall tool)"
      : drawing.isDrawing
        ? "Drawing wall… (click to end)"
        : "Wall tool — R rooms · Space pan · Ctrl+scroll zoom";

  const totalAreaMm2 = floor.rooms.reduce((total, room) => total + room.area, 0);

  return (
    <div
      data-testid="floor-plan-2d"
      style={{
        border: "1px solid #ccc",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        cursor: spaceDown || isPanning ? "grab" : "default",
      }}
    >
      <Stage
        ref={stageRef}
        width={width}
        height={height}
        x={view.panX}
        y={view.panY}
        scaleX={view.scale}
        scaleY={view.scale}
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onMouseLeave={handleStageMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.evt.preventDefault()}
      >
        <Layer>
          {ghostImage && (
            <KonvaImage
              image={ghostImage}
              x={0}
              y={0}
              width={width}
              height={height}
              opacity={0.5}
              filters={ghostImageBlur ? [Konva.Filters.Blur] : []}
              blurRadius={ghostImageBlur ? 8 : 0}
              listening={false}
            />
          )}

          <Grid cellSize={GRID_SIZE} width={Math.max(width, 4000)} height={Math.max(height, 4000)} />

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
              onClick={(ev) => handleRoomClick(room.id, ev)}
              onMouseEnter={() => setHoveredElement(room.id)}
              onMouseLeave={() => setHoveredElement(null)}
            />
          ))}

          {floor.walls.map((wall) => (
            <Group key={`wall_${wall.id}`}>
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke={selection.selectedElementId === wall.id ? WALL_SELECTED_COLOR : WALL_COLOR}
                strokeWidth={WALL_STROKE_WIDTH}
                onClick={(ev) => handleWallClick(wall.id, ev)}
                onMouseEnter={() => setHoveredElement(wall.id)}
                onMouseLeave={() => setHoveredElement(null)}
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
                  return (
                    <Circle
                      key={`opening_${opening.id}`}
                      x={wall.start.x + t * dx}
                      y={wall.start.y + t * dy}
                      radius={OPENING_RADIUS}
                      fill={opening.kind === "door" ? "#8B4513" : "#87CEEB"}
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

const Grid: React.FC<{ cellSize: number; width: number; height: number }> = ({
  cellSize,
  width,
  height,
}) => {
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
  return <Group listening={false}>{lines}</Group>;
};

const RoomPolygon: React.FC<{
  room: Canonical.Room;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({ room, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) => {
  const points = room.vertices.flatMap((v) => [v.x, v.y]);
  const fill = isSelected ? ROOM_SELECTED_FILL : isHovered ? ROOM_HOVER_FILL : ROOM_DEFAULT_FILL;
  const stroke = isSelected || isHovered ? "#00ff00" : "#999";

  return (
    <Group onMouseDown={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <Line points={points} closed fill={fill} stroke={stroke} strokeWidth={ROOM_STROKE_WIDTH} />
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

const DraggableEndpoint: React.FC<{
  x: number;
  y: number;
  onDrag: (pos: { x: number; y: number }) => void;
}> = ({ x, y, onDrag }) => (
  <Circle
    x={x}
    y={y}
    radius={4}
    fill="#666"
    draggable
    onDragEnd={(e) => onDrag({ x: e.target.x(), y: e.target.y() })}
    hitStrokeWidth={8}
  />
);
