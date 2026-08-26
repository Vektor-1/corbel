'use client';

import { useMemo } from 'react';
import { useFloorPlanStore } from '@/store/floorPlanStore';
import { validateFloorRealtime, getElementSeverity, type RealtimeValidationResult } from '@/lib/standards/realtimeValidation';

/**
 * Hook to get real-time validation results for current floor.
 * Re-computes on floor or library change.
 */
export function useValidation(): RealtimeValidationResult {
  const { currentFloor, library } = useFloorPlanStore((state) => ({
    currentFloor: state.currentFloor,
    library: state.library,
  }));

  return useMemo(() => validateFloorRealtime(currentFloor, library), [currentFloor, library]);
}

/**
 * Hook to get validation severity for a specific element.
 * Used for highlighting walls/rooms/openings.
 */
export function useElementValidation(elementId: string | undefined) {
  const { currentFloor, library } = useFloorPlanStore((state) => ({
    currentFloor: state.currentFloor,
    library: state.library,
  }));

  return useMemo(() => {
    if (!elementId) return null;
    return getElementSeverity(elementId, currentFloor, library);
  }, [elementId, currentFloor, library]);
}
