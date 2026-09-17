import React from 'react';

/**
 * Study condition (arm assignment) for the adaptive-learning evaluation.
 *
 * Separate from feature flags: a participant's study arm (adaptive or comparison)
 * is a three-way lookup (URL param → localStorage persistence → default), not a
 * boolean feature toggle. Kept in its own module to avoid conflating "is this feature
 * on?" with "which arm is this participant in?".
 */

export type StudyCondition = 'adaptive' | 'comparison';

const STUDY_CONDITION_STORAGE_KEY = 'corbel.study-condition.v1';

/**
 * Get the study condition for this session from URL param, localStorage, or default.
 * Reads ?condition=adaptive|comparison and persists it. The historic
 * ?feature.adaptiveLearning=false URL remains a comparison alias so old study
 * handouts do not accidentally expose the intervention. The explicit condition
 * always wins. Tolerates unparseable search strings (invalid values are ignored,
 * never throw).
 */
export function getStudyCondition(): StudyCondition {
  if (typeof window === 'undefined') {
    return 'adaptive';
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const urlOverride = params.get('condition');

    if (urlOverride === 'comparison' || urlOverride === 'adaptive') {
      // Persist the URL-derived value so it survives navigation (e.g., /upload → /editor)
      window.localStorage.setItem(STUDY_CONDITION_STORAGE_KEY, urlOverride);
      return urlOverride;
    }
    if (params.get('feature.adaptiveLearning') === 'false') {
      window.localStorage.setItem(STUDY_CONDITION_STORAGE_KEY, 'comparison');
      return 'comparison';
    }
  } catch {
    // Ignore if search parameters are unparseable
  }

  // Fall back to persisted value or default
  try {
    const persisted = window.localStorage.getItem(STUDY_CONDITION_STORAGE_KEY);
    if (persisted === 'comparison' || persisted === 'adaptive') {
      return persisted;
    }
  } catch {
    // Ignore if localStorage is unavailable
  }

  return 'adaptive';
}

/**
 * Hook for reading the study condition. Mirrors useFeatureFlag's shape: SSR-safe
 * default state on server, re-reconciles on client mount.
 */
export function useStudyCondition(): StudyCondition {
  const [condition, setCondition] = React.useState<StudyCondition>(() => {
    if (typeof window !== 'undefined') {
      return getStudyCondition();
    }
    return 'adaptive';
  });

  React.useEffect(() => {
    setCondition(getStudyCondition());
  }, []);

  return condition;
}
