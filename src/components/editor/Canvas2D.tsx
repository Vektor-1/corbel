'use client';

import { useDesignStore } from '@/store/designStore';
import { Stage, Layer, Rect, Line, Circle, Text, Group, Arc, Image as KonvaImage, Transformer } from 'react-konva';
import React, { useRef, useEffect, useMemo, useState } from 'react';
import Konva from 'konva';
import { useFeatureFlag } from '@/lib/flags';
import type { Vector2d } from 'konva/lib/types';
import { computeWallFootprints, wallQuad } from '@/lib/geometry/wall-joints';
import { millimetresPerPixel, pixelsPerMeter } from '@/lib/geometry/scale';
import { pointAlongWall } from '@/lib/geometry/wall-intersections';
import { polygonCentroid } from '@/lib/geometry/rooms';
import { snapPlanPoint } from '@/lib/geometry/snap';
import { splitWallAtPoint } from '@/lib/geometry/wall-intersections';
import { canPlaceDoor, canPlaceWindow } from '@/lib/geometry/placement-constraints';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';
import { compareFloorPlans, type MatchStatus } from '@/lib/comparison';
import { getCombinedBounds, getElementIdsInRect, type ElementBounds } from '@/lib/geometry/element-bounds';
import { expandGroupSelection } from '@/lib/geometry/groups';
import type { DesignObject, Door, MaterialType, ObjectAssetId, Wall, WallType, Window } from '@/types/design';
import { formatArea, formatLength, type AreaUnit, type LengthUnit } from '@/lib/units/measurements';

const MIN_WALL_LENGTH = 10;

interface Canvas2DProps {
  defaultWallMaterial: MaterialType;
  defaultWallThickness: number;
  defaultWallHeight: number;
  defaultWallType: WallType;
  theme: 'light' | 'dark';
  activeObjectAssetId: ObjectAssetId;
  ghostFloorPlan?: import('@/types/design').FloorPlan | null;
  ghostOpacity?: number;
  traceImage?: import('@/store/designStore').TraceImageReference | null;
  diffMode?: boolean;
  stageRef?: React.RefObject<Konva.Stage | null>;
  showGrid?: boolean;
  showRoomLabels?: boolean;
  showWallDimensions?: boolean;
  lengthUnit?: LengthUnit;
  areaUnit?: AreaUnit;
  /** One-shot placement feedback (door/window blocked at this position). */
  onPlacementViolation?: (violation: { message: string; rule: string; targetId: string }) => void;
}

