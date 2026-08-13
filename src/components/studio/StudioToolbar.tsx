/**
 * Studio toolbar with tooltips for drawing, validation, and trace mode controls.
 */

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useFloorPlanStore, useValidationIssues } from "@/lib/store/floorPlanStore";
import { AlertCircle, CheckCircle } from "lucide-react";

interface StudioToolbarProps {
  isTraceMode: boolean;
}

export function StudioToolbar({ isTraceMode }: StudioToolbarProps) {
  const validateFloor = useFloorPlanStore((s) => s.validateFloor);
  const validationIssues = useValidationIssues();
  const hasIssues = validationIssues.length > 0;

  return (
    <TooltipProvider delay={200}>
      <div className="flex items-center gap-2">
        {/* Validation button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={validateFloor}
              className={hasIssues ? "bg-red-50 border-red-200" : ""}
            >
              {hasIssues ? <AlertCircle size={14} className="text-red-600" /> : <CheckCircle size={14} className="text-green-600" />}
              Validate
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Check floor plan against building code and spatial rules.
          </TooltipContent>
        </Tooltip>

        {/* Drawing mode help */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-gray-500">
              Draw help
            </span>
          </TooltipTrigger>
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
            <TooltipTrigger asChild>
              <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700">
                Comparing to baseline
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              Baseline shown ghosted. Compare your edits side-by-side.
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
