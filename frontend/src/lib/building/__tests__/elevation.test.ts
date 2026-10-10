import { describe, expect, it } from 'vitest';
import { generateElevation } from '../elevation';
import type { FloorPlan } from '@/types/design';

it('generates an elevation profile from walls crossing a section line', () => {
  const plan: FloorPlan = {
    id: 'plan', name: 'Plan', width: 10000, height: 8000, scale: 100, rooms: [], objects: [], windows: [], groups: [],
    walls: [{ id: 'w1', startPoint: { x: 0, y: -100 }, endPoint: { x: 0, y: 100 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 3000 }],
    doors: [{ id: 'd1', wallId: 'w1', position: { x: 10, y: 0 }, width: 900, type: 'internal', swing: 'left' }], createdAt: new Date(), updatedAt: new Date(),
  };
  const elevation = generateElevation(plan, { id: 'section-a', label: 'Section A', startPoint: { x: -200, y: 0 }, endPoint: { x: 200, y: 0 } });
  expect(elevation.length).toBe(400);
  expect(elevation.walls).toEqual([{ wallId: 'w1', distance: 200, width: 225, height: 3000, openingCount: 1 }]);
});
