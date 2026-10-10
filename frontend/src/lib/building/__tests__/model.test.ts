import { describe, expect, it } from 'vitest';
import { buildingModelFor, enforceWallConstraint, isElementLocked, isElementVisible, MODEL_LAYER_ID } from '../model';
import type { FloorPlan } from '@/types/design';

const plan = (building?: FloorPlan['building']): FloorPlan => ({
  id: 'plan', name: 'Plan', width: 10000, height: 8000, scale: 100,
  walls: [], rooms: [], doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(), building,
});

describe('building document model', () => {
  it('provides a compatible model layer and ground story for legacy plans', () => {
    const model = buildingModelFor(plan());
    expect(model.stories[0].name).toBe('Ground floor');
    expect(model.layers[0].id).toBe(MODEL_LAYER_ID);
    expect(isElementVisible(plan(), 'legacy-wall')).toBe(true);
  });

  it('uses layer visibility and locks for assigned elements', () => {
    const building = buildingModelFor(plan());
    building.layers.push({ id: 'layer-review', name: 'Review', visible: false, locked: true, elementIds: ['w1'] });
    const layeredPlan = plan(building);
    expect(isElementVisible(layeredPlan, 'w1')).toBe(false);
    expect(isElementLocked(layeredPlan, 'w1')).toBe(true);
    expect(isElementVisible(layeredPlan, 'other')).toBe(true);
  });

  it('reapplies a saved parallel constraint while retaining the wall length', () => {
    const constrained = plan(buildingModelFor(plan()));
    constrained.walls = [
      { id: 'reference', startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 400 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
      { id: 'target', startPoint: { x: 100, y: 100 }, endPoint: { x: 400, y: 100 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
    ];
    constrained.building!.constraints = [{ id: 'parallel', kind: 'parallel', wallId: 'target', referenceWallId: 'reference' }];
    const result = enforceWallConstraint(constrained, 'target', { ...constrained.walls[1], endPoint: { x: 500, y: 300 } });
    expect(result.endPoint.x).toBeCloseTo(100);
    expect(Math.hypot(result.endPoint.x - result.startPoint.x, result.endPoint.y - result.startPoint.y)).toBeCloseTo(Math.hypot(400, 200));
  });
});
