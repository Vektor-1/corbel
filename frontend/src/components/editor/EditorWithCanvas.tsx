'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  BoxSelect,
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
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Undo2,
  Grid3X3,
  Ruler,
  Tag,
  Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { useAdaptiveLearning } from '@/hooks/useAdaptiveLearning';
import { useStudyCondition } from '@/lib/study/condition';
import { learningCsv } from '@/lib/learning/adaptiveTutor';
import { useValidationSpotlight } from '@/hooks/useValidationSpotlight';
import { ValidationSpotlight } from './spotlight/ValidationSpotlight';
import { Canvas2D } from './Canvas2D';
import { AdaptiveLearningPanel } from './AdaptiveLearningPanel';
import { ComparisonPanel } from './ComparisonPanel';
import { EditorReviewBadge } from './EditorReviewBadge';
import { SubmitCorrectionPanel } from './SubmitCorrectionPanel';
import { TraceReferenceControls } from './TraceReferenceControls';
import { DraftingSequencePanel } from './DraftingSequencePanel';
import { PortraitLockOverlay } from './PortraitLockOverlay';
import { AccessibleDraftingPanel } from './AccessibleDraftingPanel';
import { Canvas3DContainer } from '../viewer/Canvas3D';
import {
  ComplianceScore,
  MultiSelectInspector,
  SelectedDoorInspector,
  SelectedObjectInspector,
  SelectedRoomInspector,
  SelectedWallInspector,
  SelectedWindowInspector,
  Statistics,
  ValidationPanel,
} from './EditorPanels';
import type { MaterialType, ObjectAssetId, ObjectCategory, Room, WallType } from '@/types/design';
import { formatArea, type AreaUnit, type LengthUnit } from '@/lib/units/measurements';
import { pixelsPerMeter } from '@/lib/geometry/scale';
import { getCombinedBounds } from '@/lib/geometry/element-bounds';

const viewOptions = [
  { value: '2d', label: 'Plan' },
  { value: '3d', label: 'Spatial' },
  { value: 'split', label: 'Split' },
] as const;

