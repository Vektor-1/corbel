'use client';

import { useEffect, useId, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Download, Lightbulb, RotateCcw, Target } from 'lucide-react';
import { EditorPanel } from '@/components/ui/editor-panel';
import { cn } from '@/lib/cn';

export type AdaptiveTaskOption = {
  id: string;
  label: string;
};

export type AdaptiveLearningTask = {
  prompt: string;
  options: AdaptiveTaskOption[];
  /** The option that demonstrates the target concept. Never use this as a building approval. */
  correctOptionId: string;
  correctFeedback?: string;
  incorrectFeedback?: string;
};

export type AdaptiveIntervention = {
  /** Stable key suitable for research-event logging, e.g. `closed-room-boundary`. */
  misconceptionId: string;
  misconceptionLabel: string;
  /** A measured observation, not a diagnosis stated as fact. */
  evidence: string;
  explanation: string;
  task: AdaptiveLearningTask;
  confidence?: 'low' | 'moderate' | 'high';
  status?: 'active' | 'task-complete' | 'retry-ready' | 'verified';
  retryLabel?: string;
};

export type AdaptiveLearningPanelProps = {
  intervention?: AdaptiveIntervention | null;
  isChecking?: boolean;
  onAnswer?: (optionId: string, correct: boolean) => void;
  onRetry?: () => void;
  onCheckPlan?: () => void;
  onAskTutor?: () => void;
  onExportRecord?: () => void;
  className?: string;
};

const confidenceCopy = {
  low: 'A tentative pattern',
  moderate: 'A likely pattern',
  high: 'A repeated pattern',
} as const;

/**
 * Presentation-only learning surface for an observed drawing error. The editor
 * owns persistence and verification so each action can be recorded for study.
 */
