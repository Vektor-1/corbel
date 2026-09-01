'use client';

import { EditorWithCanvas } from '@/components/editor/EditorWithCanvas';
import { validateFloorPlan } from '@/lib/standards/validation';
import { validateTraceFeedback } from '@/lib/standards/traceFeedback';
import { loadDesignSnapshot, saveDesignSnapshot } from '@/lib/persistence/designSnapshot';
import { useDesignStore } from '@/store/designStore';
import { useEffect, useRef } from 'react';
import type { FloorPlan } from '@/types/design';

export default function EditorPage() {
  const { floorPlan, ghostFloorPlan, ghostOpacity, traceImage, setFloorPlan, setGhostFloorPlan, setGhostOpacity, setTraceImage, setValidationResults } = useDesignStore();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!floorPlan) {
      try {
        const snapshot = loadDesignSnapshot(window.localStorage);
        if (snapshot) {
          setFloorPlan(snapshot.floorPlan);
          setGhostFloorPlan(snapshot.ghostFloorPlan);
          setGhostOpacity(snapshot.ghostOpacity);
          setTraceImage(snapshot.traceImage);
          return;
        }
      } catch {
        // The editor remains usable when browser storage is unavailable.
      }

      const newPlan: FloorPlan = {
        id: `plan-${Date.now()}`,
        name: 'Courtyard Study',
        width: 12000,
        height: 9000,
        scale: 1,
        walls: [],
        rooms: [],
        doors: [],
        windows: [],
        objects: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setFloorPlan(newPlan);
    }
  }, [floorPlan, setFloorPlan, setGhostFloorPlan, setGhostOpacity, setTraceImage]);

  useEffect(() => {
    if (!floorPlan) return;
    const needsMigration =
      !Array.isArray(floorPlan.objects) ||
      !Array.isArray(floorPlan.rooms) ||
      floorPlan.doors.some((door) => !door.swing) ||
      floorPlan.windows.some((window) => typeof window.sillHeight !== 'number');

    if (needsMigration) {
      setFloorPlan({
        ...floorPlan,
        objects: Array.isArray(floorPlan.objects) ? floorPlan.objects : [],
        rooms: Array.isArray(floorPlan.rooms) ? floorPlan.rooms : [],
        doors: floorPlan.doors.map((door) => ({ ...door, swing: door.swing ?? 'left' })),
        windows: floorPlan.windows.map((window) => ({
          ...window,
          sillHeight: typeof window.sillHeight === 'number' ? window.sillHeight : 900,
        })),
      });
    }
  }, [floorPlan, setFloorPlan]);

  useEffect(() => {
    setValidationResults([
      ...validateFloorPlan(floorPlan),
      ...validateTraceFeedback(floorPlan, traceImage?.calibration),
    ]);
  }, [floorPlan, traceImage?.calibration, setValidationResults]);

  useEffect(() => {
    if (!initialized.current || !floorPlan) return;
    try {
      saveDesignSnapshot(window.localStorage, floorPlan, ghostFloorPlan, ghostOpacity, traceImage);
    } catch {
      // Quota/private-mode errors should not interrupt design work.
    }
  }, [floorPlan, ghostFloorPlan, ghostOpacity, traceImage]);

  return <EditorWithCanvas />;
}
