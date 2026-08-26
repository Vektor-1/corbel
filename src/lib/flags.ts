import { useEffect, useState } from "react";

export type FeatureFlag = "traceToLearn" | "validation" | "undoRedo" | "threeDPreview";

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  traceToLearn: true,
  validation: true,
  undoRedo: true,
  threeDPreview: true,
};

export function getFeatureFlag(flag: FeatureFlag): boolean {
  // Check client-side overrides (search params)
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      const paramOverride = params.get(`feature.${flag}`);
      if (paramOverride === "true") return true;
      if (paramOverride === "false") return false;
    } catch {
      // Ignore if search parameters are unparseable
    }
  }

  // Check env vars
  const envMap: Record<FeatureFlag, string | undefined> = {
    traceToLearn: process.env.NEXT_PUBLIC_FEATURE_TRACE_TO_LEARN,
    validation: process.env.NEXT_PUBLIC_FEATURE_VALIDATION,
    undoRedo: process.env.NEXT_PUBLIC_FEATURE_UNDO_REDO,
    threeDPreview: process.env.NEXT_PUBLIC_FEATURE_3D_PREVIEW,
  };

  const envValue = envMap[flag];
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  return DEFAULT_FLAGS[flag];
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const [enabled, setEnabled] = useState<boolean>(() => {
    // Avoid SSR hydration mismatch by initializing with a default or getting value safely if in browser
    if (typeof window !== "undefined") {
      return getFeatureFlag(flag);
    }
    return DEFAULT_FLAGS[flag];
  });

  useEffect(() => {
    setEnabled(getFeatureFlag(flag));
  }, [flag]);

  return enabled;
}
