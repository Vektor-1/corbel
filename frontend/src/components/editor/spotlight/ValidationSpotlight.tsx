'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type Konva from 'konva';
import type { FloorPlan, ValidationResult } from '@/types/design';
import { getElementBounds } from '@/lib/geometry/element-bounds';
import { citationForRule } from '@/lib/standards/citations';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Layers,
  X,
} from 'lucide-react';

const MASK_ID = 'corbel-spotlight-mask';
const CARD_WIDTH = 340;
const CARD_GAP = 20;

export interface ValidationSpotlightProps {
  visible: boolean;
  floorPlan: FloorPlan | null;
  stageRef: React.RefObject<Konva.Stage | null>;
  issue: ValidationResult | null;
  index: number;
  totalCount: number;
  /** True while the student is editing the reviewed element (fix-verify). */
  reviewing: boolean;
  /** True briefly after the reviewed issue resolved — drives the success flash. */
  resolved: boolean;
  /** Issues sharing the current rule+type (batching display like "1 of 3 thin walls"). */
  similarCount: number;
  similarIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onDismiss: () => void;
  onReview: (issue: ValidationResult) => void;
}

interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Resolve an element's plan-coordinate bounds to viewport screen coordinates.
 * Plan coords live in the Konva stage; the stage can be panned (draggable in
 * select mode), so the container rect + stage position must be added.
 */
