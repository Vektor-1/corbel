/**
 * Studio toolbar with tooltips for drawing, validation, and trace mode controls.
 */

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useFloorPlanStore, useValidationIssues, useTemporalStore } from "@/lib/store/floorPlanStore";
import { AlertCircle, CheckCircle, Undo2, Redo2 } from "lucide-react";
import { toast } from "sonner";
import { getValidationNotification } from "./validationNotifications";
import { ReviewBadge } from "./ReviewBadge";
import { useFeatureFlag } from "@/lib/flags";

interface StudioToolbarProps {
  isTraceMode: boolean;
}

export function StudioToolbar({ isTraceMode }: StudioToolbarProps) {
  const { undo, redo, pastStates, futureStates } = useTemporalStore((state) => state);
  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  const validationIssues = useValidationIssues();
  const hasIssues = validationIssues.length > 0;

  const validateFloor = useFloorPlanStore((s) => s.validateFloor);
  const validationEnabled = useFeatureFlag("validation");
  const undoRedoEnabled = useFeatureFlag("undoRedo");
  const handleValidate = () => {
    validateFloor();

    const notification = getValidationNotification(
      useFloorPlanStore.getState().validationIssues.length,
    );
    toast[notification.level](notification.message);
  };

  return (
    <TooltipProvider delay={200}>
      <div className="flex items-center gap-2">
        {/* Validation button */}
        {validationEnabled && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleValidate}
                  className={hasIssues ? "bg-red-50 border-red-200" : ""}
                >
                  {hasIssues ? <AlertCircle size={14} className="text-red-600" /> : <CheckCircle size={14} className="text-green-600" />}
                  Validate
                </Button>
              }
            />
            <TooltipContent side="bottom">
              Check floor plan against building code and spatial rules.
            </TooltipContent>
          </Tooltip>
        )}

        {/* Undo button */}
        {undoRedoEnabled && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => undo()}
                  disabled={!canUndo}
                  aria-label="Undo"
                >
                  <Undo2 size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom">Undo last change</TooltipContent>
          </Tooltip>
        )}

        {/* Redo button */}
        {undoRedoEnabled && (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => redo()}
                  disabled={!canRedo}
                  aria-label="Redo"
                >
                  <Redo2 size={14} />
                </Button>
              }
            />
            <TooltipContent side="bottom">Redo next change</TooltipContent>
          </Tooltip>
        )}
        <ReviewBadge />

        {/* Drawing mode help */}
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="text-xs text-gray-500 cursor-help">
                Draw help
              </span>
            }
          />
          <TooltipContent side="bottom" align="start">
            <div className="text-xs space-y-1">
              <div><strong>Draw:</strong> Click once to start a wall, then click again to place it.</div>
              <div><strong>Resize:</strong> Drag a wall endpoint.</div>
              <div><strong>Delete:</strong> Right-click wall</div>
              <div><strong>Validate:</strong> Run checks after geometry changes.</div>
            </div>
          </TooltipContent>
        </Tooltip>

        {/* Trace mode status */}
        {isTraceMode && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="text-xs px-2 py-1 rounded bg-blue-900/20 text-blue-400 border border-blue-800/30 cursor-help">
                  Comparing to baseline
                </span>
              }
            />
            <TooltipContent side="bottom">
              Baseline shown ghosted. Compare your edits side-by-side.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
