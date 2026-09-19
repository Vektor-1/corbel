'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useDesignStore } from '@/store/designStore';
import { reconstructFloorPlan } from '@/lib/plan-import/reconstruct';
import type { ReconstructionResultV1 } from '@/lib/plan-import/types';

interface HistoryEntry {
  prompt: string;
  result: 'success' | 'error';
  message: string;
}

export function PlanChatPanel() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [available, setAvailable] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const beginImportedEdit = useDesignStore((s) => s.beginImportedEdit);

  useEffect(() => {
    fetch('/api/editor/generate')
      .then((res) => res.json())
      .then((data) => setAvailable(data.available))
      .catch(() => setAvailable(false));
  }, []);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    const trimmed = prompt.trim();

    if (!trimmed) {
      setStatus('Please describe a floor plan to generate.');
      return;
    }

    setGenerating(true);
    setStatus('Generating your plan…');

    try {
      const response = await fetch('/api/editor/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate plan');
      }

      const result: ReconstructionResultV1 = await response.json();
      const imported = reconstructFloorPlan(result);
      beginImportedEdit(imported.floorPlan);

      const diagnosticMessages = imported.diagnostics.map((d) => d.message).join('; ');
      const successMessage = diagnosticMessages ? `Plan generated. ${diagnosticMessages}` : 'Plan generated successfully.';

      setHistory((prev) => [...prev, { prompt: trimmed, result: 'success', message: successMessage }]);
      setStatus(successMessage);
      setPrompt('');
      setSubmitAttempted(false);
      toast.success('Floor plan generated');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate plan';
      setHistory((prev) => [...prev, { prompt: trimmed, result: 'error', message: errorMessage }]);
      setStatus(errorMessage);
      toast.error(errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  if (!available) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="editor-chat-panel editor-island absolute bottom-14 left-4 z-20 flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[11px] text-[var(--editor-text-subtle)] hover:bg-[var(--editor-surface-muted)]"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        AI: describe a plan
      </button>
    );
  }

  return (
    <div className="editor-chat-panel absolute bottom-14 left-4 z-20 w-80 flex flex-col">
      <div className="editor-island rounded-xl border border-[var(--editor-border)] bg-[var(--editor-surface)] shadow-lg">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--editor-border)] px-3 py-2">
          <p className="text-xs font-medium text-[var(--editor-text)]">Generate a plan</p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md p-1 text-[var(--editor-text-muted)] transition-colors hover:bg-[var(--editor-surface-muted)] hover:text-[var(--editor-text)]"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto border-b border-[var(--editor-border)] px-3 py-2">
          {history.length === 0 ? (
            <p className="text-[10px] text-[var(--editor-text-subtle)]">No history yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((entry, idx) => (
                <div key={idx} className="text-[10px] leading-4">
                  <p className="font-medium text-[var(--editor-text)]">{entry.prompt}</p>
                  <p className={entry.result === 'success' ? 'text-[var(--editor-success)]' : 'text-[var(--editor-danger)]'}>
                    {entry.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2 px-3 py-2">
          <label className="block text-[10px] font-medium text-[var(--editor-text)]">
            Describe the floor plan to generate
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A 3-bedroom house with a living room, kitchen, and 2 bathrooms"
              className="mt-1 w-full resize-none rounded-md border border-[var(--editor-border)] bg-[var(--editor-canvas)] px-2 py-1.5 text-[10px] text-[var(--editor-text)] placeholder-[var(--editor-text-subtle)] focus:border-[var(--editor-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--editor-accent-soft)]"
              rows={3}
              aria-invalid={submitAttempted && !prompt.trim()}
              aria-describedby="plan-chat-status"
            />
          </label>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={generating || !prompt.trim()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--editor-accent)] px-3 text-xs font-medium text-[var(--editor-canvas)] hover:bg-[var(--editor-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--editor-surface)]"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            {generating ? 'Generating…' : 'Generate plan'}
          </button>
          <p id="plan-chat-status" aria-live="polite" className="text-[10px] leading-4 text-[var(--editor-text-subtle)]">
            {status ?? 'Describe a floor plan in your own words to generate it.'}
          </p>
        </div>
      </div>
    </div>
  );
}
