'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDesignStore } from '@/store/designStore';

/**
 * Lets a participant submit their edited floor plan back to the research
 * pipeline as a training correction. Only shown when the current import came
 * through the self-hosted ML backend (designStore.lastImportJobId is set) --
 * the backend's corrections endpoint is tied to a specific inference job.
 *
 * editDeltas is intentionally minimal for now: a single note describing what
 * was fixed, rather than a full structural diff of ghostFloorPlan vs
 * floorPlan. That's enough to satisfy the backend's "material edit" check
 * (backend/app/main.py create_correction) and gets the research
 * data-collection loop working end to end; a real per-element diff is a
 * later upgrade, not required for it to function.
 */
export function SubmitCorrectionPanel() {
  const lastImportJobId = useDesignStore((s) => s.lastImportJobId);
  const floorPlan = useDesignStore((s) => s.floorPlan);
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!lastImportJobId || !floorPlan) return null;
  if (submitted) {
    return (
      <div className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
        Correction submitted — thank you.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 flex w-full items-center gap-2 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] px-3 py-1.5 text-sm text-[var(--editor-text-muted)] transition-colors hover:bg-[var(--editor-surface-raised)]"
      >
        <Send size={14} />
        <span className="font-medium">Submit correction for training</span>
      </button>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await fetch(`/api/ml-backend/jobs/${lastImportJobId}/corrections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedGeometry: floorPlan,
          editDeltas: [{ note: note.trim() || 'Participant reviewed and edited the imported geometry.' }],
          errorReason: note.trim() || null,
          trainingConsent: consent,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Unable to submit correction.');
      setSubmitted(true);
      toast.success('Correction submitted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to submit correction.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-1.5 space-y-2 rounded-lg border border-[var(--editor-border)] bg-[var(--editor-surface)] p-3">
      <p className="text-xs font-medium text-[var(--editor-text)]">Submit this correction for training</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What did you fix or notice was wrong? (optional)"
        rows={2}
        className="w-full rounded-md border border-[var(--editor-border)] bg-transparent px-2 py-1.5 text-xs"
      />
      <label className="flex items-start gap-2 text-xs text-[var(--editor-text-muted)]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        I consent to this correction being used to improve the detection model.
      </label>
      <div className="flex gap-1.5">
        <Button size="sm" className="flex-1" disabled={submitting} onClick={submit}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
