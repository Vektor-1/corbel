'use client';

import { useMemo } from 'react';
import { EditorPanel } from '@/components/ui/editor-panel';
import { compareFloorPlans } from '@/lib/comparison';
import type { FloorPlan } from '@/types/design';

const deltaTone = (original: number, redesign: number) =>
  redesign === original
    ? 'text-[var(--editor-text-muted)]'
    : redesign > original
      ? 'text-[var(--editor-success)]'
      : 'text-[var(--editor-warning)]';

const formatDelta = (original: number, redesign: number, unit: string) => {
  const diff = Math.round((redesign - original) * 100) / 100;
  if (diff === 0) return '—';
  return `${diff > 0 ? '+' : ''}${diff}${unit ? ` ${unit}` : ''}`;
};

export function ComparisonPanel({
  original,
  redesign,
}: {
  original: FloorPlan | null;
  redesign: FloorPlan | null;
}) {
  const report = useMemo(
    () => (original && redesign ? compareFloorPlans(original, redesign) : null),
    [original, redesign]
  );

  if (!report) return null;

  const { metrics, roomAreas, counts, rubric } = report;

  const rubricLabels: Record<string, string> = {
    spatialAdequacy: 'Spatial adequacy',
    circulationOpenings: 'Circulation & openings',
    wallSuitability: 'Wall suitability',
    complianceCount: 'Compliance issues',
  };

  const rubricTone: Record<string, string> = {
    improved: 'text-[var(--editor-success)]',
    regressed: 'text-[var(--editor-warning)]',
    neutral: 'text-[var(--editor-text-subtle)]',
  };

  return (
    <EditorPanel title="Redesign review">
      <div className="mb-3 flex flex-wrap gap-1.5 text-[10px]">
        {([
          ['added', counts.added, 'bg-[color-mix(in_srgb,var(--editor-success)_18%,transparent)] text-[var(--editor-success)]'],
          ['removed', counts.removed, 'bg-[color-mix(in_srgb,var(--editor-danger,#c0564f)_18%,transparent)] text-[var(--editor-danger,#c0564f)]'],
          ['moved', counts.moved, 'bg-[color-mix(in_srgb,var(--editor-warning)_18%,transparent)] text-[var(--editor-warning)]'],
          ['resized', counts.resized, 'bg-[color-mix(in_srgb,var(--editor-warning)_18%,transparent)] text-[var(--editor-warning)]'],
          ['unchanged', counts.unchanged, 'bg-[var(--editor-border)] text-[var(--editor-text-subtle)]'],
        ] as const).map(([label, count, tone]) => (
          <span key={label} className={`rounded-full px-2 py-0.5 tabular-nums ${tone}`}>
            {count} {label}
          </span>
        ))}
      </div>

      <dl className="grid grid-cols-1 gap-y-1.5 text-[11px]">
        {metrics.map((metric) => (
          <div key={metric.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-[var(--editor-text-subtle)]">{metric.label}</dt>
            <dd className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[var(--editor-text-subtle)]">
                {metric.original}{metric.unit ? ` ${metric.unit}` : ''}
              </span>
              <span className="text-[var(--editor-text-subtle)]">→</span>
              <span className="text-[var(--editor-text-muted)]">
                {metric.redesign}{metric.unit ? ` ${metric.unit}` : ''}
              </span>
              <span className={deltaTone(metric.original, metric.redesign)}>
                {formatDelta(metric.original, metric.redesign, metric.unit)}
              </span>
            </dd>
          </div>
        ))}
      </dl>

      {rubric.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--editor-text-subtle)]">
            Rubric
          </p>
          <dl className="grid grid-cols-1 gap-y-1 text-[11px]">
            {rubric.map((item) => (
              <div key={item.criterion} className="flex items-baseline justify-between gap-2">
                <dt className="text-[var(--editor-text-subtle)]">
                  {rubricLabels[item.criterion] ?? item.criterion}
                </dt>
                <dd className={`shrink-0 tabular-nums ${rubricTone[item.status]}`}>
                  {item.status}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {roomAreas.length > 0 && (
        <>
          <p className="mb-1.5 mt-3 text-[10px] font-medium uppercase tracking-wide text-[var(--editor-text-subtle)]">
            Room areas
          </p>
          <dl className="grid grid-cols-1 gap-y-1 text-[11px]">
            {roomAreas.map((room, i) => (
              <div key={`${room.name}-${i}`} className="flex items-baseline justify-between gap-2">
                <dt className="truncate text-[var(--editor-text-subtle)]">{room.name}</dt>
                <dd className="shrink-0 tabular-nums text-[var(--editor-text-muted)]">
                  {room.originalArea === null
                    ? `new · ${room.redesignArea} m²`
                    : room.redesignArea === null
                      ? `removed · was ${room.originalArea} m²`
                      : `${room.originalArea} → ${room.redesignArea} m²`}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </EditorPanel>
  );
}