export const Canvas2D = React.memo(function Canvas2D({
  defaultWallMaterial,
  defaultWallThickness,
  defaultWallHeight,
  defaultWallType,
  theme,
  activeObjectAssetId,
  ghostFloorPlan,
  ghostOpacity = 0.25,
  traceImage,
  diffMode = false,
  stageRef: externalStageRef,
  showGrid = true,
  showRoomLabels = true,
  showWallDimensions = true,
  lengthUnit = 'mm',
  areaUnit = 'm²',
  onPlacementViolation,
}: Canvas2DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalStageRef = useRef<Konva.Stage>(null);
  const stageRef = externalStageRef ?? internalStageRef;
  const [drawing, setDrawing] = useState(false);
  const [startPos, setStartPos] = useState<Vector2d | null>(null);
  const [wallPreview, setWallPreview] = useState<{ start: Vector2d; end: Vector2d } | null>(null);
  const [snapIndicator, setSnapIndicator] = useState<{ pos: Vector2d; kind: import('@/lib/geometry/snap').PlanSnapKind } | null>(null);
  const [endpointSnapKind, setEndpointSnapKind] = useState<import('@/lib/geometry/snap').PlanSnapKind | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 600 });
  const [referenceImage, setReferenceImage] = useState<HTMLImageElement | null>(null);
  const [angleLock, setAngleLock] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [middlePanning, setMiddlePanning] = useState(false);
  const isPanning = spacePressed || middlePanning;
  const [marquee, setMarquee] = useState<{ start: Vector2d; end: Vector2d; additive: boolean } | null>(null);
  const transformTargetRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

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
    selectedElementIds,
    addWall,
    deleteWall,
    addDoor,
    deleteDoor,
    addWindow,
    deleteWindow,
    addObject,
    deleteObject,
    setSelectedElement,
    setSelection,
    toggleSelectionGroup,
    clearSelection,
    translateElements,
    scaleElements,
    updateWall,
  } = useDesignStore();
  // The Scale tool shows resize handles for any selection size (its whole purpose);
  // the Select tool reserves single-element clicks for existing per-element interactions
  // (e.g. wall endpoint dragging) and only shows the group box once 2+ are selected.
  const isSelectLikeTool = currentTool === 'select' || currentTool === 'scale';
  const minBoundsSelection = currentTool === 'scale' ? 1 : 2;
  const combinedSelectionBounds = useMemo(
    () => (selectedElementIds.length >= minBoundsSelection ? getCombinedBounds(selectedElementIds, floorPlan ?? null) : null),
    [selectedElementIds, floorPlan, minBoundsSelection]
  );

  useEffect(() => {
    const transformer = transformerRef.current;
    const target = transformTargetRef.current;
    if (!transformer) return;
    if (target && combinedSelectionBounds) {
      transformer.nodes([target]);
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [combinedSelectionBounds]);
  const planPixelsPerMeter = pixelsPerMeter(floorPlan?.scale);
  const planMillimetresPerPixel = millimetresPerPixel(floorPlan?.scale);
  const drawingGridSize = Math.max(10, Math.round(planPixelsPerMeter / 5)); // 200 mm at the active scale
  const endpointTolerance = Math.max(12, Math.min(24, drawingGridSize * 0.8));
  const ghostMillimetresPerPixel = millimetresPerPixel(ghostFloorPlan?.scale);
  const traceToLearnEnabled = useFeatureFlag('traceToLearn');
  const walls = floorPlan?.walls;
  const footprints = useMemo(() => computeWallFootprints(walls ?? [], planPixelsPerMeter), [walls, planPixelsPerMeter]);

  const ghostWalls = ghostFloorPlan?.walls;
  const ghostFootprints = useMemo(() => computeWallFootprints(ghostWalls ?? [], ghostFloorPlan?.scale), [ghostWalls, ghostFloorPlan?.scale]);

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

  // Keep the latest measured viewport size in a ref so the centering effect
  // below always uses real dimensions, even on first render.
  const canvasSizeRef = useRef(canvasSize);
  useEffect(() => {
    canvasSizeRef.current = canvasSize;
  }, [canvasSize]);

  // The plan origin (0,0) is the sheet center. Pan the stage so the origin
  // sits at the viewport center once per plan; the user can pan freely after.
  const centeredPlanId = useRef<string | null>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !floorPlan) return;
    if (centeredPlanId.current === floorPlan.id) return;
    centeredPlanId.current = floorPlan.id;
    const { width, height } = canvasSizeRef.current;
    stage.position({ x: width / 2, y: height / 2 });
  }, [floorPlan?.id]);

  useEffect(() => {
    if (!traceImage?.url) {
      setReferenceImage(null);
      return;
    }
    const image = new window.Image();
    image.onload = () => setReferenceImage(image);
    image.onerror = () => setReferenceImage(null);
    image.src = traceImage.url;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [traceImage?.url]);

  const snapToGrid = (pos: Vector2d): Vector2d =>
    snapPlanPoint(pos, { gridSize: drawingGridSize }).point;

  const snapDrawingPoint = (
    point: Vector2d,
    axisOrigin?: Vector2d,
    excludeWallId?: string,
  ): { point: Vector2d; kind: import('@/lib/geometry/snap').PlanSnapKind } => {
    const result = snapPlanPoint(point, {
      gridSize: drawingGridSize,
      walls: floorPlan?.walls ?? [],
      endpointTolerance,
      axisOrigin,
      axisTolerance: endpointTolerance,
      angleLock,
      excludeWallId,
    });
    return result;
  };

  /** Convert a screen-space pointer event to stage-local coordinates.
   *  `stage.getPointerPosition()` returns canvas-pixel coords relative to the
   *  content div, but after the stage is panned (draggable in select mode) the
   *  canvas content is rendered offset by stage.x()/y(). We must subtract the
   *  stage drag offset to get the correct stage-local (scene-graph) position. */
  const stageLocalPos = (): Vector2d | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: pointer.x - (stage.x() ?? 0),
      y: pointer.y - (stage.y() ?? 0),
    };
  };

  const getPointerPosition = () => {
    const pos = stageLocalPos();
    return pos ? snapToGrid(pos) : null;
  };

  const getDrawingPointerPosition = (axisOrigin?: Vector2d, excludeWallId?: string) => {
    const pos = stageLocalPos();
    if (!pos) return null;
    return snapDrawingPoint(pos, axisOrigin, excludeWallId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Shift') {
      setAngleLock(true);
    }
    if (e.key === ' ' && document.activeElement?.tagName !== 'INPUT') {
      e.preventDefault();
      setSpacePressed(true);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === 'Shift') {
      setAngleLock(false);
    }
    if (e.key === ' ') {
      setSpacePressed(false);
    }
  };

  /** Click-select for the active tool: shift/ctrl/cmd toggles into the multi-selection,
   *  a plain click replaces it. Either way, clicking any grouped element expands to its whole group. */
  const selectOnClick = (id: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    const ids = expandGroupSelection(floorPlan ?? null, [id]);
    if (e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey) {
      toggleSelectionGroup(ids);
    } else {
      setSelection(ids);
    }
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.evt.button === 1) {
      // Middle-mouse drag pans from any tool, regardless of selection/drawing state.
      // startDrag() is called directly (bypassing the reactive `draggable` prop) since
      // toggling that prop inside this same handler would be one render too late for
      // Konva's own drag-start detection on this mousedown.
      e.evt.preventDefault();
      setMiddlePanning(true);
      e.target.getStage()?.startDrag(e);
      return;
    }

    if (isPanning) return; // let the Stage's own drag pan the view (Space or middle-mouse held)

    if (isSelectLikeTool && e.target === e.target.getStage()) {
      const pos = stageLocalPos();
      if (!pos) return;
      setMarquee({ start: pos, end: pos, additive: e.evt.shiftKey });
      return;
    }

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

    if (currentTool !== 'wall') return;

    const result = getDrawingPointerPosition();
    if (!result) return;

    const pos = result.point;
    setDrawing(true);
    setStartPos(pos);
    setWallPreview({ start: pos, end: pos });
    setSnapIndicator({ pos, kind: result.kind });
  };

  const handleMouseMove = () => {
    if (marquee) {
      const pos = stageLocalPos();
      if (pos) setMarquee({ ...marquee, end: pos });
      return;
    }

    if (!drawing || !startPos) {
      setWallPreview(null);
      setSnapIndicator(null);
      setEndpointSnapKind(null);
      return;
    }

    const result = getDrawingPointerPosition(startPos);
    if (!result) return;

    const currentPos = result.point;
    setWallPreview({
      start: startPos,
      end: currentPos,
    });
    setSnapIndicator({ pos: currentPos, kind: result.kind });
    // Track if endpoint is snapping to a wall body (for auto-split feature)
    setEndpointSnapKind(result.kind);
  };

  /** Two-finger trackpad scroll (or a mouse wheel) pans the view; no modifier needed. */
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    stage.position({ x: stage.x() - e.evt.deltaX, y: stage.y() - e.evt.deltaY });
    stage.batchDraw();
  };

  const handleMouseUp = () => {
    if (middlePanning) {
      setMiddlePanning(false);
      return;
    }

    if (marquee) {
      const rect: ElementBounds = {
        x: Math.min(marquee.start.x, marquee.end.x),
        y: Math.min(marquee.start.y, marquee.end.y),
        width: Math.abs(marquee.end.x - marquee.start.x),
        height: Math.abs(marquee.end.y - marquee.start.y),
      };
      const dragged = rect.width > 4 || rect.height > 4;
      if (dragged) {
        const hitIds = getElementIdsInRect(rect, floorPlan ?? null);
        const ids = expandGroupSelection(floorPlan ?? null, hitIds);
        if (marquee.additive) {
          setSelection(Array.from(new Set([...selectedElementIds, ...ids])));
        } else {
          setSelection(ids);
        }
      } else if (!marquee.additive) {
        clearSelection();
      }
      setMarquee(null);
      return;
    }

    if (!drawing || !startPos || !wallPreview) {
      setDrawing(false);
      setStartPos(null);
      setWallPreview(null);
      setSnapIndicator(null);
      return;
    }

    const distance = Math.sqrt(
      Math.pow(wallPreview.end.x - startPos.x, 2) +
        Math.pow(wallPreview.end.y - startPos.y, 2)
    );

    if (distance > MIN_WALL_LENGTH) {
      const newWall: Wall = {
        id: `wall-${Date.now()}`,
        startPoint: startPos,
        endPoint: wallPreview.end,
        thickness: defaultWallThickness,
        material: defaultWallMaterial,
        type: defaultWallType,
        height: defaultWallHeight,
      };
      // addWall uses insertWallWithIntersections which automatically handles
      // splitting both the new wall and existing walls at their intersections
      addWall(newWall);
      setSelectedElement(newWall.id);
    }

    setDrawing(false);
    setStartPos(null);
    setWallPreview(null);
    setSnapIndicator(null);
    setEndpointSnapKind(null);
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
      const halfWidthPx = openingWidthMm / planMillimetresPerPixel / 2;
      const offset = Math.max(halfWidthPx, Math.min(length - halfWidthPx, projectedOffset));
      if (length < halfWidthPx * 2) return;

      if (currentTool === 'door') {
        // Validate door placement against constraints
        const violations = canPlaceDoor(
          wall,
          offset * planMillimetresPerPixel,
          openingWidthMm,
          floorPlan?.doors ?? [],
          floorPlan?.windows ?? [],
        );

        const errors = violations.filter((v) => v.severity === 'error');
        if (errors.length > 0) {
          onPlacementViolation?.({ message: errors[0].message, rule: errors[0].rule, targetId: wall.id });
          return;
        }

        const door: Door = {
          id: `door-${Date.now()}`,
          wallId,
          position: { x: offset, y: 0 },
          width: openingWidthMm,
          type: 'internal',
          swing: 'left',
          openDirection: 'in',
        };
        addDoor(door);
        setSelectedElement(door.id);
      } else {
        // Validate window placement against constraints
        const violations = canPlaceWindow(
          wall,
          offset * planMillimetresPerPixel,
          openingWidthMm,
          1200, // windowHeight
          900, // windowSillHeight
          defaultWallHeight,
          floorPlan?.doors ?? [],
          floorPlan?.windows ?? [],
        );

        const errors = violations.filter((v) => v.severity === 'error');
        if (errors.length > 0) {
          onPlacementViolation?.({ message: errors[0].message, rule: errors[0].rule, targetId: wall.id });
          return;
        }

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

    selectOnClick(wallId, e);
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
    if (isSelectLikeTool) selectOnClick(openingId, e);
  };

  const handleRoomClick = (roomId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;
    if (isSelectLikeTool) selectOnClick(roomId, e);
  };

  const handleObjectClick = (objectId: string, e: Konva.KonvaEventObject<MouseEvent>) => {
    e.cancelBubble = true;

    if (currentTool === 'delete') {
      deleteObject(objectId);
      if (selectedElementId === objectId) setSelectedElement(null);
      return;
    }

    selectOnClick(objectId, e);
  };

  // Grid spans the full drawing sheet centered on the plan origin, so panned
  // areas stay gridded. Empty sheets fall back to the viewport.
  const planWidthPx = floorPlan ? floorPlan.width / millimetresPerPixel(floorPlan.scale) : 0;
  const planHeightPx = floorPlan ? floorPlan.height / millimetresPerPixel(floorPlan.scale) : 0;
  const gridWidth = Math.max(canvasSize.width, planWidthPx);
  const gridHeight = Math.max(canvasSize.height, planHeightPx);
  const gridLeft = -gridWidth / 2;
  const gridTop = -gridHeight / 2;
  const gridRight = gridWidth / 2;
  const gridBottom = gridHeight / 2;

  const gridLines = [];
  for (let x = gridLeft; x <= gridRight; x += drawingGridSize) {
    gridLines.push(
      <Line key={`v-${x}`} points={[x, gridTop, x, gridBottom]} stroke={palette.grid} strokeWidth={1} opacity={0.65} />
    );
  }
  for (let y = gridTop; y <= gridBottom; y += drawingGridSize) {
    gridLines.push(
      <Line key={`h-${y}`} points={[gridLeft, y, gridRight, y]} stroke={palette.grid} strokeWidth={1} opacity={0.65} />
    );
  }

  const roomElements = (floorPlan?.rooms ?? []).map((room) => {
    const centroid = polygonCentroid(room.vertices);
    const isSelected = selectedElementIds.includes(room.id);

    return (
      <Group
        key={room.id}
        onMouseDown={(event) => {
          // Let the Object tool's placement click through — a room's fill would
          // otherwise swallow it, making it impossible to place furniture inside
          // any closed room.
          if (currentTool !== 'object') event.cancelBubble = true;
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
        {showRoomLabels && (
          <>
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
              text={formatArea(room.area, areaUnit)}
              fontSize={10}
              fontFamily="ui-monospace, monospace"
              fill={palette.label}
              listening={false}
            />
          </>
        )}
      </Group>
    );
  });

  const objectElements = (floorPlan?.objects ?? []).map((object) => {
    const asset = OBJECT_CATALOG_BY_ID[object.assetId];
    if (!asset) return null;

    const width = asset.dimensions[0] * 100 * object.scale;
    const depth = asset.dimensions[2] * 100 * object.scale;
    const isSelected = selectedElementIds.includes(object.id);

    return (
      <Group
        key={object.id}
        x={object.position.x}
        y={object.position.y}
        rotation={(object.rotation * 180) / Math.PI}
        onMouseDown={(event) => {
          if (currentTool !== 'object') event.cancelBubble = true;
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
    const isSelected = selectedElementIds.includes(wall.id);
    const canEditEndpoints = isSelected && currentTool === 'select';
    const footprint = footprints.get(wall.id);
    if (!footprint) return null;

    const outline = footprint.flatMap((corner) => [corner.x, corner.y]);
    const centerX = (wall.startPoint.x + wall.endPoint.x) / 2;
    const centerY = (wall.startPoint.y + wall.endPoint.y) / 2;
    const wallLengthMm = Math.round(
      Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y) * planMillimetresPerPixel
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
        <Circle
          x={wall.startPoint.x}
          y={wall.startPoint.y}
          radius={canEditEndpoints ? 7 : 2.5}
          fill={palette.handle}
          stroke={canEditEndpoints ? palette.selection : undefined}
          strokeWidth={canEditEndpoints ? 2 : 0}
          opacity={canEditEndpoints ? 1 : 0.9}
          draggable={canEditEndpoints}
          onClick={(event) => handleWallClick(wall.id, event)}
          onDragStart={(event) => {
            event.cancelBubble = true;
          }}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            updateWall(wall.id, { startPoint: snapDrawingPoint({ x: event.target.x(), y: event.target.y() }, undefined, wall.id).point });
          }}
        />
        <Circle
          x={wall.endPoint.x}
          y={wall.endPoint.y}
          radius={canEditEndpoints ? 7 : 2.5}
          fill={palette.handle}
          stroke={canEditEndpoints ? palette.selection : undefined}
          strokeWidth={canEditEndpoints ? 2 : 0}
          opacity={canEditEndpoints ? 1 : 0.9}
          draggable={canEditEndpoints}
          onClick={(event) => handleWallClick(wall.id, event)}
          onDragStart={(event) => {
            event.cancelBubble = true;
          }}
          onDragEnd={(event) => {
            event.cancelBubble = true;
            updateWall(wall.id, { endPoint: snapDrawingPoint({ x: event.target.x(), y: event.target.y() }, undefined, wall.id).point });
          }}
        />
        {showWallDimensions && (
          <Text
            x={centerX - 28}
            y={centerY - 18}
            text={formatLength(wallLengthMm, lengthUnit)}
            fontSize={10}
            fontFamily="ui-monospace, monospace"
            fill={isSelected ? palette.handle : palette.label}
            opacity={0.9}
          />
        )}
      </Group>
    );
  });

  const doorElements = (floorPlan?.doors ?? []).map((door) => {
    const wall = floorPlan?.walls.find((candidate) => candidate.id === door.wallId);
    if (!wall) return null;

    const center = pointAlongWall(wall, door.position.x);
    const angle = Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x);
    const angleDegrees = (angle * 180) / Math.PI;
    const width = door.width / planMillimetresPerPixel;
    const halfWidth = width / 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const hinge = door.swing === 'left'
      ? { x: center.x - direction.x * halfWidth, y: center.y - direction.y * halfWidth }
      : { x: center.x + direction.x * halfWidth, y: center.y + direction.y * halfWidth };
    const closedAngle = door.swing === 'left' ? angle : angle + Math.PI;
    const openDirection = door.openDirection ?? 'in';
    const openAngle = angle + (openDirection === 'out' ? -Math.PI / 2 : Math.PI / 2);
    // Konva's Arc always sweeps its local 0deg->angle(90deg) range and passes
    // its own `clockwise` prop straight through as the native canvas
    // arc()'s `counterclockwise` argument -- so clockwise=true, combined
    // with that fixed increasing local sweep, tells the browser to go the
    // LONG way around (270deg) rather than the short 90deg (confirmed by
    // reading node_modules/konva/lib/shapes/Arc.js directly; this was a
    // latent bug in the pre-existing swing='right' rendering too, just
    // never exposed before openDirection made side-by-side comparison
    // possible). Always sweeping "clockwise=false" (the short way) and
    // choosing which of the two 90deg-apart boundary angles to start
    // rotation at sidesteps the bug entirely, for all 4 combinations.
    const arcDelta = ((openAngle - closedAngle + Math.PI) % (2 * Math.PI)) - Math.PI;
    const arcRotation = arcDelta > 0 ? closedAngle : openAngle;
    const leafEnd = {
      x: hinge.x + Math.cos(openAngle) * width,
      y: hinge.y + Math.sin(openAngle) * width,
    };
    const isSelected = selectedElementIds.includes(door.id);

    return (
      <Group
        key={door.id}
        onMouseDown={(event) => {
          if (currentTool !== 'object') event.cancelBubble = true;
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
          strokeWidth={wall.thickness / planMillimetresPerPixel + 3}
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
          rotation={(arcRotation * 180) / Math.PI}
          clockwise={false}
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
    const width = window.width / planMillimetresPerPixel;
    const halfWidth = width / 2;
    const direction = { x: Math.cos(angle), y: Math.sin(angle) };
    const normal = { x: -direction.y, y: direction.x };
    const isSelected = selectedElementIds.includes(window.id);
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
          if (currentTool !== 'object') event.cancelBubble = true;
        }}
        onClick={(event) => handleOpeningClick(window.id, 'window', event)}
      >
        <Line
          points={endpoints(0)}
          stroke={palette.canvas}
          strokeWidth={wall.thickness / planMillimetresPerPixel + 3}
        />
        <Line points={endpoints(-3)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(0)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(3)} stroke={color} strokeWidth={1.5} />
        <Line points={endpoints(0)} stroke="transparent" strokeWidth={14} />
      </Group>
    );
  });

  const getSnapIndicatorStyle = (kind: import('@/lib/geometry/snap').PlanSnapKind) => {
    const baseSize = 8;
    switch (kind) {
      case 'endpoint':
        return { size: baseSize + 2, color: '#e74c3c', shape: 'square' }; // Red square
      case 'midpoint':
        return { size: baseSize, color: '#f39c12', shape: 'triangle' }; // Orange triangle
      case 'crossing':
        return { size: baseSize, color: '#9b59b6', shape: 'x' }; // Purple X
      case 'angle':
        return { size: baseSize, color: '#3498db', shape: 'tick' }; // Blue tick
      case 'wall':
        return { size: baseSize, color: '#1abc9c', shape: 'diamond' }; // Cyan diamond
      case 'axis':
        return { size: baseSize - 1, color: '#95a5a6', shape: 'plus' }; // Gray plus
      default:
        return { size: baseSize - 2, color: '#7f8c8d', shape: 'dot' }; // Grid (dark gray dot)
    }
  };

  const previewQuad = wallPreview
    ? wallQuad(wallPreview.start, wallPreview.end, defaultWallThickness / planMillimetresPerPixel / 2)
    : null;

  const snapIndicatorRender = snapIndicator ? (() => {
    const { size, color, shape } = getSnapIndicatorStyle(snapIndicator.kind);
    const { x, y } = snapIndicator.pos;

    switch (shape) {
      case 'square':
        return <Rect x={x - size / 2} y={y - size / 2} width={size} height={size} stroke={color} strokeWidth={1.5} />;
      case 'triangle':
        return (
          <Line
            points={[x, y - size / 2, x + size / 2, y + size / 2, x - size / 2, y + size / 2, x, y - size / 2]}
            stroke={color}
            strokeWidth={1.5}
          />
        );
      case 'x':
        return (
          <>
            <Line points={[x - size / 2, y - size / 2, x + size / 2, y + size / 2]} stroke={color} strokeWidth={1.5} />
            <Line points={[x - size / 2, y + size / 2, x + size / 2, y - size / 2]} stroke={color} strokeWidth={1.5} />
          </>
        );
      case 'tick':
        return (
          <>
            <Line points={[x - size / 2, y, x, y + size / 2]} stroke={color} strokeWidth={1.5} />
            <Line points={[x, y + size / 2, x + size / 2, y - size / 4]} stroke={color} strokeWidth={1.5} />
          </>
        );
      case 'diamond':
        return (
          <Line
            points={[x, y - size / 2, x + size / 2, y, x, y + size / 2, x - size / 2, y, x, y - size / 2]}
            stroke={color}
            strokeWidth={1.5}
          />
        );
      case 'plus':
        return (
          <>
            <Line points={[x - size / 2, y, x + size / 2, y]} stroke={color} strokeWidth={1.5} />
            <Line points={[x, y - size / 2, x, y + size / 2]} stroke={color} strokeWidth={1.5} />
          </>
        );
      default: // dot
        return <Circle x={x} y={y} radius={size / 2} stroke={color} strokeWidth={1} />;
    }
  })() : null;

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
        text={formatLength(
          Math.round(
            Math.hypot(
              wallPreview.end.x - wallPreview.start.x,
              wallPreview.end.y - wallPreview.start.y
            ) * planMillimetresPerPixel
          ),
          lengthUnit
        )}
        fontSize={10}
        fontFamily="ui-monospace, monospace"
        fill={palette.previewLabel}
      />
    </>
  ) : null;

  const hasGeometry = (floorPlan?.walls.length ?? 0) + (floorPlan?.objects?.length ?? 0) > 0;
  const referenceWidth = referenceImage ? referenceImage.width * (traceImage?.scale ?? 1) : 0;
  const referenceHeight = referenceImage ? referenceImage.height * (traceImage?.scale ?? 1) : 0;
  const calibrationWall = traceImage?.calibration
    ? floorPlan?.walls.find((wall) => wall.id === traceImage.calibration?.wallId)
    : null;
  const calibrationLabel = traceImage?.calibration
    ? `Calibration · ${formatLength(traceImage.calibration.knownLengthMm, lengthUnit)}`
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[var(--editor-canvas)]"
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      tabIndex={0}
    >
      <Stage
        ref={stageRef}
        width={canvasSize.width}
        height={canvasSize.height}
        draggable={isPanning}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <Layer>
          <Rect x={gridLeft} y={gridTop} width={gridWidth} height={gridHeight} fill={palette.canvas} listening={false} />
          {traceImage && referenceImage && traceImage.opacity > 0 && (
            <KonvaImage
              image={referenceImage}
              x={-referenceWidth / 2}
              y={-referenceHeight / 2}
              width={referenceWidth}
              height={referenceHeight}
              opacity={traceImage.opacity}
              filters={traceImage.blur > 0 ? [Konva.Filters.Blur] : undefined}
              blurRadius={traceImage.blur}
              listening={false}
            />
          )}
          {calibrationWall && calibrationLabel && (
            <>
              <Line
                points={[calibrationWall.startPoint.x, calibrationWall.startPoint.y, calibrationWall.endPoint.x, calibrationWall.endPoint.y]}
                stroke={palette.selection}
                strokeWidth={4}
                lineCap="round"
                opacity={0.9}
                listening={false}
              />
              <Text
                x={(calibrationWall.startPoint.x + calibrationWall.endPoint.x) / 2 - 70}
                y={(calibrationWall.startPoint.y + calibrationWall.endPoint.y) / 2 - 36}
                width={140}
                align="center"
                text={calibrationLabel}
                fontSize={10}
                fontStyle="bold"
                fill={palette.selection}
                listening={false}
              />
            </>
          )}
          {showGrid && gridLines}

          {/* Ghost layer — original imported plan as tracing-paper underlay */}
          {traceToLearnEnabled && ghostFloorPlan && ghostOpacity > 0 && (
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
                const w = door.width / ghostMillimetresPerPixel;
                const dir = { x: Math.cos(angle), y: Math.sin(angle) };
                return (
                  <Line
                    key={`ghost-door-${door.id}`}
                    points={[
                      center.x - dir.x * w / 2, center.y - dir.y * w / 2,
                      center.x + dir.x * w / 2, center.y + dir.y * w / 2,
                    ]}
                    stroke={diffTint(door.id, theme === 'dark' ? '#8a7055' : '#9a7a58')}
                    strokeWidth={wall.thickness / ghostMillimetresPerPixel + 1}
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
                const w = win.width / ghostMillimetresPerPixel;
                const dir = { x: Math.cos(angle), y: Math.sin(angle) };
                return (
                  <Line
                    key={`ghost-win-${win.id}`}
                    points={[
                      center.x - dir.x * w / 2, center.y - dir.y * w / 2,
                      center.x + dir.x * w / 2, center.y + dir.y * w / 2,
                    ]}
                    stroke={diffTint(win.id, theme === 'dark' ? '#5a8090' : '#6a9aaa')}
                    strokeWidth={wall.thickness / ghostMillimetresPerPixel + 1}
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
          {snapIndicatorRender}

          {marquee && (
            <Rect
              x={Math.min(marquee.start.x, marquee.end.x)}
              y={Math.min(marquee.start.y, marquee.end.y)}
              width={Math.abs(marquee.end.x - marquee.start.x)}
              height={Math.abs(marquee.end.y - marquee.start.y)}
              fill={palette.selection}
              opacity={0.12}
              stroke={palette.selection}
              strokeWidth={1}
              dash={[4, 4]}
              listening={false}
            />
          )}

          {isSelectLikeTool && combinedSelectionBounds && (
            <>
              <Rect
                ref={transformTargetRef}
                x={combinedSelectionBounds.x}
                y={combinedSelectionBounds.y}
                width={combinedSelectionBounds.width}
                height={combinedSelectionBounds.height}
                fill="transparent"
                stroke={palette.selection}
                strokeWidth={1.5}
                dash={[6, 4]}
                draggable
                onDragEnd={(event) => {
                  const node = event.target;
                  const dx = node.x() - combinedSelectionBounds.x;
                  const dy = node.y() - combinedSelectionBounds.y;
                  translateElements(selectedElementIds, dx, dy);
                  node.position({ x: combinedSelectionBounds.x, y: combinedSelectionBounds.y });
                }}
                onTransformEnd={() => {
                  const node = transformTargetRef.current;
                  if (!node) return;
                  const factor = node.scaleX();
                  if (Math.abs(factor - 1) < 0.001) {
                    node.scaleX(1);
                    node.scaleY(1);
                    return;
                  }
                  const oldX = combinedSelectionBounds.x;
                  const oldY = combinedSelectionBounds.y;
                  const newX = node.x();
                  const newY = node.y();
                  // Solve p' = pivot + (p - pivot) * factor for the invariant (fixed) corner,
                  // using the top-left corner's known before/after positions.
                  const pivotX = Math.abs(1 - factor) < 1e-6 ? oldX : (newX - oldX * factor) / (1 - factor);
                  const pivotY = Math.abs(1 - factor) < 1e-6 ? oldY : (newY - oldY * factor) / (1 - factor);
                  scaleElements(selectedElementIds, factor, { x: pivotX, y: pivotY });
                  node.scaleX(1);
                  node.scaleY(1);
                  node.position({ x: oldX, y: oldY });
                }}
              />
              <Transformer
                ref={transformerRef}
                rotateEnabled={false}
                keepRatio
                enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
                borderStroke={palette.selection}
                anchorStroke={palette.selection}
                anchorFill={palette.handle}
              />
            </>
          )}

          <Circle x={0} y={0} radius={3} fill={palette.selection} opacity={0.9} />
          <Text x={8} y={-14} text="0,0" fontSize={10} fontFamily="ui-monospace, monospace" fill={palette.label} opacity={0.8} />
        </Layer>
      </Stage>

      {!hasGeometry && !ghostFloorPlan && !traceImage && (
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
});
