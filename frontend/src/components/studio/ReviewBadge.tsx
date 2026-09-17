"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCurrentFloor, useFloorPlanStore } from "@/lib/store/floorPlanStore";
import { getLowConfidenceElements } from "@/lib/trace/confidence";

/** Cycles through AI-drafted geometry that remains below Corbel's review thresholds. */
export function ReviewBadge() {
  const floor = useCurrentFloor();
  const selectElement = useFloorPlanStore((state) => state.selectElement);
  const [nextIndex, setNextIndex] = useState(0);
  const elements = getLowConfidenceElements(floor);

  if (elements.length === 0) return null;

  const inspectNext = () => {
    const element = elements[nextIndex % elements.length];
    selectElement(element.id, element.kind);
    setNextIndex((index) => (index + 1) % elements.length);
  };

  return (
    <Button
      aria-label={`${elements.length} elements need review. Select the next element.`}
      className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
      onClick={inspectNext}
      size="sm"
      type="button"
      variant="outline"
    >
      <AlertTriangle aria-hidden="true" size={14} />
      {elements.length} {elements.length === 1 ? "element needs review" : "elements need review"}
    </Button>
  );
}