export function AdaptiveLearningPanel({
  intervention,
  isChecking = false,
  onAnswer,
  onRetry,
  onCheckPlan,
  onAskTutor,
  onExportRecord,
  className,
}: AdaptiveLearningPanelProps) {
  const [answerId, setAnswerId] = useState<string | null>(null);
  const evidenceId = useId();
  const taskId = useId();

  useEffect(() => {
    setAnswerId(null);
  }, [intervention?.misconceptionId, intervention?.task.prompt]);

  if (!intervention) {
    return (
      <EditorPanel title="Adaptive feedback" description="Responds to observed drawing patterns" className={className}>
        <div className="border-l-2 border-[var(--editor-border-strong)] pl-3">
          <p className="text-[11px] leading-4 text-[var(--editor-text-muted)]">No corrective task is active.</p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--editor-text-subtle)]">
            When a check identifies a learnable plan-reading error, Corbel will offer one focused retry here.
          </p>
        </div>
        {onExportRecord && (
          <button
            type="button"
            onClick={onExportRecord}
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--editor-text-muted)] underline decoration-[var(--editor-border-strong)] underline-offset-2 hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            <Download className="size-3" /> Export learning record
          </button>
        )}
      </EditorPanel>
    );
  }

  const answered = Boolean(answerId);
  const correct = answerId === intervention.task.correctOptionId;
  const verified = intervention.status === 'verified';
  const taskComplete = intervention.status === 'task-complete' || intervention.status === 'retry-ready' || verified;
  const canRetry = correct || taskComplete;

  const chooseAnswer = (optionId: string) => {
    if (taskComplete) return;
    const isCorrect = optionId === intervention.task.correctOptionId;
    setAnswerId(optionId);
    onAnswer?.(optionId, isCorrect);
  };

  return (
    <EditorPanel
      title="Adaptive feedback"
      description="A focused learning step from your current drawing"
      className={className}
      action={
        <span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">
          {confidenceCopy[intervention.confidence ?? 'moderate']}
        </span>
      }
    >
      <div className="space-y-3">
        <section aria-labelledby={`${taskId}-pattern`} className="border-l-2 border-[var(--editor-warning)] pl-3">
          <p id={`${taskId}-pattern`} className="text-[11px] font-medium text-[var(--editor-text)]">
            {intervention.misconceptionLabel}
          </p>
          <p className="mt-1 text-[10px] leading-4 text-[var(--editor-text-subtle)]">
            <span className="font-medium text-[var(--editor-text-muted)]">Observed: </span>{intervention.evidence}
          </p>
        </section>

        <section aria-label="Explanation" className="bg-[var(--editor-surface-muted)] px-2.5 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.09em] text-[var(--editor-accent-text)]">
              <Lightbulb className="size-3" /> Why it matters
            </div>
            {onAskTutor && (
              <button
                type="button"
                onClick={onAskTutor}
                className="text-[10px] font-medium text-[var(--editor-text-muted)] underline decoration-[var(--editor-border-strong)] underline-offset-2 hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
              >
                Ask tutor
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] leading-4 text-[var(--editor-text-muted)]">{intervention.explanation}</p>
        </section>

        {!verified && (
          <section aria-labelledby={taskId}>
            <div className="flex items-start gap-1.5">
              <Target className="mt-0.5 size-3.5 shrink-0 text-[var(--editor-accent)]" />
              <p id={taskId} className="text-[11px] font-medium leading-4 text-[var(--editor-text)]">{intervention.task.prompt}</p>
            </div>
            <div className="mt-2 space-y-1.5" aria-label="Corrective micro-task choices">
              {intervention.task.options.map((option) => {
                const isSelected = answerId === option.id;
                const showOutcome = answered && isSelected;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={taskComplete}
                    onClick={() => chooseAnswer(option.id)}
                    className={cn(
                      'flex w-full items-start gap-2 border px-2.5 py-2 text-left text-[11px] leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:cursor-default',
                      showOutcome && correct
                        ? 'border-[var(--editor-success)] bg-[var(--editor-success-soft)] text-[var(--editor-text)]'
                        : showOutcome
                        ? 'border-[var(--editor-danger)] bg-[var(--editor-danger-soft)] text-[var(--editor-text)]'
                        : 'border-[var(--editor-border)] bg-[var(--editor-surface-raised)] text-[var(--editor-text-muted)] hover:border-[var(--editor-border-strong)] hover:text-[var(--editor-text)]'
                    )}
                  >
                    <span className={cn('mt-0.5 flex size-3 shrink-0 items-center justify-center border', isSelected ? 'border-[var(--editor-accent)] bg-[var(--editor-accent)]' : 'border-[var(--editor-border-strong)]')}>
                      {isSelected && <span className="size-1 bg-[var(--editor-canvas)]" />}
                    </span>
                    <span>{option.label}</span>
                  </button>
                );
              })}
            </div>
            <p aria-live="polite" className={cn('mt-2 text-[10px] leading-4', !answered ? 'text-[var(--editor-text-subtle)]' : correct ? 'text-[var(--editor-success)]' : 'text-[var(--editor-danger)]')}>
              {!answered
                ? 'Choose one answer, then apply the same reasoning to your plan.'
                : correct
                ? intervention.task.correctFeedback ?? 'Correct. Now apply this distinction in the drawing.'
                : intervention.task.incorrectFeedback ?? `Not quite. Re-read the explanation, then use it while you retry.`}
            </p>
          </section>
        )}

        {verified ? (
          <section aria-live="polite" className="border-l-2 border-[var(--editor-success)] pl-3">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--editor-success)]">
              <CheckCircle2 className="size-3.5" /> Retry verified
            </div>
            <p className="mt-1 text-[10px] leading-4 text-[var(--editor-text-subtle)]">
              This check is a learning signal, not a building approval. Keep reviewing the wider plan.
            </p>
          </section>
        ) : (
          <div className="border-t border-[var(--editor-border)] pt-3">
            {taskComplete && (
              <p role="status" className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-[var(--editor-success)]">
                <CheckCircle2 className="size-3" /> Concept check complete. Apply it to the highlighted plan element.
              </p>
            )}
            <p className="text-[10px] leading-4 text-[var(--editor-text-subtle)]">
              {canRetry ? 'Return to the drawing, make one focused correction, then check it.' : 'Complete the short task before starting the guided retry.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onRetry}
                disabled={!canRetry || isChecking}
                className="inline-flex h-7 items-center gap-1.5 border border-[var(--editor-border-strong)] bg-[var(--editor-surface-raised)] px-2.5 text-[10px] font-medium text-[var(--editor-text)] transition-colors hover:bg-[var(--editor-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RotateCcw className="size-3" /> {intervention.retryLabel ?? 'Start guided retry'}
              </button>
              <button
                type="button"
                onClick={onCheckPlan}
                disabled={!canRetry || isChecking}
                className="inline-flex h-7 items-center gap-1.5 bg-[var(--editor-accent)] px-2.5 text-[10px] font-medium text-[var(--editor-canvas)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--editor-surface)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ClipboardCheck className="size-3" /> {isChecking ? 'Checking…' : 'Check correction'}
              </button>
            </div>
          </div>
        )}

        {onExportRecord && (
          <button
            type="button"
            onClick={onExportRecord}
            aria-describedby={evidenceId}
            className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--editor-text-muted)] underline decoration-[var(--editor-border-strong)] underline-offset-2 hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
          >
            <Download className="size-3" /> Export learning record
          </button>
        )}
        <p id={evidenceId} className="sr-only">Exports the learning event record for research review.</p>
      </div>
    </EditorPanel>
  );
}