const toolShortcuts: Record<string, string> = {
  select: 'S', wall: 'W', door: 'D', window: 'N', object: 'O', scale: 'R', delete: 'X',
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
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [diffMode, setDiffMode] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showRoomLabels, setShowRoomLabels] = useState(true);
  const [showWallDimensions, setShowWallDimensions] = useState(true);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [interventionStatus, setInterventionStatus] = useState<'active' | 'task-complete' | 'retry-ready' | 'verified'>('active');
  const [lengthUnit, setLengthUnit] = useState<LengthUnit>('mm');
  const areaUnit: AreaUnit = lengthUnit === 'ft' || lengthUnit === 'in' || lengthUnit === 'ft-in' ? 'ft²' : 'm²';
  const validationEnabled = useFeatureFlag('validation');
  const undoRedoEnabled = useFeatureFlag('undoRedo');
  const traceToLearnEnabled = useFeatureFlag('traceToLearn');
  const adaptiveLearningEnabled = useFeatureFlag('adaptiveLearning');
  const threeDPreviewEnabled = useFeatureFlag('threeDPreview');
  const studyCondition = useStudyCondition();

  const {
    floorPlan,
    currentTool,
    selectedElementId,
    selectedElementIds,
    viewMode,
    ghostFloorPlan,
    ghostOpacity,
    setCurrentTool,
    setViewMode,
    setSelectedElement,
    setSelection,
    selectAll,
    groupElements,
    ungroupElements,
    deleteSelection,
    scaleElements,
    addWall,
    addDoor,
    addWindow,
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
    { id: 'scale', label: 'Scale', icon: Maximize2 },
    { id: 'delete', label: 'Delete', icon: Trash2 },
  ] as const;

  useEffect(() => {
    if (!['select', 'wall', 'door', 'window', 'object', 'scale', 'delete'].includes(currentTool)) setCurrentTool('select');
  }, [currentTool, setCurrentTool]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('corbel-editor-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

    const savedUnit = window.localStorage.getItem('corbel-measurement-unit');
    if (savedUnit === 'mm' || savedUnit === 'cm' || savedUnit === 'm' || savedUnit === 'in' || savedUnit === 'ft' || savedUnit === 'ft-in') {
      setLengthUnit(savedUnit);
    }
    if (!window.matchMedia('(max-width: 767px)').matches) setInspectorOpen(true);
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
  const isMultiSelect = selectedElementIds.length >= 2;
  // The Scale tool surfaces the selection panel (scale % + delete) for a single
  // element too, since resizing one thing at a time is its main use.
  const showSelectionPanel = isMultiSelect || (currentTool === 'scale' && selectedElementIds.length === 1);
  const isSelectionGrouped = isMultiSelect && (floorPlan?.groups ?? []).some(
    (group) => group.memberIds.length === selectedElementIds.length && group.memberIds.every((id) => selectedElementIds.includes(id))
  );
  // Drives the new left-side "selection config" panel: it only exists once
  // something is actually selected, mirroring "adding/selecting an object
  // surfaces its config" rather than always being present.
  const hasSelection = showSelectionPanel || !!selectedWall || !!selectedDoor || !!selectedWindow || !!selectedRoom || !!(selectedObject && selectedObjectAsset);
  const handleScaleSelection = (percent: number) => {
    if (!floorPlan || selectedElementIds.length === 0) return;
    const bounds = getCombinedBounds(selectedElementIds, floorPlan);
    if (!bounds) return;
    const factor = Math.max(0.1, percent / 100);
    scaleElements(selectedElementIds, factor, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  };
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
  const traceScaleIssue = validationResults.find((result) => result.rule === 'check-drawing-scale');

  const addWallFromCoordinates = ({ startX, startY, endX, endY }: { startX: number; startY: number; endX: number; endY: number }) => {
    if (!floorPlan) return 'Start a new plan before adding geometry.';
    if ([startX, startY, endX, endY].some((value) => !Number.isFinite(value))) return 'Coordinates must be valid numbers.';
    if ([startX, endX].some((value) => Math.abs(value) > floorPlan.width / 2) || [startY, endY].some((value) => Math.abs(value) > floorPlan.height / 2)) return `Keep coordinates within ${floorPlan.width} × ${floorPlan.height} mm drawing area centered on the sheet.`;
    if (Math.hypot(endX - startX, endY - startY) < 100) return 'A wall must be at least 100 mm long.';

    const millimetresToPixels = pixelsPerMeter(floorPlan.scale) / 1_000;
    const wall = {
      id: `wall-${crypto.randomUUID()}`,
      startPoint: { x: startX * millimetresToPixels, y: startY * millimetresToPixels },
      endPoint: { x: endX * millimetresToPixels, y: endY * millimetresToPixels },
      thickness: defaultWallThickness,
      material: defaultWallMaterial,
      type: defaultWallType,
      height: defaultWallHeight,
      source: 'user' as const,
    };
    addWall(wall);
    setSelectedElement(wall.id);
    return null;
  };

  const addOpeningFromCoordinates = (kind: 'door' | 'window', width: number, offset: number) => {
    if (!selectedWall || !floorPlan) return 'Select a host wall before adding an opening.';
    const minimum = kind === 'door' ? 600 : 400;
    if (!Number.isFinite(width) || width < minimum) return `${kind === 'door' ? 'Door' : 'Window'} width must be at least ${minimum} mm.`;
    if (!Number.isFinite(offset) || offset < 0) return 'Centre offset must be zero or greater.';

    const millimetresToPixels = pixelsPerMeter(floorPlan.scale) / 1_000;
    const hostLength = Math.hypot(selectedWall.endPoint.x - selectedWall.startPoint.x, selectedWall.endPoint.y - selectedWall.startPoint.y);
    const halfWidth = width * millimetresToPixels / 2;
    if (hostLength < halfWidth * 2) return 'The selected wall is too short for that opening width.';

    const requestedOffset = offset * millimetresToPixels;
    const position = Math.max(halfWidth, Math.min(hostLength - halfWidth, requestedOffset));
    const id = `${kind}-${crypto.randomUUID()}`;
    if (kind === 'door') {
      addDoor({ id, wallId: selectedWall.id, position: { x: position, y: 0 }, width, type: 'internal', swing: 'left', source: 'user' });
    } else {
      addWindow({ id, wallId: selectedWall.id, position: { x: position, y: 0 }, width, height: 1200, sillHeight: 900, source: 'user' });
    }
    setSelectedElement(id);
    return position === requestedOffset ? null : 'Opening was kept inside its host wall and added.';
  };
  // A comparison session still records generic diagnosis/resolution outcomes.
  // This keeps the historic feature-off comparison link analyzable without
  // accidentally re-enabling its adaptive panel.
  const adaptiveTelemetryEnabled = adaptiveLearningEnabled || studyCondition === 'comparison';
  const adaptiveLearning = useAdaptiveLearning(floorPlan?.id, validationResults, adaptiveTelemetryEnabled, studyCondition);

  const complianceScore = useMemo(
    () => (hasGeometry ? Math.max(28, 100 - errorCount * 18 - warningCount * 8) : null),
    [errorCount, hasGeometry, warningCount]
  );

  // Selects an element and, if the only visible view has no 2D stage to
  // anchor a visual highlight to, switches to split view so the flagged
  // element is actually visible somewhere -- in 3D-only mode there was
  // previously no way to see what a validation issue or "review" action was
  // pointing at (ValidationSpotlight's ring is computed from the Konva
  // stage; 3D's own native selection highlight only shows if a 3D pane is
  // mounted, which split view guarantees alongside the 2D spotlight).
  // Never auto-switches back to 3D -- that would be surprising mid-review.
  const focusIssueTarget = (targetId: string | null) => {
    setSelectedElement(targetId);
    if (targetId && viewMode === '3d') setViewMode('split');
  };

  // Spotlight tour for new validation issues (errors + warnings) — replaces
  // transient sonner toasts for validation and retrace-scale feedback.
  const spotlight = useValidationSpotlight(floorPlan, validationResults, {
    onReview: (issue) => focusIssueTarget(issue.targetId),
  });

  useEffect(() => {
    setInterventionStatus('active');
  }, [adaptiveLearning.active?.definition.id, adaptiveLearning.active?.targetId]);

  const adaptiveIntervention = adaptiveLearning.active ? {
    misconceptionId: adaptiveLearning.active.definition.id,
    misconceptionLabel: adaptiveLearning.active.definition.title,
    evidence: adaptiveLearning.active.evidence,
    explanation: adaptiveLearning.active.definition.explanation,
    task: {
      prompt: adaptiveLearning.active.definition.microtask.prompt,
      options: adaptiveLearning.active.definition.microtask.choices,
      correctOptionId: adaptiveLearning.active.definition.microtask.correctChoiceId,
    },
    confidence: adaptiveLearning.active.mode === 'repeat-pattern' ? 'high' as const : 'moderate' as const,
    status: interventionStatus,
    retryLabel: 'Focus the affected element',
  } : null;

  const exportLearningRecord = () => {
    const rows = adaptiveLearning.exportEvents();
    const blob = new Blob([learningCsv(rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${floorPlan?.name ?? 'corbel-plan'}-learning-record.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
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
      : 'Click or drag to select · Shift-click to add · Scroll, middle-drag, or hold Space to pan';

  return (
    <TooltipProvider delay={300}>
      {/* A main landmark and a real (visually-hidden) h1 heading -- the editor
          previously had neither, so a screen-reader user landing on this
          route via the skip link (see app/layout.tsx) got no page landmark
          and no orientation. Changing the root element's tag from `div` to
          `main` changes nothing about layout: same classes, same positioning
          context for every absolutely-positioned island inside it. */}
      <main
        id="main-content"
        className="corbel-editor relative h-screen w-screen overflow-hidden bg-[var(--editor-canvas)] text-[var(--editor-text)]"
        data-theme={theme}
      >
        <h1 className="sr-only">Corbel floor plan editor</h1>
        <PortraitLockOverlay />

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
                onPlacementViolation={(violation) =>
                  spotlight.pushTransient({
                    id: `placement-${Date.now()}`,
                    type: 'error',
                    message: violation.message,
                    remediation: 'Move the opening further from the wall corner or from another opening.',
                    targetId: violation.targetId,
                    rule: `placement-${violation.rule.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                  })
                }
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
        <div className="editor-identity-island editor-island absolute left-4 top-4 flex h-11 items-center gap-3 rounded-xl pl-4 pr-3">
          <span className="font-display text-[17px] leading-none tracking-tight text-[var(--editor-text)]">
            Corbel
          </span>
          <Separator orientation="vertical" className="!h-4 bg-[var(--editor-border)]" />
          <span className="editor-desktop-meta max-w-44 truncate text-xs text-[var(--editor-text-muted)]">
            {floorPlan?.name || 'Untitled study'}
          </span>
          <span className="editor-desktop-meta rounded-full border border-[var(--editor-accent)]/30 bg-[var(--editor-accent-soft)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--editor-accent-text)]">
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
        <div className="editor-view-island editor-island absolute left-1/2 top-4 flex h-11 -translate-x-1/2 items-center rounded-xl px-1.5">
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
        <div className="editor-actions absolute right-4 top-4 z-20" aria-label="Editor actions">
          <div className="editor-island flex h-11 items-center gap-1 rounded-xl px-1.5">
            {undoRedoEnabled && (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="ghost" size="icon-sm" className="editor-mobile-secondary" onClick={() => (useDesignStore as any).temporal.getState().undo()}><Undo2 /></Button>}
                  />
                  <TooltipContent>Undo ⌘Z</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={<Button variant="ghost" size="icon-sm" className="editor-mobile-secondary" onClick={() => (useDesignStore as any).temporal.getState().redo()}><Redo2 /></Button>}
                  />
                  <TooltipContent>Redo ⇧⌘Z</TooltipContent>
                </Tooltip>
                <Separator orientation="vertical" className="editor-mobile-secondary mx-1 !h-4 bg-[var(--editor-border)]" />
              </>
            )}
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="ghost" size="icon-sm" onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? <PanelRightClose /> : <PanelRightOpen />}</Button>}
              />
              <TooltipContent>{inspectorOpen ? 'Hide inspector' : 'Show inspector'}</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="mx-1 !h-4 bg-[var(--editor-border)]" />
            <Button
              variant={displayOpen ? 'secondary' : 'ghost'}
              size="sm"
              aria-expanded={displayOpen}
              aria-controls="editor-display-menu"
              onClick={() => {
                setActionsOpen(false);
                setDisplayOpen((open) => !open);
              }}
            >
              <SlidersHorizontal />
              Display
            </Button>
            <Button
              variant={actionsOpen ? 'secondary' : 'ghost'}
              size="sm"
              aria-expanded={actionsOpen}
              aria-controls="editor-actions-menu"
              onClick={() => {
                setDisplayOpen(false);
                setActionsOpen((open) => !open);
              }}
            >
              <MoreHorizontal />
              Actions
            </Button>
          </div>

          {displayOpen && (
            <div id="editor-display-menu" className="editor-action-menu editor-island absolute right-0 top-14 w-64 rounded-xl p-2.5" role="group" aria-label="Display settings">
              <div className="flex items-baseline justify-between px-1.5 pb-2">
                <p className="text-[12px] font-semibold text-[var(--editor-text)]">Display</p>
                <p className="text-[10px] text-[var(--editor-text-subtle)]">How the plan looks</p>
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface-muted)]">
                <div className="grid grid-cols-3 divide-x divide-[var(--editor-border)]">
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showGrid ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowGrid((v) => !v)} aria-pressed={showGrid}><Grid3X3 />Grid</Button>
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showRoomLabels ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowRoomLabels((v) => !v)} aria-pressed={showRoomLabels}><Tag />Labels</Button>
                  <Button variant="ghost" size="sm" className={cn('h-14 flex-col gap-1.5 rounded-none py-2.5 text-[10px] transition-colors [&_svg]:size-4', showWallDimensions ? 'bg-[var(--editor-accent-soft)] text-[var(--editor-accent-text)] hover:bg-[var(--editor-accent-soft)]' : 'text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface)]')} onClick={() => setShowWallDimensions((v) => !v)} aria-pressed={showWallDimensions}><Ruler />Dimensions</Button>
                </div>
              </div>
            </div>
          )}

          {actionsOpen && (
            <div id="editor-actions-menu" className="editor-action-menu editor-island absolute right-0 top-14 w-72 rounded-xl p-2.5" role="group" aria-label="Editor workspace actions">
              <div className="flex items-baseline justify-between px-1.5 pb-2">
                <p className="text-[12px] font-semibold text-[var(--editor-text)]">Workspace</p>
                <p className="text-[10px] text-[var(--editor-text-subtle)]">File and session tools</p>
              </div>
              <Button variant="ghost" size="sm" className="w-full justify-start text-[var(--editor-text-muted)]" onClick={exportLearningRecord}><Download />Export study record</Button>
              {traceToLearnEnabled && (
                <>
                  <Separator className="my-2 bg-[var(--editor-border)]" />
                  <p className="px-1.5 pb-1 text-[11px] font-medium text-[var(--editor-text-muted)]">Learning</p>
                  <Button variant="secondary" size="sm" className="w-full justify-start" onClick={() => window.location.assign('/upload')}><ScanLine />Start image retrace</Button>
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
              <SubmitCorrectionPanel />
              <Button variant="ghost" size="sm" className="mt-1.5 w-full justify-start text-[var(--editor-danger)]" onClick={handleClearDesign}><Trash2 />Clear all design content</Button>
            </div>
          )}
        </div>

        {/* ── Bottom center · floating tool dock ── */}
        <div className="editor-tool-dock editor-island absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-row items-center gap-1 rounded-xl p-1.5">
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
              <TooltipContent side="top">
                {label}
                <span className="ml-2 font-mono text-[10px] opacity-60">{toolShortcuts[id]}</span>
              </TooltipContent>
            </Tooltip>
          ))}
          <Separator orientation="vertical" className="mx-0.5 !h-6 bg-[var(--editor-border)]" />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setCurrentTool('select');
                    selectAll();
                  }}
                  className="text-[var(--editor-text-subtle)] hover:text-[var(--editor-text)]"
                >
                  <BoxSelect />
                </Button>
              }
            />
            <TooltipContent side="top">
              Select all
              <span className="ml-2 font-mono text-[10px] opacity-60">⌘A</span>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* ── Side panels: left = selection config (contextual), right = Outline/Library/Feedback islands ── */}
        <div className="editor-panels-group">
          {/* ── Left · selection config panel (appears once something is selected) ── */}
          {inspectorOpen && hasSelection && (
            <div className="editor-side-panel editor-left-panel editor-island absolute bottom-14 left-4 top-[4.75rem] flex w-72 flex-col overflow-hidden rounded-xl">
              <ScrollArea className="min-h-0 flex-1">
                <div className="divide-y divide-[var(--editor-border)]">
                  {showSelectionPanel ? (
                    <MultiSelectInspector
                      count={selectedElementIds.length}
                      isGroup={isSelectionGrouped}
                      canGroup={isMultiSelect}
                      onGroup={() => groupElements(selectedElementIds)}
                      onUngroup={() => ungroupElements(selectedElementIds)}
                      onDelete={deleteSelection}
                      onScale={handleScaleSelection}
                    />
                  ) : selectedWall ? (
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
                        onSelectElement={focusIssueTarget}
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
                        onSelectElement={focusIssueTarget}
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
                        onSelectElement={focusIssueTarget}
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
                        onSelectElement={focusIssueTarget}
                      />
                    </>
                  ) : selectedObject && selectedObjectAsset ? (
                    <SelectedObjectInspector
                      object={selectedObject}
                      asset={selectedObjectAsset}
                      onUpdate={(updates) => updateObject(selectedObject.id, updates)}
                    />
                  ) : null}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ── Right · Trace controls / Outline / Library / Feedback islands ── */}
          <div className="editor-right-panels absolute bottom-14 right-4 top-[4.75rem] flex w-72 flex-col gap-3">
            {inspectorOpen && traceImage && (
              <div className="editor-side-panel editor-trace-controls-panel editor-island flex max-h-72 flex-none flex-col overflow-hidden rounded-xl">
                <ScrollArea className="min-h-0 flex-1">
                  <TraceReferenceControls
                    reference={traceImage}
                    selectedWall={selectedWall}
                    scaleIssue={traceScaleIssue}
                    onUpdate={updateTraceImage}
                    onRemove={() => setTraceImage(null)}
                    onCalibrate={(knownLengthMm) => calibrateTraceFromWall(selectedWall?.id ?? '', knownLengthMm)}
                    onReviewScaleIssue={() => focusIssueTarget(traceScaleIssue?.targetId ?? null)}
                    onUpdateWallThickness={(thickness) => selectedWall && updateWall(selectedWall.id, { thickness })}
                  />
                </ScrollArea>
              </div>
            )}

            {inspectorOpen && (
              <div className="editor-side-panel editor-outline-panel editor-island flex max-h-56 flex-none flex-col overflow-hidden rounded-xl">
                <ScrollArea className="min-h-0 flex-1">
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
                              selectedElementIds.includes(wall.id)
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
                                selectedElementIds.includes(room.id)
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
                                selectedElementIds.includes(door.id)
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
                                selectedElementIds.includes(window.id)
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
                                selectedElementIds.includes(object.id)
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
                </ScrollArea>
              </div>
            )}

            {inspectorOpen && !hasSelection && (
              <div className="editor-side-panel editor-library-panel editor-island flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="divide-y divide-[var(--editor-border)]">
                    <DraftingSequencePanel
                      walls={floorPlan?.walls.length ?? 0}
                      rooms={floorPlan?.rooms.length ?? 0}
                      openings={(floorPlan?.doors.length ?? 0) + (floorPlan?.windows.length ?? 0)}
                      showGrid={showGrid}
                      showDimensions={showWallDimensions}
                      validationResults={validationResults}
                      onChooseTool={setCurrentTool}
                      onSetGrid={setShowGrid}
                      onSetDimensions={setShowWallDimensions}
                      onReviewFeedback={() => {
                        const first = validationResults[0];
                        if (first) focusIssueTarget(first.targetId);
                      }}
                    />
                    <AccessibleDraftingPanel
                      walls={floorPlan?.walls ?? []}
                      selectedWall={selectedWall}
                      onAddWall={addWallFromCoordinates}
                      onAddOpening={addOpeningFromCoordinates}
                    />
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
                  </div>
                </ScrollArea>
              </div>
            )}

            {inspectorOpen && (
              <div className="editor-side-panel editor-feedback-panel editor-island flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl">
                <ScrollArea className="min-h-0 flex-1">
                  <div className="divide-y divide-[var(--editor-border)]">
                    {!hasSelection && validationEnabled && (
                      <ValidationPanel
                        results={validationResults}
                        hasGeometry={hasGeometry}
                        title="Feedback"
                        subtitle="Select an item to inspect and improve it."
                        onSelectElement={focusIssueTarget}
                      />
                    )}
                    {!hasSelection && validationEnabled && hasGeometry && (
                      <ComplianceScore score={complianceScore} hasGeometry={hasGeometry} />
                    )}
                    {adaptiveLearningEnabled && studyCondition === 'adaptive' && <AdaptiveLearningPanel
                      intervention={adaptiveIntervention}
                      onAnswer={(optionId, correct) => {
                        adaptiveLearning.answer(optionId);
                        if (correct) setInterventionStatus('task-complete');
                      }}
                      onRetry={() => {
                        adaptiveLearning.start();
                        focusIssueTarget(adaptiveLearning.active?.targetId ?? null);
                        setInterventionStatus('retry-ready');
                      }}
                      onCheckPlan={() => {
                        const corrected = adaptiveLearning.verifyRetry();
                        if (corrected) {
                          setInterventionStatus('verified');
                          toast.success('Correction verified. Corbel recorded the improvement for this learning task.');
                        } else {
                          toast.message('The same pattern is still present. Revisit the highlighted element and try again.');
                        }
                      }}
                      onExportRecord={exportLearningRecord}
                    />}
                    {hasGeometry && <Statistics floorPlan={floorPlan} />}
                    {traceToLearnEnabled && <ComparisonPanel original={ghostFloorPlan} redesign={floorPlan} />}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom left · status hint ── */}
        <div className="editor-status-hint editor-island absolute bottom-4 left-4 flex h-8 max-w-[min(32rem,calc(50vw-11rem))] items-center rounded-full px-3.5 text-[11px] text-[var(--editor-text-subtle)]">
          <span className="shrink-0 capitalize text-[var(--editor-text-muted)]">{currentTool}</span>
          <span className="mx-2 shrink-0 text-[var(--editor-border-strong)]">·</span>
          <span className="truncate">{statusHint}</span>
        </div>

        {/* ── Bottom right · scene health ── */}
        <div className="editor-health editor-island absolute bottom-4 right-4 flex h-8 items-center gap-3 rounded-full px-3.5 font-mono text-[10px] tabular-nums text-[var(--editor-text-subtle)]">
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

        {/* ── Validation spotlight (coach-mark overlay) ── */}
        <ValidationSpotlight
          visible={spotlight.visible}
          floorPlan={spotlight.floorPlan}
          stageRef={canvasStageRef}
          issue={spotlight.activeIssue}
          index={spotlight.index}
          totalCount={spotlight.totalCount}
          reviewing={spotlight.reviewing}
          resolved={spotlight.resolved}
          similarCount={spotlight.similarCount}
          similarIndex={spotlight.similarIndex}
          onNext={spotlight.next}
          onPrev={spotlight.prev}
          onDismiss={spotlight.dismiss}
          onReview={spotlight.review}
        />
      </main>
    </TooltipProvider>
  );
}