function elementScreenRect(
  targetId: string,
  floorPlan: FloorPlan | null,
  stageRef: React.RefObject<Konva.Stage | null>
): ScreenRect | null {
  const bounds = getElementBounds(targetId, floorPlan);
  if (!bounds) return null;

  const stage = stageRef.current;
  if (!stage) return null;

  const container = stage.container();
  const rect = container.getBoundingClientRect();

  return {
    x: rect.left + (stage.x() ?? 0) + bounds.x,
    y: rect.top + (stage.y() ?? 0) + bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}

function issueTitle(issue: ValidationResult): string {
  switch (issue.rule) {
    case 'wall-thickness-insufficient':
      return 'Wall is too thin';
    case 'opening-host-fit':
      return 'Opening does not fit its wall';
    case 'material-unknown':
      return 'Material not mapped to standards';
    case 'span-thickness-ratio-high':
      return 'Wall span looks too long';
    case 'opening-oversized':
      return 'Opening is larger than the review threshold';
    case 'room-area-small':
      return 'Room is smaller than the recommended minimum';
    case 'check-drawing-scale':
      return 'Retrace scale may be incorrect';
    case 'complete-traced-room':
      return 'Traced walls do not close a room';
    case 'review-duplicate-wall':
      return 'Possible duplicate wall';
    default:
      return 'Element needs attention';
  }
}

function issueTargetLabel(issue: ValidationResult, floorPlan: FloorPlan | null): string {
  if (floorPlan?.walls.some((w) => w.id === issue.targetId)) return 'Wall';
  if (floorPlan?.doors.some((d) => d.id === issue.targetId)) return 'Door';
  if (floorPlan?.windows.some((w) => w.id === issue.targetId)) return 'Window';
  if (floorPlan?.rooms.some((r) => r.id === issue.targetId)) return 'Room';
  return 'Floor plan';
}

export function ValidationSpotlight({
  visible,
  floorPlan,
  stageRef,
  issue,
  index,
  totalCount,
  reviewing,
  resolved,
  similarCount,
  similarIndex,
  onNext,
  onPrev,
  onDismiss,
  onReview,
}: ValidationSpotlightProps) {
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }));

  // Force re-measure whenever the stage's position actually changes, and on
  // window resize. Previously this only listened for Konva's 'dragmove'/
  // 'dragend' events, which fire only for an actual drag gesture (space-held
  // or middle-mouse pan, per Canvas2D's `draggable={isPanning}`) -- but
  // Canvas2D's far more common pan path, two-finger trackpad/mouse-wheel
  // scroll, sets the stage's position directly via `stage.position({...})`
  // (Canvas2D.tsx's handleWheel), which never fires a drag event at all. The
  // spotlight's ring silently went stale on every scroll-pan as a result --
  // pointing at empty space once the user scrolled away, exactly the
  // "alert isn't fixed to the actual issue" gap this was meant to fix.
  // Konva nodes fire 'xChange'/'yChange' on ANY position set, drag or
  // programmatic, so listening there covers every current and future pan
  // mechanism uniformly instead of enumerating each one.
  const [measureTick, setMeasureTick] = useState(0);
  useEffect(() => {
    const stage = stageRef.current;
    const bump = () => setMeasureTick((t) => t + 1);
    const handleResize = () => {
      bump();
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    stage?.on('xChange.spotlight yChange.spotlight', bump);
    window.addEventListener('resize', handleResize);
    return () => {
      stage?.off('xChange.spotlight yChange.spotlight');
      window.removeEventListener('resize', handleResize);
    };
  }, [stageRef, visible]);

  const bounds = useMemo(
    // measureTick is otherwise unused here but is exactly what the xChange/
    // yChange/resize listeners above bump -- without it in the dependency
    // list this memo never recomputed on pan or resize regardless of which
    // event triggered the re-render, since none of its other inputs
    // (issue/floorPlan/the stable stageRef object) change from panning.
    () => (issue ? elementScreenRect(issue.targetId, floorPlan, stageRef) : null),
    [issue, floorPlan, stageRef, measureTick]
  );

  const hasBounds = bounds !== null;
  const safeBounds: ScreenRect = hasBounds
    ? bounds!
    : {
        x: viewport.width / 2 - 40,
        y: viewport.height / 2 - 40,
        width: 80,
        height: 80,
      };

  // Position the card next to the spotlight, falling back: right → left → below.
  const cardPos = useMemo(() => {
    const gap = CARD_GAP;
    const pad = 16;
    const right = safeBounds.x + safeBounds.width + gap;
    if (right + CARD_WIDTH <= viewport.width - pad) {
      return { left: right, top: Math.max(pad, Math.min(safeBounds.y, viewport.height - 340 - pad)) };
    }
    const left = safeBounds.x - CARD_WIDTH - gap;
    if (left >= pad) {
      return { left, top: Math.max(pad, Math.min(safeBounds.y, viewport.height - 340 - pad)) };
    }
    return {
      left: Math.max(pad, Math.min(safeBounds.x + safeBounds.width / 2 - CARD_WIDTH / 2, viewport.width - CARD_WIDTH - pad)),
      top: Math.min(safeBounds.y + safeBounds.height + gap, viewport.height - 340 - pad),
    };
  }, [safeBounds, viewport]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || !issue) return;
      if (e.key === 'Escape') onDismiss();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
      // Enter reviews (fix-verify) when the card is not already resolving.
      if (e.key === 'Enter' && !reviewing && !resolved) onReview(issue);
    },
    [visible, issue, reviewing, resolved, onDismiss, onNext, onPrev, onReview]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Focus the card on the rising edge only (spotlight session just opened),
  // not on every subsequent issue -- Next/Prev/auto-advance-through-similar
  // navigation happens while the user is already mid-flow (often mid-edit in
  // "reviewing", where a property input elsewhere may be focused), and
  // yanking focus back to the card on each of those would fight the fix step
  // this dialog exists to support. A first appearance, by contrast, is a
  // genuinely new thing landing on screen that a keyboard/screen-reader user
  // has had no chance yet to notice.
  const wasVisible = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (visible && issue && !wasVisible.current) cardRef.current?.focus();
    wasVisible.current = visible && issue !== null;
  }, [visible, issue]);

  if (!visible || !issue) return null;

  const severityColor =
    issue.type === 'error'
      ? { text: 'var(--editor-danger)', soft: 'var(--editor-danger-soft)' }
      : issue.type === 'warning'
        ? { text: 'var(--editor-warning)', soft: 'var(--editor-warning-soft)' }
        : { text: 'var(--editor-info)', soft: 'var(--editor-info-soft)' };

  const SeverityIcon =
    issue.type === 'error' ? AlertCircle : issue.type === 'warning' ? AlertTriangle : CheckCircle2;

  const targetLabel = issueTargetLabel(issue, floorPlan);
  const citation = citationForRule(issue.rule);

  return (
    <div className="pointer-events-none fixed inset-0 z-[90]">
      {/* SVG mask definition (userSpaceOnUse so pixel coords match the viewport). */}
      <svg width="0" height="0" className="absolute">
        <defs>
          <mask id={MASK_ID} maskUnits="userSpaceOnUse">
            <rect x={0} y={0} width={viewport.width} height={viewport.height} fill="white" />
            {hasBounds && (
              <rect
                x={safeBounds.x}
                y={safeBounds.y}
                width={safeBounds.width}
                height={safeBounds.height}
                rx={12}
                fill="black"
                style={{
                  // SVG2 geometry properties animate via CSS transitions, so the
                  // spotlight hole glides between elements instead of jumping.
                  transition: 'x 220ms cubic-bezier(0.4, 0, 0.2, 1), y 220ms cubic-bezier(0.4, 0, 0.2, 1), width 220ms cubic-bezier(0.4, 0, 0.2, 1), height 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              />
            )}
          </mask>
        </defs>
      </svg>

      {/* Dimmed backdrop with cutout; masked-out area passes clicks through. */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        style={{
          background: 'rgba(12, 10, 7, 0.55)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          mask: `url(#${MASK_ID})`,
          WebkitMask: `url(#${MASK_ID})`,
        }}
        onClick={onDismiss}
      />

      {/* Spotlit element ring: pulsing glow that tracks the element. */}
      {hasBounds && (
        <motion.div
          className="pointer-events-none absolute rounded-xl border-2"
          animate={{
            left: safeBounds.x - 3,
            top: safeBounds.y - 3,
            width: safeBounds.width + 6,
            height: safeBounds.height + 6,
            boxShadow: [
              `0 0 0 3px var(--editor-surface), 0 0 12px ${severityColor.text}44`,
              `0 0 0 3px var(--editor-surface), 0 0 32px ${severityColor.text}99`,
              `0 0 0 3px var(--editor-surface), 0 0 12px ${severityColor.text}44`,
            ],
          }}
          transition={{
            left: { type: 'spring', stiffness: 320, damping: 32 },
            top: { type: 'spring', stiffness: 320, damping: 32 },
            width: { type: 'spring', stiffness: 320, damping: 32 },
            height: { type: 'spring', stiffness: 320, damping: 32 },
            boxShadow: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' },
          }}
          style={{ borderColor: severityColor.text }}
        />
      )}

      {/* Tooltip card — keyed by issue so AnimatePresence can slide between issues.
          Deliberately non-modal: unlike PortraitLockOverlay, this coachmark is
          meant to stay open WHILE the user edits the spotlit element via the
          canvas or a property panel elsewhere (the "reviewing" / fix-verify
          flow below), so there is no aria-modal and no focus trap here -- either
          would block the very interaction this dialog exists to support. Its
          Escape/Arrow/Enter handling is intentionally a window-level listener
          rather than dialog-scoped, for the same reason: it must keep working
          no matter where focus currently is. tabIndex={-1} + the focus effect
          above make the card itself a programmatic focus target on first
          appearance without adding it to the normal Tab order. aria-live
          announces it (and any later content change within the same card) to
          screen readers that would otherwise never discover it. */}
      <motion.div
        key={issue.id}
        ref={cardRef}
        tabIndex={-1}
        className="pointer-events-auto absolute rounded-2xl border p-4 shadow-2xl"
        initial={{ opacity: 0, y: 10, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        style={{
          left: cardPos.left,
          top: cardPos.top,
          width: CARD_WIDTH,
          background: 'var(--editor-menu-surface)',
          borderColor: resolved ? 'var(--editor-success)' : 'var(--editor-border)',
          color: 'var(--editor-text)',
          boxShadow: resolved ? '0 0 0 1px var(--editor-success), var(--editor-glass-shadow)' : 'var(--editor-glass-shadow)',
        }}
        role="dialog"
        aria-label={resolved ? 'Issue resolved' : 'Design issue'}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: resolved ? 'var(--editor-success-soft)' : severityColor.soft,
              color: resolved ? 'var(--editor-success)' : severityColor.text,
            }}
          >
            {resolved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <SeverityIcon className="h-3.5 w-3.5" />}
            {resolved ? 'Resolved' : `${targetLabel} · ${issue.type}`}
          </div>
          <button
            onClick={onDismiss}
            aria-label="Dismiss spotlight"
            className="rounded-md p-1 transition-colors hover:bg-[var(--editor-surface-muted)]"
          >
            <X className="h-4 w-4" style={{ color: 'var(--editor-text-muted)' }} />
          </button>
        </div>

        <h3 className="mt-3 text-sm font-semibold leading-snug">
          {resolved ? 'Looking good — that issue is fixed.' : issueTitle(issue)}
        </h3>

        {resolved ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-1.5 text-xs leading-relaxed"
            style={{ color: 'var(--editor-text-muted)' }}
          >
            The {targetLabel.toLowerCase()} now passes this check. Moving on…
          </motion.p>
        ) : (
          <>
            <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--editor-text-muted)' }}>
              {issue.message}
            </p>
            {issue.remediation && (
              <div
                className="mt-3 rounded-lg p-2.5 text-xs leading-relaxed"
                style={{ background: 'var(--editor-surface-muted)' }}
              >
                <span className="font-semibold">Suggestion: </span>
                <span style={{ color: 'var(--editor-text-muted)' }}>{issue.remediation}</span>
              </div>
            )}
            {issue.evidence && (
              <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed" style={{ background: 'var(--editor-surface-muted)', color: 'var(--editor-text-subtle)' }}>
                {issue.evidence}
              </div>
            )}
            {(citation || similarCount > 1) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {citation && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: 'var(--editor-surface-muted)', color: 'var(--editor-text-muted)' }}
                    title="Ghana building code reference used by this rule"
                  >
                    <BookOpen className="h-3 w-3" />
                    {citation}
                  </span>
                )}
                {similarCount > 1 && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: 'var(--editor-surface-muted)', color: 'var(--editor-text-muted)' }}
                  >
                    <Layers className="h-3 w-3" />
                    {similarIndex} of {similarCount} {targetLabel.toLowerCase()}s with this issue
                  </span>
                )}
              </div>
            )}
          </>
        )}

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={totalCount <= 1}
              aria-label="Previous issue"
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--editor-surface-muted)] disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] tabular-nums" style={{ color: 'var(--editor-text-subtle)' }}>
              {index + 1} / {totalCount}
            </span>
            <button
              onClick={onNext}
              disabled={totalCount <= 1}
              aria-label="Next issue"
              className="rounded-md p-1.5 transition-colors hover:bg-[var(--editor-surface-muted)] disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {resolved ? (
            <button
              onClick={onDismiss}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: 'var(--editor-success-soft)', color: 'var(--editor-success)' }}
            >
              Dismiss
            </button>
          ) : reviewing ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
              style={{ background: 'var(--editor-surface-muted)', color: 'var(--editor-text-muted)' }}
            >
              <span
                className="inline-block h-2 w-2 animate-pulse rounded-full"
                style={{ background: severityColor.text }}
              />
              Editing… auto-rechecks
            </span>
          ) : (
            <button
              onClick={() => onReview(issue)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors"
              style={{ background: 'var(--editor-accent)' }}
            >
              Fix it
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
