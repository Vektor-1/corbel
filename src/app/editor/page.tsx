'use client';

import { EditorWithCanvas } from '@/components/editor/EditorWithCanvas';
import { validateFloorPlan } from '@/lib/standards/validation';
import { useDesignStore } from '@/store/designStore';
import { useEffect } from 'react';
import type { FloorPlan } from '@/types/design';

export default function EditorPage() {
  const { floorPlan, setFloorPlan, setValidationResults } = useDesignStore();

  useEffect(() => {
    if (!floorPlan) {
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
      return;
    }

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
    setValidationResults(validateFloorPlan(floorPlan));
  }, [floorPlan, setValidationResults]);

  return <EditorWithCanvas />;
}
