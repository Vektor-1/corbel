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
import { getFeatureFlag } from "../../lib/flags";
import { StatusBar } from "./StatusBar";
import { Canonical } from "../../types/schema";
import { OPENING_CONFIDENCE_THRESHOLD, WALL_CONFIDENCE_THRESHOLD } from "../../lib/trace/confidence";

const WALL_STROKE_WIDTH = 3;
const WALL_COLOR = "#333";
const WALL_SELECTED_COLOR = "#00ff00";
const LOW_CONFIDENCE_COLOR = "#d97706";
const OPENING_RADIUS = 8;
const ROOM_STROKE_WIDTH = 1;
const ROOM_HOVER_FILL = "#22c55e55";
const ROOM_SELECTED_FILL = "#00ff0055";
const ROOM_DEFAULT_FILL = "#cccccc55";

type EditorTool = "wall" | "room" | "door" | "window";

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [containerSize, setContainerSize] = useState({ width, height });
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
    placeOpening,
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
      placeOpening: state.placeOpening,
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
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier && e.key === "z" && !e.shiftKey && getFeatureFlag("undoRedo")) {
        e.preventDefault();
        const storeWithTemporal = useFloorPlanStore as unknown as {
          temporal: {
            getState: () => { undo: () => void; redo: () => void };
          };
        };
        storeWithTemporal.temporal.getState().undo();
        return;
      }
      if (((modifier && e.key === "z" && e.shiftKey) || (modifier && e.key === "y")) && getFeatureFlag("undoRedo")) {
        e.preventDefault();
        const storeWithTemporal = useFloorPlanStore as unknown as {
          temporal: {
            getState: () => { undo: () => void; redo: () => void };
          };
        };
        storeWithTemporal.temporal.getState().redo();
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

  const handleWallClick = useCallback((wallId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (spaceDown) return;
    if (e.evt.button === 2) {
      deleteWall(wallId);
      validateFloor();
    } else if (tool === "door" || tool === "window") {
      const wall = floor.walls.find((candidate) => candidate.id === wallId);
      const pointer = pointerWorld();
      if (!wall || !pointer) return;

      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.hypot(dx, dy);
      if (length === 0) return;

      const projectedDistance = ((pointer.raw.x - wall.start.x) * dx + (pointer.raw.y - wall.start.y) * dy) / length;
      const openingId = placeOpening(
        tool,
        wallId,
        projectedDistance,
        tool === "door" ? "d-900" : "w-1200"
      );
      if (openingId) {
        selectElement(openingId, "opening");
        validateFloor();
      }
    } else {
      selectElement(wallId, "wall");
    }
  }, [spaceDown, tool, floor.walls, pointerWorld, placeOpening, deleteWall, validateFloor, selectElement]);

  const handleRoomClick = useCallback((roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (spaceDown) return;
    if (e.evt.button === 2) {
      deleteRoom(roomId);
      validateFloor();
      return;
    }
    selectElement(roomId, "room");
  }, [spaceDown, deleteRoom, validateFloor, selectElement]);

  const handleOpeningClick = useCallback((openingId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (spaceDown) return;
    selectElement(openingId, "opening");
  }, [spaceDown, selectElement]);

  const handleEndpointDrag = useCallback((wallId: string, isStart: boolean, pos: { x: number; y: number }) => {
    const wall = floor.walls.find((w) => w.id === wallId);
    if (!wall) return;
    const snappedPos = { x: snapToGrid(pos.x), y: snapToGrid(pos.y) };
    resizeWall(wallId, isStart ? snappedPos : wall.start, isStart ? wall.end : snappedPos);
    validateFloor();
  }, [floor.walls, resizeWall, validateFloor]);

  const setHoveredElementStable = useCallback((elementId: string | null) => {
    setHoveredElement(elementId);
  }, [setHoveredElement]);

  const clearHoveredElementStable = useCallback(() => {
    setHoveredElement(null);
  }, [setHoveredElement]);

  const statusLabel = isPanning || spaceDown
    ? "Pan (Space + drag) — Ctrl+scroll to zoom"
    : tool === "room"
      ? drawingRoom
        ? "Drawing room… (click to place, Esc to cancel)"
        : "Room tool (click to start, Esc for wall tool)"
      : tool === "door" || tool === "window"
        ? `Click a wall to place a ${tool}`
      : drawing.isDrawing
        ? "Drawing wall… (click to end)"
        : "Wall tool — R rooms · Space pan · Ctrl+scroll zoom";

  const totalAreaMm2 = floor.rooms.reduce((total, room) => total + room.area, 0);

  return (
    <div
      ref={containerRef}
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
      <div className="flex flex-wrap gap-1 border-b border-stone-300 bg-stone-50 p-2" role="toolbar" aria-label="Drawing tools">
        {([
          ["wall", "Wall"],
          ["room", "Room"],
          ["door", "Door"],
          ["window", "Window"],
        ] as const).map(([nextTool, label]) => (
          <button
            aria-pressed={tool === nextTool}
            className={`rounded px-2 py-1 text-xs font-medium ${tool === nextTool ? "bg-stone-800 text-white" : "bg-white text-stone-700 ring-1 ring-stone-300"}`}
            key={nextTool}
            onClick={() => {
              setDrawing({ isDrawing: false, startPoint: null, currentPoint: null });
              setTool(nextTool);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <Stage
        ref={stageRef}
        width={containerSize.width}
        height={containerSize.height}
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
              width={containerSize.width}
              height={containerSize.height}
              opacity={0.5}
              filters={ghostImageBlur ? [Konva.Filters.Blur] : []}
              blurRadius={ghostImageBlur ? 8 : 0}
              listening={false}
            />
          )}

          <Grid cellSize={GRID_SIZE} width={Math.max(containerSize.width, 4000)} height={Math.max(containerSize.height, 4000)} />

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
              onClick={handleRoomClick}
              onMouseEnter={setHoveredElementStable}
              onMouseLeave={clearHoveredElementStable}
            />
          ))}

          {floor.walls.map((wall) => (
            <Group key={`wall_${wall.id}`}>
              <Line
                points={[wall.start.x, wall.start.y, wall.end.x, wall.end.y]}
                stroke={selection.selectedElementId === wall.id ? WALL_SELECTED_COLOR : wall.confidence < WALL_CONFIDENCE_THRESHOLD ? LOW_CONFIDENCE_COLOR : WALL_COLOR}
                strokeWidth={WALL_STROKE_WIDTH}
                dash={wall.confidence < WALL_CONFIDENCE_THRESHOLD ? [8, 4] : undefined}
                onClick={(ev) => handleWallClick(wall.id, ev)}
                onMouseEnter={() => setHoveredElementStable(wall.id)}
                onMouseLeave={clearHoveredElementStable}
                hitStrokeWidth={10}
              />
              <DraggableEndpoint
                x={wall.start.x}
                y={wall.start.y}
                wallId={wall.id}
                isStart={true}
                onDrag={handleEndpointDrag}
              />
              <DraggableEndpoint
                x={wall.end.x}
                y={wall.end.y}
                wallId={wall.id}
                isStart={false}
                onDrag={handleEndpointDrag}
              />
              {floor.openings
                .filter((o) => o.hostWallId === wall.id)
                .map((opening) => {
                  const dx = wall.end.x - wall.start.x;
                  const dy = wall.end.y - wall.start.y;
                  const len = Math.hypot(dx, dy) || 1;
                  const t = opening.positionAlongWall / len;
                  const needsReview = opening.confidence < OPENING_CONFIDENCE_THRESHOLD;
                  const isSelected = selection.selectedElementId === opening.id;
                  return (
                    <Circle
                      key={`opening_${opening.id}`}
                      x={wall.start.x + t * dx}
                      y={wall.start.y + t * dy}
                      radius={OPENING_RADIUS}
                      fill={needsReview ? "#fbbf24" : opening.kind === "door" ? "#8B4513" : "#87CEEB"}
                      stroke={isSelected ? WALL_SELECTED_COLOR : needsReview ? LOW_CONFIDENCE_COLOR : undefined}
                      strokeWidth={isSelected || needsReview ? 2 : 0}
                      dash={needsReview ? [4, 2] : undefined}
                      opacity={0.7}
                      onClick={(event) => handleOpeningClick(opening.id, event)}
                      onMouseEnter={() => setHoveredElementStable(opening.id)}
                      onMouseLeave={clearHoveredElementStable}
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

const Grid: React.FC<{ cellSize: number; width: number; height: number }> = React.memo(({
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
});

const RoomPolygon: React.FC<{
  room: Canonical.Room;
  isSelected: boolean;
  isHovered: boolean;
  onClick: (roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => void;
  onMouseEnter: (roomId: string) => void;
  onMouseLeave: () => void;
}> = React.memo(({ room, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) => {
  const points = room.vertices.flatMap((v) => [v.x, v.y]);
  const fill = isSelected ? ROOM_SELECTED_FILL : isHovered ? ROOM_HOVER_FILL : ROOM_DEFAULT_FILL;
  const stroke = isSelected || isHovered ? "#00ff00" : "#999";

  return (
    <Group 
      onMouseDown={(ev) => onClick(room.id, ev)} 
      onMouseEnter={() => onMouseEnter(room.id)} 
      onMouseLeave={onMouseLeave}
    >
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
});

const DraggableEndpoint: React.FC<{
  x: number;
  y: number;
  wallId: string;
  isStart: boolean;
  onDrag: (wallId: string, isStart: boolean, pos: { x: number; y: number }) => void;
}> = React.memo(({ x, y, wallId, isStart, onDrag }) => (
  <Circle
    x={x}
    y={y}
    radius={4}
    fill="#666"
    draggable
    onDragEnd={(e) => onDrag(wallId, isStart, { x: e.target.x(), y: e.target.y() })}
    hitStrokeWidth={8}
  />
));
