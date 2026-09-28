'use client';

import { Canvas, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import { useDesignStore } from '@/store/designStore';
import type { ColorPreset } from '@/store/designStore';
import { computeWallFootprints } from '@/lib/geometry/wall-joints';
import { pixelsPerMeter } from '@/lib/geometry/scale';
import { getPlanBounds } from '@/lib/viewer/plan-bounds';
import { fitCameraToRoom } from '@/lib/viewer/camera-framing';
import { environments } from '@/lib/viewer/theme';
import type { Shading, ViewerTheme } from '@/lib/viewer/theme';
import { WallMesh } from './renderers/WallMesh';
import { DoorMesh } from './renderers/DoorMesh';
import { WindowMesh } from './renderers/WindowMesh';
import { Roof } from './renderers/Roof';
import { Floor } from './renderers/Floor';
import { AxisDragHandle, OpeningAxisHandle } from './renderers/AxisDragHandle';
import { ObjectInstance, type ObjectTransformMode } from './renderers/FurnitureObject';
import { OBJECT_CATALOG_BY_ID } from '@/lib/objects/catalog';
import { cn } from '@/lib/cn';
import { getWallMetrics, getDoorMetrics, getWindowMetrics, getObjectMetrics, type ElementMetrics } from '@/lib/geometry/element-metrics';
import { HoverMetricsHud } from './HoverMetricsHud';
import type { LengthUnit } from '@/lib/units/measurements';

import type { Door, Window, FloorPlan } from '@/types/design';

function resolveHoveredMetrics(
  floorPlan: FloorPlan,
  hoveredElementId: string | null,
  pixelsPerMetre: number,
): ElementMetrics | null {
  if (!hoveredElementId) return null;

  const wall = floorPlan.walls.find((w) => w.id === hoveredElementId);
  if (wall) return getWallMetrics(wall, pixelsPerMetre);

  const door = floorPlan.doors.find((d) => d.id === hoveredElementId);
  if (door) {
    const hostWall = floorPlan.walls.find((w) => w.id === door.wallId);
    return hostWall ? getDoorMetrics(door, hostWall) : null;
  }

  const win = floorPlan.windows.find((w) => w.id === hoveredElementId);
  if (win) return getWindowMetrics(win);

  const object = (floorPlan.objects ?? []).find((o) => o.id === hoveredElementId);
  if (object) {
    const asset = OBJECT_CATALOG_BY_ID[object.assetId];
    return asset ? getObjectMetrics(object, asset) : null;
  }

  return null;
}

// ============================================================================
// SCENE SETUP
// ============================================================================

function SceneContent({
  theme,
  transformMode,
  colorPreset,
  shading,
  showEdges,
}: {
  theme: ViewerTheme;
  transformMode: ObjectTransformMode;
  colorPreset: ColorPreset;
  shading: Shading;
  showEdges: boolean;
}) {
  const {
    floorPlan,
    selectedElementId,
    setSelectedElement,
    updateWall,
    updateDoor,
    updateWindow,
    updateObject,
    setHoveredElement,
    clearHoveredElement,
  } = useDesignStore();
  const walls = floorPlan?.walls;
  const planPixelsPerMeter = pixelsPerMeter(floorPlan?.scale);
  const footprints = useMemo(() => computeWallFootprints(walls ?? [], planPixelsPerMeter), [walls, planPixelsPerMeter]);

  // Room bounds drive the shadow-camera frustum and orbit zoom limits below --
  // both should stay responsive as the plan grows/shrinks, unlike the camera
  // pose itself (see cameraPose below, which intentionally only reacts to a
  // full plan swap).
  const bounds = useMemo(() => getPlanBounds(walls ?? [], planPixelsPerMeter), [walls, planPixelsPerMeter]);
  const wallHeightM = Math.max(1.2, (walls?.[0]?.height ?? 3000) / 1000);

  const { size } = useThree();
  const aspect = size.height > 0 ? size.width / size.height : 1;
  // Recomputed only when a different plan is loaded (floorPlan.id), not on
  // every wall edit -- otherwise the camera would yank the user's view
  // around mid-edit every time they moved a wall. A fresh plan legitimately
  // wants a fresh "fit to room" shot; an in-progress edit doesn't.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cameraPose = useMemo(
    () => (bounds ? fitCameraToRoom(bounds, wallHeightM, aspect) : { position: [14, 11, 14] as [number, number, number], target: [0, 1.5, 0] as [number, number, number] }),
    [floorPlan?.id],
  );

  const openingsByWall = useMemo(() => {
    const doors = new Map<string, Door[]>();
    const windows = new Map<string, Window[]>();

    for (const door of floorPlan?.doors ?? []) {
      const existing = doors.get(door.wallId);
      if (existing) existing.push(door);
      else doors.set(door.wallId, [door]);
    }
    for (const window of floorPlan?.windows ?? []) {
      const existing = windows.get(window.wallId);
      if (existing) existing.push(window);
      else windows.set(window.wallId, [window]);
    }

    return { doors, windows };
  }, [floorPlan?.doors, floorPlan?.windows]);

  if (!floorPlan) return null;

  const environment = environments[theme];
  const gridSize = Math.max(20, Math.ceil(Math.max(floorPlan.width, floorPlan.height) / 1000));
  const gridDivisions = gridSize;
  const wallMap = new Map(floorPlan.walls.map((w) => [w.id, w]));

  // Shadow-camera frustum sized to the room (plus margin) rather than a
  // fixed guess -- a small room got wasted resolution, a large one got
  // clipped shadows, with the previous unconditional default extents.
  const shadowHalfSize = Math.max(6, (bounds?.diagonal ?? 12) / 2 + 2);
  const maxZoomDistance = Math.max(20, (bounds?.diagonal ?? 12) * 4);

  return (
    <>
      <color attach="background" args={[environment.background]} />
      <fog attach="fog" args={[environment.background, 25, 60]} />

      <ambientLight intensity={environment.ambientIntensity} color={environment.ambientColor} />
      <hemisphereLight
        intensity={environment.hemiIntensity}
        color={environment.hemiSkyColor}
        groundColor={environment.hemiGroundColor}
      />
      <directionalLight
        position={[14, 18, 10]}
        intensity={environment.directionalIntensity}
        color={environment.directionalColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-shadowHalfSize}
        shadow-camera-right={shadowHalfSize}
        shadow-camera-top={shadowHalfSize}
        shadow-camera-bottom={-shadowHalfSize}
      />
      <pointLight position={[-8, 12, 6]} intensity={environment.pointIntensity} color={environment.pointColor} />

      <PerspectiveCamera makeDefault position={cameraPose.position} fov={45} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        target={cameraPose.target}
        maxPolarAngle={Math.PI * 0.495}
        minDistance={1.5}
        maxDistance={maxZoomDistance}
      />
      <GizmoHelper alignment="top-right" margin={[340, 90]}>
        <GizmoViewport
          axisColors={['#e0776d', '#82c46c', '#5b9bd5']}
          labelColor="#2a2a2a"
        />
      </GizmoHelper>

      {/* Architecture layer: floor, walls, openings, roof */}
      <Floor width={floorPlan.width} height={floorPlan.height} theme={theme} shading={shading} />

      {floorPlan.walls.map((wall) => {
        const footprint = footprints.get(wall.id);
        const isSelected = selectedElementId === wall.id;
        return footprint ? (
          <group key={wall.id}>
            <WallMesh
              wall={wall}
              footprint={footprint}
              pixelsPerMetre={planPixelsPerMeter}
              doors={openingsByWall.doors.get(wall.id)}
              windows={openingsByWall.windows.get(wall.id)}
              selected={isSelected}
              theme={theme}
              colorPreset={colorPreset}
              shading={shading}
              showEdges={showEdges}
              edgeColor={environment.edgeColor}
              onSelect={() => setSelectedElement(wall.id)}
              onHoverStart={() => setHoveredElement(wall.id)}
              onHoverEnd={() => clearHoveredElement(wall.id)}
            />
            {isSelected && (
              <AxisDragHandle
                axis="y"
                position={[
                  (wall.startPoint.x + wall.endPoint.x) / 2 / planPixelsPerMeter,
                  Math.max(1.2, wall.height / 1000),
                  (wall.startPoint.y + wall.endPoint.y) / 2 / planPixelsPerMeter,
                ]}
                onCommit={(handle) => {
                  const heightMm = Math.round(Math.max(1200, handle.position.y * 1000));
                  updateWall(wall.id, { height: heightMm });
                }}
              />
            )}
          </group>
        ) : null;
      })}

      {floorPlan.doors.map((door) => {
        const wall = wallMap.get(door.wallId);
        if (!wall) return null;
        const isSelected = selectedElementId === door.id;
        return (
          <group key={door.id}>
            <DoorMesh
              door={door}
              wall={wall}
              pixelsPerMetre={planPixelsPerMeter}
              selected={isSelected}
              theme={theme}
              colorPreset={colorPreset}
              shading={shading}
              showEdges={showEdges}
              edgeColor={environment.edgeColor}
              onSelect={() => setSelectedElement(door.id)}
              onHoverStart={() => setHoveredElement(door.id)}
              onHoverEnd={() => clearHoveredElement(door.id)}
            />
            {isSelected && (
              <OpeningAxisHandle
                wall={wall}
                offsetPx={door.position.x}
                heightM={Math.min(wall.height / 1000, 2.1) / 2}
                pixelsPerMetre={planPixelsPerMeter}
                onCommit={(offsetPx) => updateDoor(door.id, { position: { x: offsetPx, y: 0 } })}
              />
            )}
          </group>
        );
      })}

      {floorPlan.windows.map((win) => {
        const wall = wallMap.get(win.wallId);
        if (!wall) return null;
        const isSelected = selectedElementId === win.id;
        return (
          <group key={win.id}>
            <WindowMesh
              window={win}
              wall={wall}
              pixelsPerMetre={planPixelsPerMeter}
              selected={isSelected}
              theme={theme}
              colorPreset={colorPreset}
              shading={shading}
              showEdges={showEdges}
              edgeColor={environment.edgeColor}
              onSelect={() => setSelectedElement(win.id)}
              onHoverStart={() => setHoveredElement(win.id)}
              onHoverEnd={() => clearHoveredElement(win.id)}
            />
            {isSelected && (
              <OpeningAxisHandle
                wall={wall}
                offsetPx={win.position.x}
                heightM={win.sillHeight / 1000 + Math.max(0.6, win.height / 1000) / 2}
                pixelsPerMetre={planPixelsPerMeter}
                onCommit={(offsetPx) => updateWindow(win.id, { position: { x: offsetPx, y: 0 } })}
              />
            )}
          </group>
        );
      })}

      <Roof
        walls={floorPlan.walls}
        wallHeight={floorPlan.walls[0]?.height ?? 3000}
        theme={theme}
        pixelsPerMetre={planPixelsPerMeter}
        shading={shading}
        showEdges={showEdges}
        edgeColor={environment.edgeColor}
      />

      {/* Furniture layer: objects on floor */}
      {(floorPlan.objects ?? []).map((object) => {
        const asset = OBJECT_CATALOG_BY_ID[object.assetId];
        if (!asset) return null;

        const worldX = object.position.x / planPixelsPerMeter;
        const worldZ = object.position.y / planPixelsPerMeter;
        const worldY = asset.dimensions[1] / 2;

        return (
          <ObjectInstance
            key={object.id}
            object={object}
            asset={asset}
            selected={selectedElementId === object.id}
            transformMode={transformMode}
            worldPosition={[worldX, worldY, worldZ]}
            pixelsPerMetre={planPixelsPerMeter}
            onSelect={() => setSelectedElement(object.id)}
            onCommitTransform={(updates) => updateObject(object.id, updates)}
            onHoverStart={() => setHoveredElement(object.id)}
            onHoverEnd={() => clearHoveredElement(object.id)}
          />
        );
      })}

      <gridHelper
        args={[gridSize, gridDivisions, environment.gridMajor, environment.gridMinor]}
        position={[0, 0.01, 0]}
      />
    </>
  );
}

