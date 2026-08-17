import { useFloorPlanStore } from "@/lib/store/floorPlanStore";
import { AlertCircle, AlertTriangle, Info } from "lucide-react";

const elementKind = (elementId: string) => {
  const floor = useFloorPlanStore.getState().currentFloor;
  if (!floor) return null;
  if (floor.walls.some((wall) => wall.id === elementId)) return "wall" as const;
  if (floor.rooms.some((room) => room.id === elementId)) return "room" as const;
  if (floor.openings.some((opening) => opening.id === elementId)) return "opening" as const;
  return null;
};

const severityConfig = {
  error: {
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    textColor: "text-red-950",
    dotColor: "text-red-600",
    icon: AlertCircle,
  },
  warning: {
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    textColor: "text-amber-950",
    dotColor: "text-amber-600",
    icon: AlertTriangle,
  },
  info: {
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    textColor: "text-blue-950",
    dotColor: "text-blue-600",
    icon: Info,
  },
};

export function ValidationFeedback() {
  const issues = useFloorPlanStore((state) => state.validationIssues);
  const selectElement = useFloorPlanStore((state) => state.selectElement);

  if (issues.length === 0) return null;

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;

  const summaryParts = [];
  if (errorCount > 0) summaryParts.push(`${errorCount}E`);
  if (warningCount > 0) summaryParts.push(`${warningCount}W`);
  if (infoCount > 0) summaryParts.push(`${infoCount}I`);

  return (
    <aside aria-label="Validation feedback" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-800">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-semibold">Validation feedback · {summaryParts.join(" · ")}</p>
      </div>
      <ul className="space-y-2">
        {issues.map((issue) => {
          const config = severityConfig[issue.severity];
          const Icon = config.icon;
          return (
            <li
              key={issue.id}
              className={`${config.bgColor} ${config.borderColor} ${config.textColor} rounded border px-3 py-2`}
            >
              <div className="flex gap-2">
                <Icon size={16} className={`${config.dotColor} mt-0.5 flex-shrink-0`} />
                <div className="flex-1">
                  <p className="font-medium">{issue.message}</p>
                  {issue.remediation && (
                    <p className="mt-1 text-xs opacity-80">💡 {issue.remediation}</p>
                  )}
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {issue.elementIds.map((elementId) => {
                      const kind = elementKind(elementId);
                      if (!kind) return null;
                      return (
                        <button
                          key={elementId}
                          type="button"
                          onClick={() => selectElement(elementId, kind)}
                          className={`rounded border px-2 py-0.5 text-xs font-medium hover:opacity-80`}
                          style={{
                            borderColor: "currentColor",
                            opacity: 0.7,
                          }}
                        >
                          Inspect {kind}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
