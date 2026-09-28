'use client';

import { BrickWall, DoorOpen, Hammer, Sparkles, SquareDashed } from 'lucide-react';
import { EditorPanel } from '@/components/ui/editor-panel';
import type { FloorPlan, ValidationResult } from '@/types/design';

export function ConstructionAwarePanel({ floorPlan, results, onFocus }: { floorPlan: FloorPlan | null; results: ValidationResult[]; onFocus: (id: string) => void }) {
  if (!floorPlan) return null;
  const loadBearing = floorPlan.walls.filter((wall) => wall.type === 'loadBearing');
  const partitions = floorPlan.walls.length - loadBearing.length;
  const structuralFindings = results.filter((result) => ['wall-thickness-insufficient', 'span-thickness-ratio-high', 'opening-oversized', 'opening-host-fit'].includes(result.rule));
  const materials = [...new Set(loadBearing.map((wall) => wall.material))];
  return (
    <EditorPanel title="Construction layer" description="Educational geometry review" action={<span className="rounded bg-[var(--editor-warning-soft)] px-1.5 py-0.5 text-[10px] text-[var(--editor-warning)]">Review</span>}>
      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-[var(--editor-text-muted)]">
        <div className="rounded-md bg-[var(--editor-surface-muted)] p-2"><BrickWall className="mb-1 size-3.5 text-[var(--editor-accent-text)]" />{loadBearing.length} load-bearing walls</div>
        <div className="rounded-md bg-[var(--editor-surface-muted)] p-2"><SquareDashed className="mb-1 size-3.5 text-[var(--editor-text-subtle)]" />{partitions} partitions</div>
        <div className="rounded-md bg-[var(--editor-surface-muted)] p-2"><DoorOpen className="mb-1 size-3.5 text-[var(--editor-accent-text)]" />{floorPlan.doors.length + floorPlan.windows.length} openings</div>
        <div className="rounded-md bg-[var(--editor-surface-muted)] p-2"><Hammer className="mb-1 size-3.5 text-[var(--editor-accent-text)]" />{materials.length ? materials.join(', ') : 'No wall material'}</div>
      </div>
      <p className="mt-3 text-[10px] leading-4 text-[var(--editor-text-subtle)]">Checks use the configured Ghana guidance and geometry heuristics. They identify items to verify; they are not structural approval.</p>
      {structuralFindings.length > 0 ? <div className="mt-2 space-y-1">{structuralFindings.slice(0, 3).map((item) => <button key={item.id} type="button" onClick={() => onFocus(item.targetId)} className="w-full rounded-md bg-[var(--editor-warning-soft)] px-2 py-1.5 text-left text-[10px] text-[var(--editor-warning)] hover:opacity-80">{item.message}</button>)}</div> : <p className="mt-2 text-[10px] text-[var(--editor-success)]">No current structural-geometry findings.</p>}
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('corbel:chat-intent', { detail: 'Review this plan for educational construction considerations: wall roles, wall thickness, unsupported spans, opening placement, and material assumptions. Explain findings and do not apply changes.' }))} className="mt-3 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--editor-accent-soft)] text-[10px] font-medium text-[var(--editor-accent-text)]"><Sparkles className="size-3" /> Ask AI about construction</button>
    </EditorPanel>
  );
}
