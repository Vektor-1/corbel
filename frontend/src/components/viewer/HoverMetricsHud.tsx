import { formatLength } from '@/lib/units/measurements';
import type { LengthUnit } from '@/lib/units/measurements';
import type { ElementMetrics } from '@/lib/geometry/element-metrics';

function rowsFor(metrics: ElementMetrics, lengthUnit: LengthUnit): Array<[string, string]> {
  switch (metrics.kind) {
    case 'wall':
      return [
        ['Length', formatLength(metrics.length, lengthUnit)],
        ['Height', formatLength(metrics.height, lengthUnit)],
        ['Thickness', formatLength(metrics.thickness, lengthUnit)],
      ];
    case 'door':
      return [
        ['Width', formatLength(metrics.width, lengthUnit)],
        ['Height', formatLength(metrics.height, lengthUnit)],
      ];
    case 'window':
      return [
        ['Width', formatLength(metrics.width, lengthUnit)],
        ['Height', formatLength(metrics.height, lengthUnit)],
        ['Sill height', formatLength(metrics.sillHeight, lengthUnit)],
      ];
    case 'object':
      return [
        ['Width', formatLength(metrics.width, lengthUnit)],
        ['Height', formatLength(metrics.height, lengthUnit)],
        ['Depth', formatLength(metrics.depth, lengthUnit)],
      ];
  }
}

/** Read-only inspection card for the currently hovered 3D element. Purely
 * transient presentation state -- no scene node, no history entry. */
export function HoverMetricsHud({ metrics, lengthUnit }: { metrics: ElementMetrics | null; lengthUnit: LengthUnit }) {
  if (!metrics) return null;

  const confidence = metrics.kind !== 'object' ? metrics.confidence : undefined;

  return (
    <div className="editor-island pointer-events-none absolute top-4 left-4 min-w-[10rem] rounded-xl px-3 py-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-3 font-medium text-[var(--editor-text)]">
        <span>{metrics.label}</span>
        {confidence !== undefined && confidence < 1 && (
          <span className="text-[var(--editor-text-subtle)]">{Math.round(confidence * 100)}% confidence</span>
        )}
      </div>
      {rowsFor(metrics, lengthUnit).map(([label, value]) => (
        <div key={label} className="flex items-center justify-between gap-3 text-[var(--editor-text-subtle)]">
          <span>{label}</span>
          <span className="font-mono text-[var(--editor-text)]">{value}</span>
        </div>
      ))}
    </div>
  );
}
