'use client';

import { AlertTriangle, Sparkles } from 'lucide-react';
import { compareFloorPlans } from '@/lib/comparison';
import { getLowConfidenceElements } from '@/lib/standards/editorConfidence';
import { EditorPanel } from '@/components/ui/editor-panel';
import type { FloorPlan, ValidationResult } from '@/types/design';

export function DesignReviewPanel({
  floorPlan,
  baseline,
  results,
  onFocus,
}: {
  floorPlan: FloorPlan | null;
  baseline: FloorPlan | null;
  results: ValidationResult[];
  onFocus: (id: string) => void;
}) {
  const lowConfidence = getLowConfidenceElements(floorPlan);
  const actionable = results.filter((item) => item.type === 'error' || item.type === 'warning').slice(0, 4);
  const changes = floorPlan && baseline ? compareFloorPlans(baseline, floorPlan).counts : null;
  const reviewPrompt = lowConfidence.length > 0
    ? 'Review the selected plan for low-confidence imported geometry, current validation findings, and the most important corrections. Do not apply changes.'
    : 'Review this plan for circulation, openings, room areas, and current validation findings. Do not apply changes.';

  if (!floorPlan) return null;
  return (
    <EditorPanel title="Design review" description="Evidence before changes" action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--editor-accent-text)]">2D</span>}>
      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="rounded-md bg-[var(--editor-surface-muted)] px-1.5 py-2"><b className="block text-xs text-[var(--editor-text)]">{actionable.length}</b>findings</div>
        <div className="rounded-md bg-[var(--editor-surface-muted)] px-1.5 py-2"><b className="block text-xs text-[var(--editor-text)]">{lowConfidence.length}</b>uncertain</div>
        <div className="rounded-md bg-[var(--editor-surface-muted)] px-1.5 py-2"><b className="block text-xs text-[var(--editor-text)]">{changes ? changes.added + changes.moved + changes.resized : '—'}</b>changes</div>
      </div>
      {actionable.length > 0 && <div className="mt-3 space-y-1.5">{actionable.map((item) => <button type="button" key={item.id} onClick={() => onFocus(item.targetId)} className="flex w-full items-start gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] text-[var(--editor-text-muted)] hover:bg-[var(--editor-surface-muted)]"><AlertTriangle className="mt-0.5 size-3 shrink-0 text-[var(--editor-warning)]" /><span>{item.message}</span></button>)}</div>}
      {lowConfidence.length > 0 && <button type="button" onClick={() => onFocus(lowConfidence[0].id)} className="mt-2 text-left text-[10px] text-[var(--editor-accent-text)] hover:underline">Inspect next uncertain {lowConfidence[0].kind}</button>}
      <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('corbel:chat-intent', { detail: reviewPrompt }))} className="mt-3 flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--editor-accent-soft)] px-2 text-[10px] font-medium text-[var(--editor-accent-text)] hover:bg-[var(--editor-surface-muted)]"><Sparkles className="size-3" /> Ask AI to review</button>
    </EditorPanel>
  );
}
