/**
 * Trace-to-Learn status panel: shows baseline, comparison counts, and opacity control.
 * Displayed when ghostFloor is active (trace mode).
 */

import { useTraceMode, useFloorPlanStore } from "../../lib/store/floorPlanStore";
import { useMemo } from "react";

export function TraceStatus() {
  const { ghostOpacity, isTraceMode } = useTraceMode();
  const setGhostOpacity = useFloorPlanStore((state) => state.setGhostOpacity);
  const currentFloor = useFloorPlanStore((state) => state.currentFloor);
  const ghostFloor = useFloorPlanStore((state) => state.ghostFloor);
  const getTraceComparison = useFloorPlanStore((state) => state.getTraceComparison);
  const comparison = useMemo(
    () => getTraceComparison(),
    [currentFloor, getTraceComparison, ghostFloor]
  );

  if (!isTraceMode) return null;

  return (
    <section aria-label="Trace-to-Learn status" className="border-b border-blue-100 bg-blue-50 px-4 py-2 text-blue-950">
      <div className="text-sm text-slate-100">
        <div className="mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-700">Trace-to-Learn Mode</h3>
          <p className="text-xs text-blue-900/75">Comparing edits to a read-only baseline.</p>
        </div>

        {comparison && (
          <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span><strong>Baseline:</strong> {comparison.ghostWallCount} walls</span>
            <span><strong>Current:</strong> {comparison.currentWallCount} walls</span>
            <span>Rooms: {comparison.ghostRoomCount} → {comparison.currentRoomCount}</span>
          </div>
        )}

        <div className="flex max-w-md items-center gap-3">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="baseline-opacity" className="text-xs font-medium">Baseline opacity</label>
          </div>
          <input
            id="baseline-opacity"
            type="range"
            min="0"
            max="100"
            value={Math.round(ghostOpacity * 100)}
            onChange={(e) => setGhostOpacity(Number(e.target.value) / 100)}
            className="h-2 flex-1 cursor-pointer accent-blue-700"
          />
          <output htmlFor="baseline-opacity" className="w-9 text-right font-mono text-xs text-blue-700">{Math.round(ghostOpacity * 100)}%</output>
        </div>
        <p className="mt-1 text-xs text-blue-900/70">Blue dashed walls are the baseline; dark walls are editable.</p>
        <span data-testid="ghost-opacity" className="sr-only">Ghost opacity: {Math.round(ghostOpacity * 100)}%</span>
      </div>
    </section>
  );
}
