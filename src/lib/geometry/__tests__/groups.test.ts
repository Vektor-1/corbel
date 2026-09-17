import { describe, expect, it } from 'vitest';
import { expandGroupSelection, getAllSelectableIds, getGroupMemberIds } from '../groups';
import type { FloorPlan } from '@/types/design';

function plan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: 'p1', name: 'test', width: 1000, height: 1000, scale: 100,
    walls: [{ id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 100, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 }],
    rooms: [{ id: 'r1', name: 'R', vertices: [], area: 0 }],
    doors: [], windows: [],
    objects: [{ id: 'o1', assetId: 'stool', position: { x: 0, y: 0 }, rotation: 0, scale: 1 }],
    groups: [],
    createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

describe('getAllSelectableIds', () => {
  it('lists ids across every element kind', () => {
    expect(getAllSelectableIds(plan()).sort()).toEqual(['o1', 'r1', 'w1'].sort());
  });

  it('returns an empty array for a null plan', () => {
    expect(getAllSelectableIds(null)).toEqual([]);
  });
});

describe('getGroupMemberIds / expandGroupSelection', () => {
  it('returns just the id when it is not grouped', () => {
    expect(getGroupMemberIds(plan(), 'w1')).toEqual(['w1']);
  });

  it('returns every member of the containing group', () => {
    const grouped = plan({ groups: [{ id: 'g1', memberIds: ['w1', 'r1'] }] });
    expect(getGroupMemberIds(grouped, 'w1').sort()).toEqual(['r1', 'w1']);
    expect(getGroupMemberIds(grouped, 'o1')).toEqual(['o1']); // ungrouped
  });

  it('expands a mixed selection to include every touched group in full', () => {
    const grouped = plan({ groups: [{ id: 'g1', memberIds: ['w1', 'r1'] }] });
    expect(expandGroupSelection(grouped, ['w1', 'o1']).sort()).toEqual(['o1', 'r1', 'w1'].sort());
  });
});
