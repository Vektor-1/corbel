'use client';

import { useDesignStore } from '@/store/designStore';
import { Stage, Layer, Rect, Line, Circle, Text, Group, Arc } from 'react-konva';
import { useRef, useEffect, useMemo, useState } from 'react';
import type Konva from 'konva';
import type React from 'react';
import type { Vector2d } from 'konva/lib/types';
import { computeWallFootprints, wallQuad, MM_PER_PX } from '@/lib/geometry/wall-joints';
import { pointAlongWall } from '@/lib/geometry/wall-intersections';
import { polygonCentroid } from '@/lib/geometry/rooms';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';
import { compareFloorPlans, type MatchStatus } from '@/lib/comparison';
import type { DesignObject, Door, MaterialType, ObjectAssetId, Wall, WallType, Window } from '@/types/design';

const GRID_SIZE = 20;
const SNAP_DISTANCE = 10;

interface Canvas2DProps {
  defaultWallMaterial: MaterialType;
  defaultWallThickness: number;
  defaultWallHeight: number;
  defaultWallType: WallType;
  theme: 'light' | 'dark';
  activeObjectAssetId: ObjectAssetId;
  ghostFloorPlan?: import('@/types/design').FloorPlan | null;
  ghostOpacity?: number;
  diffMode?: boolean;
  stageRef?: React.RefObject<Konva.Stage | null>;
}

