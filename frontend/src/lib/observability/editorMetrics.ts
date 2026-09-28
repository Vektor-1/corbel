export type EditorMetricName =
  | 'editor.initialized'
  | 'editor.snapshot.loaded'
  | 'editor.snapshot.saved'
  | 'editor.snapshot.failed'
  | 'editor.validation.completed'
  | 'editor.wall.created'
  | 'editor.opening.blocked'
  | 'editor.canvas.zoomed';

export interface EditorMetric {
  name: EditorMetricName;
  at: number;
  durationMs?: number;
  attributes?: Record<string, boolean | number | string>;
}

const MAX_METRICS = 100;
const metrics: EditorMetric[] = [];

function safeAttributes(attributes?: EditorMetric['attributes']): EditorMetric['attributes'] {
  if (!attributes) return undefined;
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => ['boolean', 'number', 'string'].includes(typeof value))
      .map(([key, value]) => [key.slice(0, 64), typeof value === 'string' ? value.slice(0, 120) : value]),
  );
}

/**
 * Keeps a small, privacy-safe in-memory diagnostics trail. Geometry, prompts,
 * file names, URLs, and provider credentials are intentionally never accepted.
 * A host can subscribe to the DOM event to forward these records to its own
 * approved telemetry service without coupling the editor to one vendor.
 */
export function recordEditorMetric(
  name: EditorMetricName,
  attributes?: EditorMetric['attributes'],
  durationMs?: number,
): void {
  const metric: EditorMetric = { name, at: Date.now(), attributes: safeAttributes(attributes) };
  if (typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0) metric.durationMs = Math.round(durationMs);
  metrics.push(metric);
  if (metrics.length > MAX_METRICS) metrics.splice(0, metrics.length - MAX_METRICS);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('corbel:editor-metric', { detail: metric }));
  }
}

export function recentEditorMetrics(): readonly EditorMetric[] {
  return metrics;
}

export async function measureEditorMetric<T>(
  name: EditorMetricName,
  attributes: EditorMetric['attributes'] | undefined,
  work: () => T | Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await work();
    recordEditorMetric(name, { ...attributes, outcome: 'success' }, performance.now() - startedAt);
    return result;
  } catch (error) {
    recordEditorMetric(name, { ...attributes, outcome: 'failure' }, performance.now() - startedAt);
    throw error;
  }
}
