import { describe, expect, it } from 'vitest';
import { useDesignStore } from '../designStore';
import type { FloorPlan } from '@/types/design';

const importedPlan = (): FloorPlan => ({
  id: 'imported-plan', name: 'Imported plan', width: 6000, height: 4000, scale: 100,
  walls: [{
    id: 'wall-1', startPoint: { x: 0, y: 0 }, endPoint: { x: 400, y: 0 }, thickness: 225,
    material: 'sandcrete', type: 'loadBearing', height: 2700, confidence: 0.61, source: 'ai',
  }],
  rooms: [], doors: [], windows: [], objects: [], createdAt: new Date('2026-08-30'), updatedAt: new Date('2026-08-30'),
});

describe('beginImportedEdit', () => {
  it('keeps an immutable imported baseline while giving the editor a separate working copy', () => {
    useDesignStore.getState().beginImportedEdit(importedPlan());
    const started = useDesignStore.getState();

    expect(started.floorPlan?.id).toBe('edit-imported-plan');
    expect(started.floorPlan?.walls[0].source).toBe('ai');
    expect(started.ghostFloorPlan?.id).toBe('imported-plan');
    expect(started.ghostOpacity).toBe(0.18);

    useDesignStore.getState().updateWall('wall-1', { thickness: 300, source: 'user', confidence: 1 });
    const edited = useDesignStore.getState();
    expect(edited.floorPlan?.walls[0].thickness).toBe(300);
    expect(edited.ghostFloorPlan?.walls[0].thickness).toBe(225);
    expect(edited.ghostFloorPlan?.walls[0].source).toBe('ai');
  });

  it('restores the editable plan from the imported baseline without discarding that baseline', () => {
    useDesignStore.getState().beginImportedEdit(importedPlan());
    useDesignStore.getState().updateWall('wall-1', { thickness: 300 });

    useDesignStore.getState().restoreGhostBaseline();
    const restored = useDesignStore.getState();
    expect(restored.floorPlan?.id).toBe('edit-imported-plan');
    expect(restored.floorPlan?.walls[0].thickness).toBe(225);
    expect(restored.ghostFloorPlan?.walls[0].thickness).toBe(225);
  });
});
