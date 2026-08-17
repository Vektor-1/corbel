import { useFloorPlanStore } from "@/lib/store/floorPlanStore";

const elementKind = (elementId: string) => {
  const floor = useFloorPlanStore.getState().currentFloor;
  if (!floor) return null;
  if (floor.walls.some((wall) => wall.id === elementId)) return "wall" as const;
  if (floor.rooms.some((room) => room.id === elementId)) return "room" as const;
  if (floor.openings.some((opening) => opening.id === elementId)) return "opening" as const;
  return null;
};

/** A compact, actionable result list for the studio validation command. */
export function ValidationFeedback() {
  const issues = useFloorPlanStore((state) => state.validationIssues);
  const selectElement = useFloorPlanStore((state) => state.selectElement);

  if (issues.length === 0) return null;

  return (
    <aside aria-label="Validation feedback" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-950">
      <p className="font-semibold">Validation needs review</p>
      <ul className="mt-1 space-y-1">
        {issues.map((issue) => (
          <li key={issue.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{issue.message}</span>
            {issue.elementIds.map((elementId) => {
              const kind = elementKind(elementId);
              if (!kind) return null;
              return (
                <button
                  key={elementId}
                  type="button"
                  onClick={() => selectElement(elementId, kind)}
                  className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-medium underline underline-offset-2"
                >
                  Inspect {kind}
                </button>
              );
            })}
          </li>
        ))}
      </ul>
    </aside>
  );
}
