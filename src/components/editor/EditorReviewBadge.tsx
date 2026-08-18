"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { getLowConfidenceElements } from "@/lib/standards/editorConfidence";

export function EditorReviewBadge() {
  const floorPlan = useDesignStore((state) => state.floorPlan);
  const [nextIndex, setNextIndex] = useState(0);
  const elements = getLowConfidenceElements(floorPlan);

  if (elements.length === 0) return null;

  const inspectNext = () => {
    setNextIndex((index) => (index + 1) % elements.length);
  };

  const element = elements[nextIndex % elements.length];

  return (
    <button
      onClick={inspectNext}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-sm transition-colors"
      title={`${element.kind} "${element.id}" needs review (confidence: ${(element.confidence * 100).toFixed(0)}%)`}
    >
      <AlertTriangle size={14} />
      <span className="font-medium">{elements.length} need review</span>
    </button>
  );
}
