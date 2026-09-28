'use client';

import { EditorWithCanvas } from '@/components/editor/EditorWithCanvas';
import { validateFloorPlan } from '@/lib/standards';
import { validateTraceFeedback } from '@/lib/standards/traceFeedback';
import { loadDesignSnapshot, saveDesignSnapshot } from '@/lib/persistence/designSnapshot';
import { useDesignStore } from '@/store/designStore';
import { useEffect, useRef } from 'react';
import { initBrowserSDK } from '@/lib/api/browser-sdk';
import { recordEditorMetric } from '@/lib/observability/editorMetrics';
import { isSuspiciousSnapshotWipe } from '@/lib/persistence/snapshotGuard';
import type { FloorPlan } from '@/types/design';

export default function EditorPage() {
  const { floorPlan, ghostFloorPlan, ghostOpacity, traceImage, setFloorPlan, setGhostFloorPlan, setGhostOpacity, setTraceImage, beginImageTrace, setValidationResults } = useDesignStore();
  const initialized = useRef(false);
  const lastSavedPlan = useRef<FloorPlan | null>(null);

  useEffect(() => {
    initBrowserSDK();
    recordEditorMetric('editor.initialized');
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (!floorPlan) {
      const studyStimulus = new URLSearchParams(window.location.search).get('studyStimulus');
      const stimulus = studyStimulus === 'A'
        ? { url: '/study-stimuli/corbel-study-plan-a.svg', name: 'Corbel study plan A.svg' }
        : studyStimulus === 'B'
          ? { url: '/study-stimuli/corbel-study-plan-b.svg', name: 'Corbel study plan B.svg' }
          : null;
      if (stimulus) {
        beginImageTrace(stimulus.url, stimulus.name);
        return;
      }
      try {
        const snapshot = loadDesignSnapshot(window.localStorage);
        if (snapshot) {
          setFloorPlan(snapshot.floorPlan);
          setGhostFloorPlan(snapshot.ghostFloorPlan);
          setGhostOpacity(snapshot.ghostOpacity);
          setTraceImage(snapshot.traceImage);
          recordEditorMetric('editor.snapshot.loaded', {
            walls: snapshot.floorPlan.walls.length,
            rooms: snapshot.floorPlan.rooms.length,
            openings: snapshot.floorPlan.doors.length + snapshot.floorPlan.windows.length,
          });
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
  }, [beginImageTrace, floorPlan, setFloorPlan, setGhostFloorPlan, setGhostOpacity, setTraceImage]);

  useEffect(() => {
    if (!floorPlan) return;
    const needsMigration =
      !Array.isArray(floorPlan.objects) ||
      !Array.isArray(floorPlan.rooms) ||
      !Array.isArray(floorPlan.groups) ||
      floorPlan.doors.some((door) => !door.swing) ||
      floorPlan.windows.some((window) => typeof window.sillHeight !== 'number');

    if (needsMigration) {
      setFloorPlan({
        ...floorPlan,
        objects: Array.isArray(floorPlan.objects) ? floorPlan.objects : [],
        rooms: Array.isArray(floorPlan.rooms) ? floorPlan.rooms : [],
        groups: Array.isArray(floorPlan.groups) ? floorPlan.groups : [],
        doors: floorPlan.doors.map((door) => ({ ...door, swing: door.swing ?? 'left' })),
        windows: floorPlan.windows.map((window) => ({
          ...window,
          sillHeight: typeof window.sillHeight === 'number' ? window.sillHeight : 900,
        })),
      });
    }
  }, [floorPlan, setFloorPlan]);

  useEffect(() => {
    const startedAt = performance.now();
    const results = [
      ...validateFloorPlan(floorPlan),
      ...validateTraceFeedback(floorPlan, traceImage?.calibration, traceImage !== null),
    ];
    setValidationResults(results);
    recordEditorMetric('editor.validation.completed', {
      results: results.length,
      walls: floorPlan?.walls.length ?? 0,
    }, performance.now() - startedAt);
  }, [floorPlan, traceImage?.calibration, setValidationResults]);

  useEffect(() => {
    if (!initialized.current || !floorPlan) return;
    if (isSuspiciousSnapshotWipe(lastSavedPlan.current, floorPlan)) {
      recordEditorMetric('editor.snapshot.failed', { reason: 'suspicious-wipe' });
      return;
    }
    const timeout = window.setTimeout(() => {
      try {
        saveDesignSnapshot(window.localStorage, floorPlan, ghostFloorPlan, ghostOpacity, traceImage);
        lastSavedPlan.current = floorPlan;
        recordEditorMetric('editor.snapshot.saved', { walls: floorPlan.walls.length });
      } catch {
        recordEditorMetric('editor.snapshot.failed');
      }
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [floorPlan, ghostFloorPlan, ghostOpacity, traceImage]);

  return <EditorWithCanvas />;
}
