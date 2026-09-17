'use client';

import { CheckCircle2, Grid3X3, MoveRight, Ruler, Square, TriangleAlert } from 'lucide-react';
import { EditorPanel } from '@/components/ui/editor-panel';
import { cn } from '@/lib/cn';
import type { ValidationResult } from '@/types/design';

type DraftingTool = 'wall' | 'door' | 'window' | 'select';

type Step = {
  title: string;
  detail: string;
  complete: boolean;
  action?: { label: string; tool?: DraftingTool; onClick?: () => void };
};

export function DraftingSequencePanel({
  walls,
  rooms,
  openings,
  showGrid,
  showDimensions,
  validationResults,
  onChooseTool,
  onSetGrid,
  onSetDimensions,
  onReviewFeedback,
}: {
  walls: number;
  rooms: number;
  openings: number;
  showGrid: boolean;
  showDimensions: boolean;
  validationResults: ValidationResult[];
  onChooseTool: (tool: DraftingTool) => void;
  onSetGrid: (visible: boolean) => void;
  onSetDimensions: (visible: boolean) => void;
  onReviewFeedback: () => void;
}) {
  const steps: Step[] = [
    {
      title: '1. Set out the plan',
      detail: 'Keep the grid and live dimensions visible. Start from one known wall or a stated brief, not an assumed door size.',
      complete: showGrid && showDimensions,
      action: { label: showGrid && showDimensions ? 'Draft walls' : 'Show drafting guides', onClick: () => { onSetGrid(true); onSetDimensions(true); } },
    },
    {
      title: '2. Draw the enclosure',
      detail: 'Use the Wall tool. Endpoints snap to the grid and to nearby wall ends; a room needs a continuous closed loop.',
      complete: walls >= 3,
      action: { label: 'Use Wall tool', tool: 'wall' },
    },
    {
      title: '3. Name and size spaces',
      detail: 'After a boundary closes, choose a room type and inspect its area. The displayed checks are prompts for review, not a substitute for the approved brief or code review.',
      complete: rooms > 0,
      action: { label: 'Select a space', tool: 'select' },
    },
    {
      title: '4. Place openings deliberately',
      detail: 'Add doors and windows only to a host wall. Review width, position, and swing in the inspector; check circulation yourself rather than relying on an automatic path claim.',
      complete: openings > 0,
      action: { label: 'Place a door', tool: 'door' },
    },
    {
      title: '5. Review the consequence',
      detail: validationResults.length
        ? `${validationResults.length} current feedback item${validationResults.length === 1 ? '' : 's'} can be inspected one at a time before export.`
        : 'Run the current review after each meaningful change and discuss structural or regulatory decisions with a qualified tutor.',
      complete: walls > 0 && validationResults.length === 0,
      action: { label: validationResults.length ? 'Review feedback' : 'Select wall to review', onClick: onReviewFeedback, tool: validationResults.length ? undefined : 'select' },
    },
  ];

  const completed = steps.filter((step) => step.complete).length;

  return (
    <EditorPanel
      title="Drafting sequence"
      description="A practical order for a small floor-plan study"
      action={<span className="text-[10px] tabular-nums text-[var(--editor-text-subtle)]">{completed}/{steps.length}</span>}
    >
      <ol className="space-y-3">
        {steps.map((step) => (
          <li key={step.title} className="border-l-2 border-[var(--editor-border)] pl-3">
            <div className="flex items-start gap-1.5">
              <CheckCircle2 className={cn('mt-0.5 size-3.5 shrink-0', step.complete ? 'text-[var(--editor-success)]' : 'text-[var(--editor-text-subtle)]')} aria-hidden="true" />
              <div>
                <p className="text-[11px] font-medium text-[var(--editor-text)]">{step.title}</p>
                <p className="mt-0.5 text-[10px] leading-4 text-[var(--editor-text-subtle)]">{step.detail}</p>
                {step.action && (
                  <button
                    type="button"
                    onClick={() => {
                      step.action?.onClick?.();
                      if (step.action?.tool) onChooseTool(step.action.tool);
                    }}
                    className="mt-1.5 inline-flex min-h-8 items-center gap-1 text-[10px] font-medium text-[var(--editor-accent-text)] underline decoration-[var(--editor-border-strong)] underline-offset-2 hover:text-[var(--editor-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"
                  >
                    {step.title.startsWith('1') ? <Grid3X3 className="size-3" /> : step.title.startsWith('2') ? <Square className="size-3" /> : step.title.startsWith('5') ? <TriangleAlert className="size-3" /> : <MoveRight className="size-3" />}
                    {step.action.label}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex gap-1.5 border-t border-[var(--editor-border)] pt-3 text-[10px] leading-4 text-[var(--editor-text-subtle)]">
        <Ruler className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        Corbel supports drafting practice and explainable checks. It does not certify an approved layout, structural design, accessibility route, cost, or fire strategy.
      </p>
    </EditorPanel>
  );
}