export function Canvas2D({
  defaultWallMaterial,
  defaultWallThickness,
  defaultWallHeight,
  defaultWallType,
  theme,
  activeObjectAssetId,
  ghostFloorPlan,
  ghostOpacity = 0.25,
  diffMode = false,
  stageRef: externalStageRef,
}: Canvas2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalStageRef = useRef<Konva.Stage>(null);
  const stageRef = externalStageRef ?? internalStageRef;
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<Vector2d | null>(null);
  const [wallPreview, setWallPreview] = useState<{ start: Vector2d; end: Vector2d } | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });

  const palette = theme === 'dark'
    ? {
        canvas: '#161511',
        grid: '#232019',
        wall: '#c9a96a',
        partition: '#6d675a',
        handle: '#ece7da',
        label: '#8b8471',
        selection: '#e3c98f',
        preview: '#c9a96a',
        previewLabel: '#e3c98f',
        room: '#6f8062',
        roomSelected: '#b7cf9f',
        door: '#dfbd79',
        window: '#82b9c7',
      }
    : {
        canvas: '#f2efe7',
        grid: '#ddd7c9',
        wall: '#8a6b3f',
        partition: '#8d8676',
        handle: '#26221a',
        label: '#837c6b',
        selection: '#6d5327',
        preview: '#8a6b3f',
        previewLabel: '#6d5327',
        room: '#9aaf88',
        roomSelected: '#637a50',
        door: '#7c5d2a',
        window: '#32758a',
      };

  const {
    floorPlan,
    currentTool,
    selectedElementId,
    addWall,
    deleteWall,
    addDoor,
    deleteDoor,
    addWindow,
    deleteWindow,
    addObject,
    deleteObject,
    setSelectedElement,
  } = useDesignStore();

  const walls = floorPlan?.walls;
  const footprints = useMemo(() => computeWallFootprints(walls ?? []), [walls]);

  const ghostWalls = ghostFloorPlan?.walls;
  const ghostFootprints = useMemo(() => computeWallFootprints(ghostWalls ?? []), [ghostWalls]);

  // Semantic diff: map each ghost (original) element to its match status so the
  // underlay can show what the redesign removed, moved, or resized.
  const diffStatus = useMemo(() => {
    if (!diffMode || !ghostFloorPlan || !floorPlan) return null;
    const report = compareFloorPlans(ghostFloorPlan, floorPlan);
    const byOriginalId = new Map<string, MatchStatus>();
    for (const m of [...report.walls, ...report.rooms, ...report.openings]) {
      if (m.originalId) byOriginalId.set(m.originalId, m.status);
    }
    return byOriginalId;
  }, [diffMode, ghostFloorPlan, floorPlan]);

  const diffColors: Record<'removed' | 'moved' | 'resized', string> = theme === 'dark'
    ? { removed: '#c0564f', moved: '#c98f3d', resized: '#c98f3d' }
    : { removed: '#b34a42', moved: '#b07b2e', resized: '#b07b2e' };

  const diffTint = (elementId: string, fallback: string): string => {
    const status = diffStatus?.get(elementId);
    if (status === 'removed' || status === 'moved' || status === 'resized') return diffColors[status];
    return fallback;
  };

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      setCanvasSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const snapToGrid = (pos: Vector2d): Vector2d => ({
    x: Math.round(pos.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(pos.y / GRID_SIZE) * GRID_SIZE,
  });

  const getPointerPosition = () => {
    const stage = stageRef.current;
    if (!stage) return null;

    const pointer = stage.getPointerPosition();
    if (!pointer) return null;

    return snapToGrid(pointer);
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (currentTool === 'object') {
      const pos = getPointerPosition();
      if (!pos) return;

      const newObject: DesignObject = {
        id: `object-${Date.now()}`,
        assetId: activeObjectAssetId,
        position: pos,
        rotation: 0,
        scale: 1,
      };

      addObject(newObject);
      setSelectedElement(newObject.id);
      return;
    }

    if (currentTool === 'select' && e.target === e.target.getStage()) {
      setSelectedElement(null);
      return;
    }

    if (currentTool !== 'wall') return;

    const pos = getPointerPosition();
    if (!pos) return;

    setDrawing(true);
    setStartPos(pos);
    setWallPreview({ start: pos, end: pos });
  };

  const handleMouseMove = () => {
    if (!drawing || !startPos) {
      setWallPreview(null);
      return;
    }

    const currentPos = getPointerPosition();
    if (!currentPos) return;

    setWallPreview({
      start: startPos,
      end: currentPos,
    });
  };

  const handleMouseUp = () => {
    if (!drawing || !startPos || !wallPreview) {
      setDrawing(false);
      setStartPos(null);
      setWallPreview(null);
      return;
    }

    const distance = Math.sqrt(
      Math.pow(wallPreview.end.x - startPos.x, 2) +
        Math.pow(wallPreview.end.y - startPos.y, 2)
    );

    if (distance > SNAP_DISTANCE) {
      const newWall: Wall = {
        id: `wall-${Date.now()}`,
        startPoint: startPos,
        endPoint: wallPreview.end,
        thickness: defaultWallThickness,
        material: defaultWallMaterial,
        type: defaultWallType,
        height: defaultWallHeight,
      };
      addWall(newWall);
      setSelectedElement(newWall.id);
    }

    setDrawing(false);
    setStartPos(null);
    setWallPreview(null);
  };

  const handleWallClick = (wallId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    const wall = floorPlan?.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;

    if (currentTool === 'door' || currentTool === 'window') {
      const pointer = getPointerPosition();
      if (!pointer) return;

      const dx = wall.endPoint.x - wall.startPoint.x;
      const dy = wall.endPoint.y - wall.startPoint.y;
      const length = Math.hypot(dx, dy);
      if (length < 1) return;

      const projectedOffset = ((pointer.x - wall.startPoint.x) * dx + (pointer.y - wall.startPoint.y) * dy) / length;
      const openingWidthMm = currentTool === 'door' ? 900 : 1200;
      const halfWidthPx = openingWidthMm / MM_PER_PX / 2;
      const offset = Math.max(halfWidthPx, Math.min(length - halfWidthPx, projectedOffset));
      if (length < halfWidthPx * 2) return;

      if (currentTool === 'door') {
        const door: Door = {
          id: `door-${Date.now()}`,
          wallId,
          position: { x: offset, y: 0 },
          width: openingWidthMm,
          type: 'internal',
          swing: 'left',
        };
        addDoor(door);
        setSelectedElement(door.id);
      } else {
        const window: Window = {
          id: `window-${Date.now()}`,
          wallId,
          position: { x: offset, y: 0 },
          width: openingWidthMm,
          height: 1200,
          sillHeight: 900,
        };
        addWindow(window);
        setSelectedElement(window.id);
      }
      return;
    }

    if (currentTool === 'delete') {
      deleteWall(wallId);
      if (selectedElementId === wallId) {
        setSelectedElement(null);
      }
      return;
    }

    setSelectedElement(wallId);
  };

  const handleOpeningClick = (
    openingId: string,
    kind: 'door' | 'window',
    e: Konva.KonvaEventObject<MouseEvent>
  ) => {
    e.cancelBubble = true;
    if (currentTool === 'delete') {
      if (kind === 'door') deleteDoor(openingId);
      else deleteWindow(openingId);
      if (selectedElementId === openingId) setSelectedElement(null);
      return;
    }
    if (currentTool === 'select') setSelectedElement(openingId);
  };

  const handleRoomClick = (roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (currentTool === 'select') setSelectedElement(roomId);
  };

  const handleObjectClick = (objectId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    if (currentTool === 'delete') {
      deleteObject(objectId);
      if (selectedElementId === objectId) setSelectedElement(null);
      return;
    }

    setSelectedElement(objectId);
  };

  const gridLines = [];
  for (let x = 0; x <= canvasSize.width; x += GRID_SIZE) {
    gridLines.push(
      <Line key={`v-${x}`} points={[x, 0, x, canvasSize.height]} stroke={palette.grid} strokeWidth={1} opacity={0.65} />
    );
  }
  for (let y = 0; y <= canvasSize.height; y += GRID_SIZE) {
    gridLines.push(
      <Line key={`h-${y}`} points={[0, y, canvasSize.width, y]} stroke={palette.grid} strokeWidth={1} opacity={0.65} />
    );
  }

  const roomElements = (floorPlan?.rooms ?? []).map((room) => {
    const centroid = polygonCentroid(room.vertices);
    const isSelected = room.id === selectedElementId;

    return (
      <Group
        key={room.id}
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => handleRoomClick(room.id, event)}
      >
        <Line
          points={room.vertices.flatMap((point) => [point.x, point.y])}
          closed
          fill={palette.room}
          opacity={theme === 'dark' ? 0.16 : 0.2}
          stroke={isSelected ? palette.roomSelected : undefined}
          strokeWidth={isSelected ? 2 : 0}
        />
        <Text
          x={centroid.x - 55}
          y={centroid.y - 14}
          width={110}
          align="center"
          text={room.name}
          fontSize={11}
          fontStyle="bold"
          fill={palette.label}
          listening={false}
        />
        <Text
          x={centroid.x - 55}
          y={centroid.y + 2}
          width={110}
          align="center"
          text={`${room.area.toFixed(2)} m²`}
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          fill={palette.label}
          listening={false}
        />
      </Group>
    );
  });

  const objectElements = (floorPlan?.objects ?? []).map((object) => {
    const asset = OBJECT_CATALOG_BY_ID[object.assetId];
    if (!asset) return null;

    const width = asset.dimensions[0] * 100 * object.scale;
    const depth = asset.dimensions[2] * 100 * object.scale;
    const isSelected = object.id === selectedElementId;

    return (
      <Group
        key={object.id}
        x={object.position.x}
        y={object.position.y}
        rotation={(object.rotation * 180) / Math.PI}
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => handleObjectClick(object.id, event)}
      >
        <Rect
          x={-Math.max(width, 20) / 2}
          y={-Math.max(depth, 20) / 2}
          width={Math.max(width, 20)}
          height={Math.max(depth, 20)}
          fill="transparent"
        />
        <Rect
          x={-width / 2}
          y={-depth / 2}
          width={width}
          height={depth}
          cornerRadius={4}
          fill={asset.color}
          opacity={theme === 'dark' ? 0.45 : 0.22}
          stroke={isSelected ? palette.selection : asset.color}
          strokeWidth={isSelected ? 3 : 1.5}
        />
        <Text
          x={-width / 2}
          y={-7}
          width={width}
          align="center"
          text={asset.name}
          fontSize={10}
          fill={palette.label}
        />
      </Group>
    );
  });

  const wallElements = floorPlan?.walls.map((wall) => {
    const isSelected = wall.id === selectedElementId;
    const footprint = footprints.get(wall.id);
    if (!footprint) return null;

    const outline = footprint.flatMap((corner) => [corner.x, corner.y]);
    const centerX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const centerY = (wall.startPoint.y + wall.endPoint.y) / 2;
    const wallLengthMm = Math.round(
      Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y) * MM_PER_PX
    );

    return (
      <Group key={wall.id}>
        <Line
          points={outline}
          closed
          fill={wall.type === 'loadBearing' ? palette.wall : palette.partition}
          stroke={isSelected ? palette.selection : undefined}
          strokeWidth={isSelected ? 1.5 : 0}
          shadowColor={isSelected ? palette.selection : undefined}
          shadowBlur={isSelected ? 10 : 0}
          shadowOpacity={isSelected ? 0.45 : 0}
          onClick={(event) => handleWallClick(wall.id, event)}
        />
        <Circle x={wall.startPoint.x} y={wall.startPoint.y} radius={2.5} fill={palette.handle} opacity={0.9} />
        <Circle x={wall.endPoint.x} y={wall.endPoint.y} radius={2.5} fill={palette.handle} opacity={0.9} />
        <Text
          x={centerX - 28}
          y={centerY - 18}
          text={`${wallLengthMm} mm`}
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          fill={isSelected ? palette.handle : palette.label}
          opacity={0.9}
        />
      </Group>
    );
  });

  const doorElements = (floorPlan?.doors ?? []).map((door) => {
    const wall = floorPlan?.walls.find((candidate) => candidate.id === door.wallId);
    if (!wall) return null;

    const center = pointAlongWall(wall, door.position.x);
    const angle = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
    const angleDegrees = (angle * 180) / Math.PI;
    const width = door.width / MM_PER_PX;
    const halfWidth = width / 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const hinge = door.swing === 'left'
      ? { x: center.x - direction.x * halfWidth, y: center.y - direction.y * halfWidth }
      : { x: center.x + direction.x * halfWidth, y: center.y + direction.y * halfWidth };
    const closedAngle = door.swing === 'left' ? angle : angle + Math.PI;
    const openAngle = angle + Math.PI / 2;
    const leafEnd = {
      x: hinge.x + Math.cos(openAngle) * width,
      y: hinge.y + Math.sin(openAngle) * width,
    };
    const isSelected = selectedElementId === door.id;

    return (
      <Group
        key={door.id}
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => handleOpeningClick(door.id, 'door', event)}
      >
        <Line
          points={[
            center.x - direction.x * halfWidth,
            center.y - direction.y * halfWidth,
            center.x + direction.x * halfWidth,
            center.y + direction.y * halfWidth,
          ]}
          stroke={palette.canvas}
          strokeWidth={wall.thickness / MM_PER_PX + 3}
        />
        <Line
          points={[hinge.x, hinge.y, leafEnd.x, leafEnd.y]}
          stroke={isSelected ? palette.selection : palette.door}
          strokeWidth={2}
        />
        <Arc
          x={hinge.x}
          y={hinge.y}
          innerRadius={Math.max(1, width - 1)}
          outerRadius={width}
          angle={90}
          rotation={(closedAngle * 180) / Math.PI}
          clockwise={door.swing === 'right'}
          fill={isSelected ? palette.selection : palette.door}
          opacity={0.75}
        />
        <Line
          points={[hinge.x, hinge.y, leafEnd.x, leafEnd.y]}
          stroke="transparent"
          strokeWidth={14}
        />
      </Group>
    );
  });

  const windowElements = (floorPlan?.windows ?? []).map((window) => {
    const wall = floorPlan?.walls.find((candidate) => candidate.id === window.wallId);
    if (!wall) return null;

    const center = pointAlongWall(wall, window.position.x);
    const angle = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
    const width = window.width / MM_PER_PX;
    const halfWidth = width / 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -direction.y, y: direction.x };
    const isSelected = selectedElementId === window.id;
    const color = isSelected ? palette.selection : palette.window;
    const endpoints = (normalOffset: number) => [
      center.x - direction.x * halfWidth + normal.x * normalOffset,
      center.y - direction.y * halfWidth + normal.y * normalOffset,
      center.x + direction.x * halfWidth + normal.x * normalOffset,
      center.y + direction.y * halfWidth + normal.y * normalOffset,
    ];

    return (
      <Group
        key={window.id}
        onMouseDown={(event) => {
          event.cancelBubble = true;
        }}
        onClick={(event) => handleOpeningClick(window.id, 'window', event)}
      >
        <Line
          points={endpoints(0)}
          stroke={palette.canvas}
          strokeWidth={wall.thickness / MM_PER_PX + 3}
        />
        <Line points={endpoints(-3)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(0)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(3)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(0)} stroke="transparent" strokeWidth={14} />
      </Group>
    );
  });

  const previewQuad = wallPreview
    ? wallQuad(wallPreview.start, wallPreview.end, defaultWallThickness / MM_PER_PX / 2)
    : null;

  const previewWall = wallPreview ? (
    <>
      {previewQuad && (
        <Line
          points={previewQuad.flatMap((corner) => [corner.x, corner.y])}
          closed
          fill={palette.preview}
          opacity={0.3}
        />
      )}
      <Line
        points={[wallPreview.start.x, wallPreview.start.y, wallPreview.end.x, wallPreview.end.y]}
        stroke={palette.preview}
        strokeWidth={1.5}
        lineCap="round"
        dash={[8, 6]}
        opacity={0.9}
      />
      <Text
        x={(wallPreview.start.x + wallPreview.end.x) / 2 - 28}
        y={(wallPreview.start.y + wallPreview.end.y) / 2 - 18}
        text={`${Math.round(
          Math.hypot(
            wallPreview.end.x - wallPreview.start.x,
            wallPreview.end.y - wallPreview.start.y
          ) * MM_PER_PX
        )} mm`}
        fontSize={10}
        fontFamily="ui-monospace, monospace"
        fill={palette.previewLabel}
      />
    </>
  ) : null;

  const hasGeometry = (floorPlan?.walls.length ?? 0) + (floorPlan?.objects?.length ?? 0) > 0;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-[var(--editor-canvas)]">
      <Stage
        ref={stageRef}
        width={canvasSize.width}
        height={canvasSize.height}
        draggable={currentTool === 'select'}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <Layer>
          <Rect x={0} y={0} width={canvasSize.width} height={canvasSize.height} fill={palette.canvas} />
          {gridLines}

          {/* Ghost layer — original imported plan as tracing-paper underlay */}
          {ghostFloorPlan && ghostOpacity > 0 && (
            <>
              {ghostFloorPlan.rooms.map((room) => (
                <Line
                  key={`ghost-room-${room.id}`}
                  points={room.vertices.flatMap((p) => [p.x, p.y])}
                  closed
                  fill={diffTint(room.id, theme === 'dark' ? '#4a5c40' : '#a8bfa0')}
                  opacity={ghostOpacity * 0.4}
                  listening={false}
                />
              ))}
              {ghostFloorPlan.walls.map((wall) => {
                const fp = ghostFootprints.get(wall.id);
                if (!fp) return null;
                return (
                  <Line
                    key={`ghost-wall-${wall.id}`}
                    points={fp.flatMap((c) => [c.x, c.y])}
                    closed
                    fill={diffTint(wall.id, theme === 'dark' ? '#6b6050' : '#b5a898')}
                    stroke={diffTint(wall.id, theme === 'dark' ? '#8c7a6a' : '#9a8878')}
                    strokeWidth={0.75}
                    opacity={ghostOpacity}
                    listening={false}
                  />
                );
              })}
              {ghostFloorPlan.doors.map((door) => {
                const wall = ghostFloorPlan.walls.find((w) => w.id === door.wallId);
                if (!wall) return null;
                const center = pointAlongWall(wall, door.position.x);
                const angle = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
                const w = door.width / MM_PER_PX;
                const dir = { x: Math.cos(angle), y: Math.sin(angle) };
                return (
                  <Line
                    key={`ghost-door-${door.id}`}
                    points={[
                      center.x - dir.x * w / 2, center.y - dir.y * w / 2,
                      center.x + dir.x * w / 2, center.y + dir.y * w / 2,
                    ]}
                    stroke={diffTint(door.id, theme === 'dark' ? '#8a7055' : '#9a7a58')}
                    strokeWidth={wall.thickness / MM_PER_PX + 1}
                    opacity={ghostOpacity}
                    listening={false}
                  />
                );
              })}
              {ghostFloorPlan.windows.map((win) => {
                const wall = ghostFloorPlan.walls.find((w) => w.id === win.wallId);
                if (!wall) return null;
                const center = pointAlongWall(wall, win.position.x);
                const angle = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
                const w = win.width / MM_PER_PX;
                const dir = { x: Math.cos(angle), y: Math.sin(angle) };
                return (
                  <Line
                    key={`ghost-win-${win.id}`}
                    points={[
                      center.x - dir.x * w / 2, center.y - dir.y * w / 2,
                      center.x + dir.x * w / 2, center.y + dir.y * w / 2,
                    ]}
                    stroke={diffTint(win.id, theme === 'dark' ? '#5a8090' : '#6a9aaa')}
                    strokeWidth={wall.thickness / MM_PER_PX + 1}
                    opacity={ghostOpacity}
                    listening={false}
                  />
                );
              })}
            </>
          )}

          {roomElements}
          {objectElements}
          {wallElements}
          {doorElements}
          {windowElements}
          {previewWall}
          <Circle x={24} y={24} radius={3} fill={palette.selection} opacity={0.9} />
          <Text x={34} y={19} text="0,0" fontSize={10} fontFamily="ui-monospace, monospace" fill={palette.label} opacity={0.8} />
        </Layer>
      </Stage>

      {!hasGeometry && !ghostFloorPlan && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="max-w-sm text-center">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--editor-text-subtle)]">
              Blank sheet
            </p>
            <h3 className="font-display mt-2 text-2xl text-[var(--editor-text-muted)]">
              Begin with a wall
            </h3>
            <p className="mt-2 text-xs leading-5 text-[var(--editor-text-subtle)]">
              Choose the wall tool, then drag across the sheet. Corbel reviews each move against
              Ghana building standards.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
