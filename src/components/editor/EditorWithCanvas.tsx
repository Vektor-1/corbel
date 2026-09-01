'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Diff,
  DoorOpen,
  Download,
  Eye,
  EyeOff,
  Moon,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  PanelsTopLeft,
  Pointer,
  Redo2,
  Save,
  ScanLine,
  Square,
  Sun,
  Trash2,
  Undo2,
  Grid3X3,
  Ruler,
  Tag,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EditorPanel } from '@/components/ui/editor-panel';
import { FieldLabel, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import { OBJECT_CATALOG, OBJECT_CATALOG_BY_ID, OBJECT_CATEGORIES } from '@/lib/objects/catalog';
import { deriveRoomsFromWalls } from '@/lib/geometry/rooms';
import { useDesignStore } from '@/store/designStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useFeatureFlag } from '@/lib/flags';
import { Canvas2D } from './Canvas2D';
import { ComparisonPanel } from './ComparisonPanel';
import { EditorReviewBadge } from './EditorReviewBadge';
import { Canvas3DContainer } from '../viewer/Canvas3D';
import {
  ComplianceScore,
  SelectedDoorInspector,
  SelectedObjectInspector,
  SelectedRoomInspector,
  SelectedWallInspector,
  SelectedWindowInspector,
  Statistics,
  ValidationPanel,
} from './EditorPanels';
import type { MaterialType, ObjectAssetId, ObjectCategory, Room, WallType } from '@/types/design';
import { formatArea, toMillimetres, type AreaUnit, type LengthUnit } from '@/lib/units/measurements';

const viewOptions = [
  { value: '2d', label: 'Plan' },
  { value: '3d', label: 'Spatial' },
  { value: 'split', label: 'Split' },
] as const;

const toolShortcuts: Record<string, string> = {
  select: 'S', wall: 'W', door: 'D', window: 'N', object: 'O', delete: 'X',
};

export function EditorWithCanvas() {
  useKeyboardShortcuts();

  const canvasStageRef = useRef<import('konva/lib/Stage').Stage | null>(null);

  function handleSave() {
    const { floorPlan } = useDesignStore.getState();
    if (!floorPlan) return;
    const json = JSON.stringify(floorPlan, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${floorPlan.name ?? 'corbel-plan'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    const { floorPlan } = useDesignStore.getState();
    if (!floorPlan) return;
    const json = JSON.stringify(floorPlan, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${floorPlan.name ?? 'corbel-plan'}.corbel.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.corbel.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const { importDesignFloorJson, validateDesignFloorJson } = await import('@/lib/import/designFloorJson');
        if (!validateDesignFloorJson(data)) {
          alert('Invalid Corbel JSON format');
          return;
        }
        const floorPlan = importDesignFloorJson(data);
        useDesignStore.getState().setFloorPlan(floorPlan);
        alert('Plan imported successfully');
      } catch {
        alert('Failed to import plan. Check file format.');
      }
    };
    input.click();
  }

  function handleClearDesign() {
    const confirmed = window.confirm('Clear this design? All walls, rooms, doors, windows, objects, and reference plans will be removed.');
    if (!confirmed) return;
    useDesignStore.getState().clearDesign();
  }

  const [defaultWallMaterial, setDefaultWallMaterial] = useState<MaterialType>('sandcrete');
  const [defaultWallThickness, setDefaultWallThickness] = useState(225);
  const [defaultWallHeight, setDefaultWallHeight] = useState(2700);
  const [defaultWallType, setDefaultWallType] = useState<WallType>('loadBearing');
  const [activeObjectAssetId, setActiveObjectAssetId] = useState<ObjectAssetId>('dining-table');
  const [objectQuery, setObjectQuery] = useState('');
  const [objectCategory, setObjectCategory] = useState<'all' | ObjectCategory>('all');
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [diffMode, setDiffMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showRoomLabels, setShowRoomLabels] = useState(true);
  const [showWallDimensions, setShowWallDimensions] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('mm');
  const [calibrationLength, setCalibrationLength] = useState('3');
  const [calibrationUnit, setCalibrationUnit] = useState<Exclude<LengthUnit, 'ft-in'>>('m');
  const areaUnit: AreaUnit = lengthUnit === 'ft' || lengthUnit === 'in' || lengthUnit === 'ft-in' ? 'ft²' : 'm²';
  const validationEnabled = useFeatureFlag('validation');
  const undoRedoEnabled = useFeatureFlag('undoRedo');
  const traceToLearnEnabled = useFeatureFlag('traceToLearn');
  const threeDPreviewEnabled = useFeatureFlag('threeDPreview');

  const {
    floorPlan,
    currentTool,
    selectedElementId,
    viewMode,
    ghostFloorPlan,
    ghostOpacity,
    setCurrentTool,
    setViewMode,
    setSelectedElement,
    setRooms,
    updateRoom,
    updateWall,
    updateDoor,
    updateWindow,
    updateObject,
    setGhostOpacity,
    restoreGhostBaseline,
    traceImage,
    updateTraceImage,
    setTraceImage,
    calibrateTraceFromWall,
    validationResults,
  } = useDesignStore();

  const tools = [
    { id: 'select', label: 'Select', icon: Pointer },
    { id: 'wall', label: 'Wall', icon: Square },
    { id: 'door', label: 'Door', icon: DoorOpen },
    { id: 'window', label: 'Window', icon: PanelsTopLeft },
    { id: 'object', label: 'Object', icon: Box },
    { id: 'delete', label: 'Delete', icon: Trash2 },
  ] as const;

  useEffect(() => {
    if (!['select', 'wall', 'door', 'window', 'object', 'delete'].includes(currentTool)) setCurrentTool('select');
  }, [currentTool, setCurrentTool]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('corbel-editor-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

    const savedUnit = window.localStorage.getItem('corbel-measurement-unit');
    if (savedUnit === 'mm' || savedUnit === 'cm' || savedUnit === 'm' || savedUnit === 'in' || savedUnit === 'ft' || savedUnit === 'ft-in') {
      setLengthUnit(savedUnit);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('corbel-editor-theme', theme);
    document.documentElement.setAttribute('data-corbel-editor', theme);
    return () => document.documentElement.removeAttribute('data-corbel-editor');
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem('corbel-measurement-unit', lengthUnit);
  }, [lengthUnit]);

  const derivedRooms = useMemo(() => deriveRoomsFromWalls(floorPlan?.walls ?? [], floorPlan?.scale), [floorPlan?.walls, floorPlan?.scale]);

  useEffect(() => {
    if (!floorPlan) return;

    const existingById = new Map(floorPlan.rooms.map((room) => [room.id, room]));
    const nextRooms = derivedRooms.map((room) => ({
      ...room,
      name: existingById.get(room.id)?.name ?? room.name,
      type: existingById.get(room.id)?.type,
    }));
    const geometrySignature = (rooms: Room[]) =>
      rooms.map((room) => ({ id: room.id, area: room.area, vertices: room.vertices }));

    if (JSON.stringify(geometrySignature(floorPlan.rooms)) !== JSON.stringify(geometrySignature(nextRooms))) {
      setRooms(nextRooms);
    }
  }, [derivedRooms, floorPlan, setRooms]);

  const selectedWall = floorPlan?.walls.find((wall) => wall.id === selectedElementId) ?? null;
  const selectedRoom = floorPlan?.rooms.find((room) => room.id === selectedElementId) ?? null;
  const selectedDoor = floorPlan?.doors.find((door) => door.id === selectedElementId) ?? null;
  const selectedWindow = floorPlan?.windows.find((window) => window.id === selectedElementId) ?? null;
  const selectedObject = floorPlan?.objects?.find((object) => object.id === selectedElementId) ?? null;
  const selectedObjectAsset = selectedObject ? OBJECT_CATALOG_BY_ID[selectedObject.assetId] : null;
  const selectedWallResults = selectedWall
    ? validationResults.filter((result) => result.targetId === selectedWall.id)
    : [];
  const selectedRoomResults = selectedRoom
    ? validationResults.filter((result) => result.targetId === selectedRoom.id)
    : [];
  const selectedOpeningResults = selectedDoor || selectedWindow
    ? validationResults.filter((result) => result.targetId === (selectedDoor?.id ?? selectedWindow?.id))
    : [];
  const totalElements =
    (floorPlan?.walls.length ?? 0) +
    (floorPlan?.rooms.length ?? 0) +
    (floorPlan?.doors.length ?? 0) +
    (floorPlan?.windows.length ?? 0) +
    (floorPlan?.objects?.length ?? 0);
  const hasGeometry = totalElements > 0;
  const errorCount = validationResults.filter((result) => result.type === 'error').length;
  const warningCount = validationResults.filter((result) => result.type === 'warning').length;
  const complianceScore = useMemo(
    () => (hasGeometry ? Math.max(28, 100 - errorCount * 18 - warningCount * 8) : null),
    [errorCount, hasGeometry, warningCount]
  );
  const filteredObjects = useMemo(() => {
    const query = objectQuery.trim().toLowerCase();
    return OBJECT_CATALOG.filter((asset) => {
      const matchesCategory = objectCategory === 'all' || asset.category === objectCategory;
      const matchesQuery =
        !query ||
        asset.name.toLowerCase().includes(query) ||
        asset.tags.some((tag) => tag.toLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [objectCategory, objectQuery]);

  const statusHint =
    currentTool === 'wall'
      ? 'Drag to draw · Esc to cancel'
      : currentTool === 'delete'
      ? 'Click a wall, opening or object to delete'
      : currentTool === 'door'
      ? 'Click a wall to place a 900 mm door'
      : currentTool === 'window'
      ? 'Click a wall to place a 1200 mm window'
      : currentTool === 'object'
      ? viewMode === '3d'
        ? 'Switch to Plan or Split to place objects'
        : `Click in the plan to place ${OBJECT_CATALOG_BY_ID[activeObjectAssetId].name}`
      : (floorPlan?.rooms.length ?? 0) > 0
      ? `${floorPlan?.rooms.length} closed ${floorPlan?.rooms.length === 1 ? 'space' : 'spaces'} · Select one to name it`
      : (floorPlan?.walls.length ?? 0) >= 3
      ? 'Join wall endpoints to form a closed space'
      : 'Click an element to select';

  return (
    <TooltipProvider delay={300}>
      <div
        className="corbel-editor relative h-screen w-screen overflow-hidden bg-[var(--editor-canvas)] text-[var(--editor-text)]"
        data-theme={theme}
      >
        {/* ── Canvas layer: the workspace owns the full viewport ── */}
        <div className="absolute inset-0 flex">
          {(viewMode === '2d' || viewMode === 'split') && (
            <div
              className={cn(
                'h-full',
                viewMode === 'split' ? 'w-1/2 border-r border-[var(--editor-border)]' : 'w-full'
              )}
            >
              <Canvas2D
                defaultWallMaterial={defaultWallMaterial}
                defaultWallThickness={defaultWallThickness}
                defaultWallHeight={defaultWallHeight}
                defaultWallType={defaultWallType}
                theme={theme}
                activeObjectAssetId={activeObjectAssetId}
                ghostFloorPlan={ghostFloorPlan}
                ghostOpacity={ghostOpacity}
                traceImage={traceImage}
                diffMode={diffMode}
                stageRef={canvasStageRef}
                showGrid={showGrid}
                showRoomLabels={showRoomLabels}
                showWallDimensions={showWallDimensions}
                lengthUnit={lengthUnit}
                areaUnit={areaUnit}
              />
            </div>
          )}

          {(viewMode === '3d' || viewMode === 'split') && (
            <div className={cn('h-full', viewMode === 'split' ? 'w-1/2' : 'w-full')}>
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-[var(--editor-text-subtle)]">
                    Preparing spatial view…
                  </div>
                }
              >
                <Canvas3DContainer theme={theme} />
              </Suspense>
            </div>
          )}
        </div>

        {/* ── Top left · identity island ── */}
        <div className="editor-island absolute left-4 top-4 flex h-11 items-center gap-3 rounded-xl pl-4 pr-3">
          <span className="font-display text-[17px] leading-none tracking-tight text-[var(--editor-text)]">
            Corbel
          </span>
          <Separator orientation="vertical" className="!h-4 bg-[var(--editor-border)]" />
          <span className="max-w-44 truncate text-xs text-[var(--editor-text-muted)]">
            {floorPlan?.name || 'Untitled study'}
          </span>
          <span className="rounded-full border border-[var(--editor-accent)]/30 bg-[var(--editor-accent-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--editor-accent-text)]">
            Draft
          </span>
          <select
            aria-label="Measurement unit"
            className="h-7 rounded-md border border-[var(--editor-border)] bg-[var(--editor-surface)] px-1.5 text-[10px] text-[var(--editor-text)]"
            value={lengthUnit}
            onChange={(event) => setLengthUnit(event.target.value as LengthUnit)}
          >
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
            <option value="ft-in">ft/in</option>
            <option value="in">in</option>
          </select>
        </div>

        {/* ── Top center · view switcher ── */}
        <div className="editor-island absolute left-1/2 top-4 flex h-11 -translate-x-1/2 items-center rounded-xl px-1.5">
          <ToggleGroup
            value={[viewMode]}
            onValueChange={(value: string[]) => {
              const next = value[0];
              if (next === '2d' || next === '3d' || next === 'split') setViewMode(next);
            }}
            spacing={1}
          >
            {viewOptions
              .filter((opt) => opt.value === '2d' || threeDPreviewEnabled)
              .map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  size="sm"
                  className={cn(
                    'px-3 text-[11px] font-medium tracking-[0.02em] text-[var(--editor-text-subtle)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]',
                    viewMode === option.value &&
                      'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] data-pressed:bg-[var(--editor-accent-soft)] data-pressed:text-[var(--editor-accent-text)]'
                  )}
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
          </ToggleGroup>
        </div>

        {/* ── Top right · frequent actions + grouped secondary actions ── */}
        <div className="absolute right-4 top-4 z-20" aria-label="Editor actions">
          <div className="editor-island flex h-11 items-center gap-1 rounded-xl px-1.5">
            {undoRedoEnabled && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="ghost" size="icon-sm" onClick={() => (useDesignStore as any).temporal.getState().undo()}><Undo2 /></Button>}
                  />
                  <TooltipContent>Undo ⌘Z</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="ghost" size="icon-sm" onClick={() => (useDesignStore as any).temporal.getState().redo()}><Redo2 /></Button>}
                  />
                  <TooltipContent>Redo ⇧⌘Z</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="mx-1 !h-4 bg-[var(--editor-border)]" />
              </>
            )}
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>}
              />
              <TooltipContent>{inspectorOpen ? 'Hide inspector' : 'Show inspector'}</TooltipContent>
            </Tooltip>
            <Button
              variant={actionsOpen ? 'secondary' : 'ghost'}
              size="sm"
              aria-expanded={actionsOpen}
              aria-controls="editor-actions-menu"
              onClick={() => setActionsOpen((open) => !open)}
            >
              <MoreHorizontal />
              Actions
            </Button>
          </div>

          {actionsOpen && (
            <div id="editor-actions-menu" className="editor-action-menu editor-island absolute right-0 top-14 w-72 rounded-xl p-2.5" role="menu">
              <div className="flex items-baseline justify-between px-1.5 pb-2">
                <p className="text-[12px] font-semibold text-[var(--editor-text)]">Workspace</p>
                <p className="text-[10px] text-[var(--editor-text-subtle)]">Display and file tools</p>
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface-muted)]">
                <div className="grid grid-cols-3 divide-x divide-[var(--editor-border)]">
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showGrid ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowGrid((v) => !v)} aria-pressed={showGrid}><Grid3X3 />Grid</Button>
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showRoomLabels ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowRoomLabels((v) => !v)} aria-pressed={showRoomLabels}><Tag />Labels</Button>
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showWallDimensions ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowWallDimensions((v) => !v)} aria-pressed={showWallDimensions}><Ruler />Dimensions</Button>
                </div>
              </div>
              {traceToLearnEnabled && (
                <>
                  <Separator className="my-2 bg-[var(--editor-border)]" />
                  <p className="px-1.5 pb-1 text-[11px] font-medium text-[var(--editor-text-muted)]">Learning</p>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => window.location.assign('/upload')}><ScanLine />Start image retrace</Button>
                  {traceImage && (
                    <div className="mt-1 rounded-lg bg-[var(--editor-surface-muted)] p-2">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--editor-text-muted)]"><span>Reference image</span><span>2D guide</span></div>
                      <p className="mb-2 text-[10px] leading-4 text-[var(--editor-text-subtle)]">The image is a visual guide. Its display size does not set real-world measurements.</p>
                      {traceImage.calibration ? (
                        <div className="mb-2 rounded-md bg-[var(--editor-success-soft)] px-2 py-1.5 text-[10px] leading-4 text-[var(--editor-success)]">
                          Calibrated from the selected wall · {traceImage.calibration.knownLengthMm} mm · {Math.round(traceImage.calibration.pixelsPerMeter)} px/m
                        </div>
                      ) : (
                        <div className="mb-2 rounded-md bg-[var(--editor-warning-soft)] px-2 py-1.5 text-[10px] leading-4 text-[var(--editor-warning)]">
                          Set one known wall length before relying on area or dimension feedback.
                        </div>
                      )}
                      <div className="mb-2 grid grid-cols-[1fr_auto] gap-1.5">
                        <Input
                          type="number"
                          min={0.1}
                          step={calibrationUnit === 'm' || calibrationUnit === 'ft' ? 0.1 : 10}
                          value={calibrationLength}
                          onChange={(event) => setCalibrationLength(event.target.value)}
                          aria-label="Known wall length"
                        />
                        <Select
                          className="w-[4.5rem]"
                          value={calibrationUnit}
                          onChange={(event) => setCalibrationUnit(event.target.value as Exclude<LengthUnit, 'ft-in'>)}
                          aria-label="Known wall length unit"
                        >
                          <option value="mm">mm</option>
                          <option value="cm">cm</option>
                          <option value="m">m</option>
                          <option value="ft">ft</option>
                          <option value="in">in</option>
                        </Select>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="mb-2 w-full justify-start"
                        disabled={!selectedWall}
                        onClick={() => {
                          const value = Number(calibrationLength);
                          if (!Number.isFinite(value) || value <= 0) {
                            window.alert('Enter a positive known wall length before calibrating.');
                            return;
                          }
                          const lengthMm = toMillimetres(value, calibrationUnit);
                          if (!calibrateTraceFromWall(selectedWall?.id ?? '', lengthMm)) {
                            window.alert('Choose a traced wall and enter a realistic positive length before calibrating.');
                          }
                        }}
                      >
                        <Ruler /> {selectedWall ? 'Calibrate from selected wall' : 'Select a traced wall to calibrate'}
                      </Button>
                      <label className="mb-1 block text-[10px] text-[var(--editor-text-subtle)]">Image display size · {traceImage.scale.toFixed(2)}×</label>
                      <input type="range" min={0.25} max={1.5} step={0.05} value={traceImage.scale} onChange={(event) => updateTraceImage({ scale: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image scale" />
                      <label className="mb-1 mt-2 block text-[10px] text-[var(--editor-text-subtle)]">Blur · {traceImage.blur}px</label>
                      <input type="range" min={0} max={12} step={1} value={traceImage.blur} onChange={(event) => updateTraceImage({ blur: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image blur" />
                      <label className="mb-1 mt-2 block text-[10px] text-[var(--editor-text-subtle)]">Opacity · {Math.round(traceImage.opacity * 100)}%</label>
                      <input type="range" min={0} max={1} step={0.05} value={traceImage.opacity} onChange={(event) => updateTraceImage({ opacity: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image opacity" />
                      <Button variant="ghost" size="sm" className="mt-1.5 w-full justify-start text-[var(--editor-text-muted)]" onClick={() => setTraceImage(null)}><EyeOff />Remove reference image</Button>
                    </div>
                  )}
                  {ghostFloorPlan && (
                    <div className="mt-1 rounded-lg bg-[var(--editor-surface-muted)] p-2">
                      <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--editor-text-muted)]"><span>Original plan</span><span>{Math.round(ghostOpacity * 100)}%</span></div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => setGhostOpacity(ghostOpacity > 0 ? 0 : 0.25)} aria-label={ghostOpacity > 0 ? 'Hide original plan' : 'Show original plan'}>{ghostOpacity > 0 ? <Eye size={13} /> : <EyeOff size={13} />}</Button>
                        <Button variant={diffMode ? 'secondary' : 'ghost'} size="icon-sm" onClick={() => setDiffMode((v) => !v)} aria-label={diffMode ? 'Hide change highlights' : 'Highlight changes vs original'}><Diff size={13} /></Button>
                        <input type="range" min={0} max={1} step={0.05} value={ghostOpacity} onChange={(e) => setGhostOpacity(Number(e.target.value))} className="min-w-0 flex-1 accent-[var(--editor-accent)]" aria-label="Original plan opacity" />
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1.5 w-full justify-start text-[var(--editor-text-muted)]"
                        onClick={() => {
                          if (window.confirm('Restore the editable design to the imported baseline? Your current edits will be replaced.')) {
                            restoreGhostBaseline();
                            setDiffMode(false);
                          }
                        }}
                      >
                        <Undo2 /> Restore imported baseline
                      </Button>
                    </div>
                  )}
                </>
              )}
              <Separator className="my-2 bg-[var(--editor-border)]" />
              <p className="px-1.5 pb-1 text-[11px] font-medium text-[var(--editor-text-muted)]">Design file</p>
              <div className="grid grid-cols-2 gap-1.5">
                <Button variant="ghost" size="sm" className="justify-start" onClick={handleImport}><Download style={{ transform: 'rotate(180deg)' }} />Open design</Button>
                <Button variant="ghost" size="sm" className="justify-start" onClick={handleExport}><Download />Download design</Button>
                <Button variant="ghost" size="sm" className="justify-start text-[var(--editor-text-muted)]" onClick={handleSave}><Save />Save a copy</Button>
                <Button variant="ghost" size="sm" className="justify-start" onClick={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}>{theme === 'light' ? <Moon /> : <Sun />}{theme === 'light' ? 'Use dark theme' : 'Use light theme'}</Button>
              </div>
              <div className="mt-1.5"><EditorReviewBadge /></div>
              <Button variant="ghost" size="sm" className="mt-1.5 w-full justify-start text-[var(--editor-danger)]" onClick={handleClearDesign}><Trash2 />Clear all design content</Button>
            </div>
          )}
        </div>

        {/* ── Left · floating tool dock ── */}
        <div className="editor-island absolute left-4 top-1/2 flex -translate-y-1/2 flex-col gap-1 rounded-xl p-1.5">
          {tools.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCurrentTool(id)}
                    className={cn(
                      'text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]',
                      currentTool === id &&
                        'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)] hover:text-[var(--editor-accent-text)]'
                    )}
                  >
                    <Icon />
                  </Button>
                }
              />
              <TooltipContent side="right">
                {label}
                <span className="ml-2 font-mono text-[10px] opacity-60">{toolShortcuts[id]}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>

        {/* ── Right · inspector island ── */}
        {inspectorOpen && (
          <div className="editor-island absolute bottom-14 right-4 top-[4.75rem] flex w-72 flex-col overflow-hidden rounded-xl">
            <ScrollArea className="min-h-0 flex-1">
              <div className="divide-y divide-[var(--editor-border)]">
                {/* Scene tree */}
                <EditorPanel
                  title="Outline"
                  action={
                    <span className="font-mono text-[10px] tabular-nums text-[var(--editor-text-subtle)]">
                      {totalElements}
                    </span>
                  }
                >
                  <button
                    type="button"
                    onClick={() => setSelectedElement(null)}
                    className={cn(
                      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                      !selectedWall && !selectedRoom && !selectedDoor && !selectedWindow && !selectedObject
                        ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                        : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                    )}
                  >
                    <ChevronDown size={12} className="mr-1.5 shrink-0" />
                    {floorPlan?.name || 'Courtyard Study'}
                  </button>
                  <div className="ml-3 mt-0.5 border-l border-[var(--editor-border)] pl-1.5">
                    {floorPlan?.walls.length ? (
                      floorPlan.walls.map((wall, index) => (
                        <button
                          type="button"
                          key={wall.id}
                          onClick={() => setSelectedElement(wall.id)}
                          className={cn(
                            'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                            selectedElementId === wall.id
                              ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                              : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                          )}
                        >
                          <Square size={10} className="mr-2 shrink-0" />
                          Wall {index + 1}
                        </button>
                      ))
                    ) : (
                      <p className="px-2 py-1.5 text-[11px] text-[var(--editor-text-subtle)]">
                        No walls yet
                      </p>
                    )}
                    {(floorPlan?.rooms.length ?? 0) > 0 && (
                      <div className="mt-1 border-t border-[var(--editor-border)] pt-1">
                        {floorPlan?.rooms.map((room) => (
                          <button
                            type="button"
                            key={room.id}
                            onClick={() => setSelectedElement(room.id)}
                            className={cn(
                              'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                              selectedElementId === room.id
                                ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                                : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                            )}
                          >
                            <Box size={10} className="mr-2 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{room.name}</span>
                            <span className="ml-2 font-mono text-[9px] text-[var(--editor-text-subtle)]">
                              {formatArea(room.area, areaUnit)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {((floorPlan?.doors.length ?? 0) + (floorPlan?.windows.length ?? 0)) > 0 && (
                      <div className="mt-1 border-t border-[var(--editor-border)] pt-1">
                        {floorPlan?.doors.map((door, index) => (
                          <button
                            type="button"
                            key={door.id}
                            onClick={() => setSelectedElement(door.id)}
                            className={cn(
                              'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                              selectedElementId === door.id
                                ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                                : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                            )}
                          >
                            <DoorOpen size={10} className="mr-2 shrink-0" />
                            Door {index + 1}
                          </button>
                        ))}
                        {floorPlan?.windows.map((window, index) => (
                          <button
                            type="button"
                            key={window.id}
                            onClick={() => setSelectedElement(window.id)}
                            className={cn(
                              'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                              selectedElementId === window.id
                                ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                                : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                            )}
                          >
                            <PanelsTopLeft size={10} className="mr-2 shrink-0" />
                            Window {index + 1}
                          </button>
                        ))}
                      </div>
                    )}
                    {(floorPlan?.objects?.length ?? 0) > 0 && (
                      <div className="mt-1 border-t border-[var(--editor-border)] pt-1">
                        {floorPlan?.objects.map((object, index) => (
                          <button
                            type="button"
                            key={object.id}
                            onClick={() => setSelectedElement(object.id)}
                            className={cn(
                              'flex w-full items-center rounded-md px-2 py-1.5 text-left text-[11px] transition-colors',
                              selectedElementId === object.id
                                ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)]'
                                : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]'
                            )}
                          >
                            <Box size={10} className="mr-2 shrink-0" />
                            {OBJECT_CATALOG_BY_ID[object.assetId]?.name ?? 'Unavailable object'} {index + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </EditorPanel>

                {selectedWall ? (
                  <>
                    <SelectedWallInspector
                      wall={selectedWall}
                      results={selectedWallResults}
                      onUpdate={(updates) => updateWall(selectedWall.id, updates)}
                    />
                    <ValidationPanel
                      results={selectedWallResults}
                      hasGeometry
                      title="Wall feedback"
                      emptyMessage="This wall passes the current checks."
                      onSelectElement={setSelectedElement}
                    />
                  </>
                ) : selectedDoor ? (
                  <>
                    <SelectedDoorInspector
                      door={selectedDoor}
                      onUpdate={(updates) => updateDoor(selectedDoor.id, updates)}
                    />
                    <ValidationPanel
                      results={selectedOpeningResults}
                      hasGeometry
                      title="Door feedback"
                      emptyMessage="This door passes the current width check."
                      onSelectElement={setSelectedElement}
                    />
                  </>
                ) : selectedWindow ? (
                  <>
                    <SelectedWindowInspector
                      window={selectedWindow}
                      onUpdate={(updates) => updateWindow(selectedWindow.id, updates)}
                    />
                    <ValidationPanel
                      results={selectedOpeningResults}
                      hasGeometry
                      title="Window feedback"
                      emptyMessage="This window passes the current width check."
                      onSelectElement={setSelectedElement}
                    />
                  </>
                ) : selectedRoom ? (
                  <>
                    <SelectedRoomInspector
                      room={selectedRoom}
                      onUpdate={(updates) => updateRoom(selectedRoom.id, updates)}
                    />
                    <ValidationPanel
                      results={selectedRoomResults}
                      hasGeometry
                      title="Room feedback"
                      emptyMessage="This room passes the current area checks."
                      onSelectElement={setSelectedElement}
                    />
                  </>
                ) : selectedObject && selectedObjectAsset ? (
                  <SelectedObjectInspector
                    object={selectedObject}
                    asset={selectedObjectAsset}
                    onUpdate={(updates) => updateObject(selectedObject.id, updates)}
                  />
                ) : (
                  <>
                    <EditorPanel
                      title="Objects"
                      description="Choose an asset, then place it in Plan view"
                      action={
                        <span className="font-mono text-[10px] tabular-nums text-[var(--editor-text-subtle)]">
                          {filteredObjects.length}/{OBJECT_CATALOG.length}
                        </span>
                      }
                    >
                      <div className="mb-3 space-y-2">
                        <Input
                          type="search"
                          value={objectQuery}
                          onChange={(event) => setObjectQuery(event.target.value)}
                          placeholder="Search objects"
                          aria-label="Search objects"
                        />
                        <Select
                          value={objectCategory}
                          onChange={(event) => setObjectCategory(event.target.value as 'all' | ObjectCategory)}
                          aria-label="Filter objects by category"
                        >
                          {OBJECT_CATEGORIES.map((category) => (
                            <option key={category.id} value={category.id}>{category.label}</option>
                          ))}
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {filteredObjects.map((asset) => (
                          <button
                            type="button"
                            key={asset.id}
                            onClick={() => {
                              setActiveObjectAssetId(asset.id);
                              setCurrentTool('object');
                            }}
                            className={cn(
                              'overflow-hidden rounded-lg border text-left transition-colors',
                              currentTool === 'object' && activeObjectAssetId === asset.id
                                ? 'border-[var(--editor-accent)] bg-[var(--editor-accent-soft)]'
                                : 'border-[var(--editor-border)] bg-[var(--editor-surface-raised)] hover:border-[var(--editor-border-strong)]'
                            )}
                          >
                            <img
                              src={asset.thumbnailUrl}
                              alt=""
                              loading="lazy"
                              className="h-16 w-full bg-[var(--editor-surface-muted)] object-contain"
                            />
                            <span className="block truncate px-2 py-1.5 text-[11px] font-medium text-[var(--editor-text-muted)]">
                              {asset.name}
                            </span>
                          </button>
                        ))}
                      </div>
                      {filteredObjects.length === 0 && (
                        <p className="py-5 text-center text-[11px] text-[var(--editor-text-subtle)]">
                          No objects match this search.
                        </p>
                      )}
                    </EditorPanel>
                    <EditorPanel title="Wall defaults" description="Applied to new walls">
                      <div className="space-y-3">
                        <FieldLabel label="Material">
                          <Select
                            value={defaultWallMaterial}
                            onChange={(event) => setDefaultWallMaterial(event.target.value as MaterialType)}
                          >
                            <option value="sandcrete">Sandcrete</option>
                            <option value="laterite">Laterite</option>
                            <option value="concrete">Concrete</option>
                            <option value="timber">Timber</option>
                          </Select>
                        </FieldLabel>
                        <FieldLabel label="Role">
                          <Select
                            value={defaultWallType}
                            onChange={(event) => setDefaultWallType(event.target.value as WallType)}
                          >
                            <option value="loadBearing">Load bearing</option>
                            <option value="partition">Partition</option>
                          </Select>
                        </FieldLabel>
                        <div className="grid grid-cols-2 gap-2">
                          <FieldLabel label="Thickness" unit="mm">
                            <Input
                              type="number"
                              value={defaultWallThickness}
                              onChange={(event) => setDefaultWallThickness(Number(event.target.value) || 0)}
                            />
                          </FieldLabel>
                          <FieldLabel label="Height" unit="mm">
                            <Input
                              type="number"
                              value={defaultWallHeight}
                              onChange={(event) => setDefaultWallHeight(Number(event.target.value) || 0)}
                            />
                          </FieldLabel>
                        </div>
                      </div>
                    </EditorPanel>
                    {validationEnabled && (
                      <ValidationPanel
                        results={validationResults}
                        hasGeometry={hasGeometry}
                        title="Feedback"
                        subtitle="Select an item to inspect and improve it."
                        onSelectElement={setSelectedElement}
                      />
                    )}
                    {validationEnabled && hasGeometry && <ComplianceScore score={complianceScore} hasGeometry={hasGeometry} />}
                  </>
                )}

                {hasGeometry && <Statistics floorPlan={floorPlan} />}
                {traceToLearnEnabled && <ComparisonPanel original={ghostFloorPlan} redesign={floorPlan} />}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* ── Bottom left · status hint ── */}
        <div className="editor-island absolute bottom-4 left-4 flex h-8 items-center rounded-full px-3.5 text-[11px] text-[var(--editor-text-subtle)]">
          <span className="capitalize text-[var(--editor-text-muted)]">{currentTool}</span>
          <span className="mx-2 text-[var(--editor-border-strong)]">·</span>
          {statusHint}
        </div>

        {/* ── Bottom right · scene health ── */}
        <div className="editor-island absolute bottom-4 right-4 flex h-8 items-center gap-3 rounded-full px-3.5 font-mono text-[10px] tabular-nums text-[var(--editor-text-subtle)]">
          {validationEnabled && (
            <>
              <span className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', errorCount ? 'bg-[var(--editor-danger)]' : 'bg-[var(--editor-border-strong)]')} />
                {errorCount} err
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn('h-1.5 w-1.5 rounded-full', warningCount ? 'bg-[var(--editor-warning)]' : 'bg-[var(--editor-border-strong)]')} />
                {warningCount} warn
              </span>
            </>
          )}
          <span>{totalElements} elem</span>
        </div>
      </div>
    </TooltipProvider>
  );
}