const TRANSFORM_MODE_LABELS: Record<Exclude<ObjectTransformMode, null>, string> = {
  translate: 'Move',
  rotate: 'Rotate',
  scale: 'Scale',
};

export function Canvas3DContainer({ theme, lengthUnit = 'm' }: { theme: ViewerTheme; lengthUnit?: LengthUnit }) {
  const { floorPlan, selectedElementId, hoveredElementId, colorPreset, setColorPreset } = useDesignStore();
  const [transformMode, setTransformMode] = useState<ObjectTransformMode>(null);
  const [shading, setShading] = useState<Shading>('rendered');
  const [showEdges, setShowEdges] = useState(false);
  const selectedIsObject = (floorPlan?.objects ?? []).some((o) => o.id === selectedElementId);

  // colorPreset lives in the shared store (2D reads it too, for validation-
  // view parity); this component only owns its localStorage persistence.
  useEffect(() => {
    const saved = window.localStorage.getItem('corbel-viewer-color-preset');
    if (saved === 'standard' || saved === 'validation') setColorPreset(saved);

    const savedShading = window.localStorage.getItem('corbel-viewer-shading');
    if (savedShading === 'solid' || savedShading === 'rendered') setShading(savedShading);

    const savedEdges = window.localStorage.getItem('corbel-viewer-edges');
    if (savedEdges === 'true' || savedEdges === 'false') setShowEdges(savedEdges === 'true');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.localStorage.setItem('corbel-viewer-color-preset', colorPreset);
  }, [colorPreset]);

  useEffect(() => {
    window.localStorage.setItem('corbel-viewer-edges', String(showEdges));
  }, [showEdges]);

  useEffect(() => {
    window.localStorage.setItem('corbel-viewer-shading', shading);
  }, [shading]);

  // Only furniture gets a move/rotate/scale mode; walls/doors/windows use their
  // own always-on drag handle instead. Drop a stale mode when selection changes.
  useEffect(() => {
    if (!selectedIsObject) setTransformMode(null);
  }, [selectedElementId, selectedIsObject]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedIsObject) return;
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'g' || e.key === 'G') setTransformMode('translate');
      else if (e.key === 'r' || e.key === 'R') setTransformMode('rotate');
      else if (e.key === 's' || e.key === 'S') setTransformMode('scale');
      else if (e.key === 'Escape') setTransformMode(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIsObject]);

  if (!floorPlan) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[var(--editor-canvas)] text-[var(--editor-text-subtle)]">
        Preparing spatial view…
      </div>
    );
  }

  const openingCount = floorPlan.doors.length + floorPlan.windows.length;
  const planPixelsPerMeter = pixelsPerMeter(floorPlan.scale);
  const hoveredMetrics = resolveHoveredMetrics(floorPlan, hoveredElementId, planPixelsPerMeter);

  return (
    <div
      className="relative h-full w-full bg-[var(--editor-canvas)]"
      tabIndex={0}
      role="group"
      aria-label={`3D view of the floor plan: ${floorPlan.walls.length} ${
        floorPlan.walls.length === 1 ? 'wall' : 'walls'
      }, ${floorPlan.rooms.length} ${floorPlan.rooms.length === 1 ? 'room' : 'rooms'}, ${openingCount} ${
        openingCount === 1 ? 'opening' : 'openings'
      }. Drag to orbit the camera; the 2D view and the Outline panel are the reliable way to select and edit elements without a mouse.`}
    >
      <Canvas shadows dpr={[1, 2]}>
        <SceneContent theme={theme} transformMode={transformMode} colorPreset={colorPreset} shading={shading} showEdges={showEdges} />
      </Canvas>

      <HoverMetricsHud metrics={hoveredMetrics} lengthUnit={lengthUnit} />

      <button
        type="button"
        onClick={() => setShowEdges((current) => !current)}
        title="Toggle a hard-edge line overlay for a blueprint-style look"
        className={cn(
          'editor-island absolute bottom-24 right-4 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
          showEdges
            ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
            : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
        )}
      >
        {showEdges ? 'Edges on' : 'Edges off'}
      </button>

      <button
        type="button"
        onClick={() => setShading((current) => (current === 'solid' ? 'rendered' : 'solid'))}
        title="Toggle a cheaper, flat-shaded view (no PBR specular)"
        className={cn(
          'editor-island absolute bottom-14 right-4 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
          shading === 'solid'
            ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
            : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
        )}
      >
        {shading === 'solid' ? 'Solid shading' : 'Rendered shading'}
      </button>

      <button
        type="button"
        onClick={() => setColorPreset(colorPreset === 'validation' ? 'standard' : 'validation')}
        title="Toggle a colour view that flags low-confidence AI-extracted elements"
        className={cn(
          'editor-island absolute bottom-4 right-4 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
          colorPreset === 'validation'
            ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
            : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
        )}
      >
        {colorPreset === 'validation' ? 'Validation view' : 'Standard view'}
      </button>

      {selectedIsObject && (
        // bottom-20, not bottom-4: the app-wide tool dock (EditorWithCanvas.tsx)
        // now also sits bottom-center, so this toolbar floats just above it
        // instead of overlapping in full-width 3D view.
        <div className="editor-island absolute bottom-20 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl p-1.5">
          {(Object.keys(TRANSFORM_MODE_LABELS) as Array<Exclude<ObjectTransformMode, null>>).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setTransformMode((current) => (current === mode ? null : mode))}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                transformMode === mode
                  ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                  : 'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]'
              )}
            >
              {TRANSFORM_MODE_LABELS[mode]}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">{mode === 'translate' ? 'G' : mode === 'rotate' ? 'R' : 'S'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
