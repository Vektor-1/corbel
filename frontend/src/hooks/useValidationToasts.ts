'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useValidation } from './useValidation';

/**
 * Hook to show toast notifications for validation issues.
 * Only shows new critical errors (not warnings or repeated errors).
 */
export function useValidationToasts(enabled: boolean = true) {
  const validation = useValidation();
  const previousErrorIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const currentErrors = validation.issues.filter((i) => i.severity === 'error');
    const currentErrorIds = new Set(currentErrors.map((e) => e.id));

    // Find new errors (not in previous state)
    const newErrors = currentErrors.filter((error) => !previousErrorIdsRef.current.has(error.id));

    // Show toast for each new error
    newErrors.forEach((error) => {
      toast.error(error.message, {
        description: error.suggestion,
        duration: 5000,
      });
    });

    // Show info if errors were resolved
    const resolvedErrors = Array.from(previousErrorIdsRef.current).filter((id) => !currentErrorIds.has(id));
    if (resolvedErrors.length > 0 && currentErrors.length === 0) {
      toast.success('All errors resolved!', {
        duration: 3000,
      });
    }

    // Update ref for next comparison
    previousErrorIdsRef.current = currentErrorIds;
  }, [validation.issues, enabled]);

  return validation;
}
