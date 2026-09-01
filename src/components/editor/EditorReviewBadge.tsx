"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDesignStore } from "@/store/designStore";
import { getLowConfidenceElements } from "@/lib/standards/editorConfidence";

export function EditorReviewBadge() {
  const floorPlan = useDesignStore((state) => state.floorPlan);
  const setSelectedElement = useDesignStore((state) => state.setSelectedElement);
  const [nextIndex, setNextIndex] = useState(0);
  const elements = getLowConfidenceElements(floorPlan);

  if (elements.length === 0) return null;

  const inspectNext = () => {
    const current = elements[nextIndex % elements.length];
    setSelectedElement(current.id);
    setNextIndex((index) => (index + 1) % elements.length);
  };

  const elementIndex = nextIndex % elements.length;
  const element = elements[elementIndex];

  return (
    <button
      onClick={inspectNext}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 text-sm transition-colors"
      title={`Review ${element.kind} ${elementIndex + 1} of ${elements.length} (${(element.confidence * 100).toFixed(0)}% AI confidence)`}
    >
      <AlertTriangle size={14} />
      <span className="font-medium">Review {elements.length} AI-detected items</span>
    </button>
  );
}
