import { useEffect, useState } from "react";

export type FeatureFlag = "traceToLearn" | "validation" | "undoRedo" | "threeDPreview" | "adaptiveLearning" | "mlBackend";

const DEFAULT_FLAGS: Record<FeatureFlag, boolean> = {
  traceToLearn: true,
  validation: true,
  undoRedo: true,
  threeDPreview: true,
  adaptiveLearning: true,
  mlBackend: false,
};

// NEXT_PUBLIC_ vars are inlined identically into both the server and client
// bundles at build time, so this half is safe to call during SSR -- unlike
// the URL search-param override below, which only exists in the browser.
function getEnvFlag(flag: FeatureFlag): boolean {
  const envMap: Record<FeatureFlag, string | undefined> = {
    traceToLearn: process.env.NEXT_PUBLIC_FEATURE_TRACE_TO_LEARN,
    validation: process.env.NEXT_PUBLIC_FEATURE_VALIDATION,
    undoRedo: process.env.NEXT_PUBLIC_FEATURE_UNDO_REDO,
    threeDPreview: process.env.NEXT_PUBLIC_FEATURE_3D_PREVIEW,
    adaptiveLearning: process.env.NEXT_PUBLIC_FEATURE_ADAPTIVE_LEARNING,
    mlBackend: process.env.NEXT_PUBLIC_FEATURE_ML_BACKEND,
  };

  const envValue = envMap[flag];
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  return DEFAULT_FLAGS[flag];
}

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

  return getEnvFlag(flag);
}

export function useFeatureFlag(flag: FeatureFlag): boolean {
  // Initialize with the env-only value so the first client render matches
  // SSR exactly (both compute getEnvFlag the same way); the URL-param
  // override, which only exists in the browser, is applied after mount via
  // the effect below instead of during the initial render.
  const [enabled, setEnabled] = useState<boolean>(() => getEnvFlag(flag));

  useEffect(() => {
    setEnabled(getFeatureFlag(flag));
  }, [flag]);

  return enabled;
}
