import { describe, expect, it, beforeEach } from 'vitest';
import { useDesignStore } from '../designStore';
import type { FloorPlan } from '@/types/design';

function basePlan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: 'plan-1',
    name: 'Selection test',
    width: 10000,
    height: 10000,
    scale: 100,
    walls: [
      { id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 400, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
      { id: 'w2', startPoint: { x: 0, y: 400 }, endPoint: { x: 400, y: 400 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
    ],
    rooms: [{ id: 'r1', name: 'Room', vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 400 }, { x: 0, y: 400 }], area: 16 }],
    doors: [{ id: 'd1', wallId: 'w1', position: { x: 100, y: 0 }, width: 900, type: 'internal', swing: 'left' }],
    windows: [{ id: 'win1', wallId: 'w1', position: { x: 300, y: 0 }, width: 1200, height: 1200, sillHeight: 900 }],
    objects: [{ id: 'o1', assetId: 'stool', position: { x: 200, y: 200 }, rotation: 0, scale: 1 }],
    groups: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  useDesignStore.getState().setFloorPlan(basePlan());
  useDesignStore.getState().clearSelection();
});

describe('multi-selection', () => {
  it('selectAll selects every wall, room, door, window, and object', () => {
    useDesignStore.getState().selectAll();
    const ids = useDesignStore.getState().selectedElementIds;
    expect(ids.sort()).toEqual(['d1', 'o1', 'r1', 'w1', 'w2', 'win1'].sort());
  });

  it('toggleSelectionGroup adds then removes ids', () => {
    const store = useDesignStore.getState();
    store.toggleSelectionGroup(['w1']);
    expect(useDesignStore.getState().selectedElementIds).toEqual(['w1']);
    useDesignStore.getState().toggleSelectionGroup(['w2']);
    expect(useDesignStore.getState().selectedElementIds.sort()).toEqual(['w1', 'w2']);
    useDesignStore.getState().toggleSelectionGroup(['w1']);
    expect(useDesignStore.getState().selectedElementIds).toEqual(['w2']);
  });

  it('clearSelection empties the selection', () => {
    useDesignStore.getState().setSelection(['w1', 'w2']);
    useDesignStore.getState().clearSelection();
    expect(useDesignStore.getState().selectedElementIds).toEqual([]);
    expect(useDesignStore.getState().selectedElementId).toBeNull();
  });

  it('deleteSelection removes selected elements, their hosted openings, and stale groups', () => {
    useDesignStore.getState().groupElements(['w1', 'r1']);
    useDesignStore.getState().setSelection(['w1']);
    useDesignStore.getState().deleteSelection();
    const plan = useDesignStore.getState().floorPlan!;
    expect(plan.walls.map((w) => w.id)).toEqual(['w2']);
    expect(plan.doors).toEqual([]); // hosted on w1
    expect(plan.windows).toEqual([]); // hosted on w1
    expect(plan.groups).toEqual([]); // group referenced the deleted wall
    expect(useDesignStore.getState().selectedElementIds).toEqual([]);
  });

  it('duplicates a selected wall with its hosted openings and selects the copies', () => {
    useDesignStore.getState().setSelection(['w1']);
    useDesignStore.getState().duplicateSelection();
    const plan = useDesignStore.getState().floorPlan!;
    const duplicateWall = plan.walls.find((wall) => wall.id !== 'w1' && wall.id !== 'w2')!;
    const duplicateDoor = plan.doors.find((door) => door.id !== 'd1')!;
    const duplicateWindow = plan.windows.find((window) => window.id !== 'win1')!;

    expect(duplicateWall.startPoint).toEqual({ x: 200, y: 200 });
    expect(duplicateWall.endPoint).toEqual({ x: 600, y: 200 });
    expect(duplicateDoor.wallId).toBe(duplicateWall.id);
    expect(duplicateWindow.wallId).toBe(duplicateWall.id);
    expect(useDesignStore.getState().selectedElementIds).toEqual(expect.arrayContaining([duplicateWall.id, duplicateDoor.id, duplicateWindow.id]));
  });
});

describe('grouping', () => {
  it('groupElements creates a group and ungroupElements removes it', () => {
    useDesignStore.getState().groupElements(['w1', 'w2']);
    expect(useDesignStore.getState().floorPlan?.groups).toHaveLength(1);
    expect(useDesignStore.getState().floorPlan?.groups?.[0].memberIds.sort()).toEqual(['w1', 'w2']);

    useDesignStore.getState().ungroupElements(['w1']);
    expect(useDesignStore.getState().floorPlan?.groups).toEqual([]);
  });

  it('regrouping a member lifts it out of its previous group', () => {
    useDesignStore.getState().groupElements(['w1', 'w2']);
    useDesignStore.getState().groupElements(['w1', 'r1']);
    const groups = useDesignStore.getState().floorPlan?.groups ?? [];
    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds.sort()).toEqual(['r1', 'w1']);
  });
});

describe('translateElements', () => {
  it('shifts walls, rooms, and objects by the same delta, leaving others untouched', () => {
    useDesignStore.getState().translateElements(['w1', 'r1', 'o1'], 50, -25);
    const plan = useDesignStore.getState().floorPlan!;
    const w1 = plan.walls.find((w) => w.id === 'w1')!;
    const w2 = plan.walls.find((w) => w.id === 'w2')!;
    const r1 = plan.rooms[0];
    const o1 = plan.objects[0];

    expect(w1.startPoint).toEqual({ x: 50, y: -25 });
    expect(w1.endPoint).toEqual({ x: 450, y: -25 });
    expect(w2.startPoint).toEqual({ x: 0, y: 400 }); // untouched
    expect(r1.vertices[0]).toEqual({ x: 50, y: -25 });
    expect(o1.position).toEqual({ x: 250, y: 175 });
  });
});

describe('scaleElements', () => {
  it('scales wall geometry about the given pivot and rescales hosted door/window offsets, not their physical widths', () => {
    useDesignStore.getState().scaleElements(['w1'], 2, { x: 0, y: 0 });
    const plan = useDesignStore.getState().floorPlan!;
    const w1 = plan.walls.find((w) => w.id === 'w1')!;
    const d1 = plan.doors[0];
    const win1 = plan.windows[0];

    expect(w1.startPoint).toEqual({ x: 0, y: 0 });
    expect(w1.endPoint).toEqual({ x: 800, y: 0 }); // length doubled about pivot (0,0)
    expect(d1.position.x).toBe(200); // offset along wall doubled
    expect(win1.position.x).toBe(600);
    expect(d1.width).toBe(900); // physical mm width unchanged
    expect(win1.height).toBe(1200);
  });

  it('scales an object position and its uniform scale factor together', () => {
    useDesignStore.getState().scaleElements(['o1'], 1.5, { x: 0, y: 0 });
    const o1 = useDesignStore.getState().floorPlan!.objects[0];
    expect(o1.position).toEqual({ x: 300, y: 300 });
    expect(o1.scale).toBe(1.5);
  });

  it('does not rescale doors/windows on walls outside the scaled selection', () => {
    useDesignStore.getState().scaleElements(['w2'], 2, { x: 0, y: 0 });
    const plan = useDesignStore.getState().floorPlan!;
    expect(plan.doors[0].position.x).toBe(100); // hosted on w1, untouched
    expect(plan.windows[0].position.x).toBe(300);
  });
});

describe('hosted opening relationships', () => {
  it('keeps hosted openings at the same relative wall position after a wall resize', () => {
    useDesignStore.getState().updateWall('w1', { endPoint: { x: 800, y: 0 } });
    const plan = useDesignStore.getState().floorPlan!;
    expect(plan.doors[0].position.x).toBe(200);
    expect(plan.windows[0].position.x).toBe(600);
  });

  it('moves walls sharing an edited endpoint and preserves their hosted openings', () => {
    useDesignStore.getState().setFloorPlan(basePlan({
      walls: [
        { id: 'w1', startPoint: { x: 0, y: 0 }, endPoint: { x: 400, y: 0 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
        { id: 'w2', startPoint: { x: 400, y: 0 }, endPoint: { x: 400, y: 400 }, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700 },
      ],
      doors: [{ id: 'd2', wallId: 'w2', position: { x: 200, y: 0 }, width: 900, type: 'internal', swing: 'left' }],
      windows: [],
    }));

    useDesignStore.getState().updateWall('w1', { endPoint: { x: 600, y: 0 } });
    const plan = useDesignStore.getState().floorPlan!;
    const joinedWall = plan.walls.find((wall) => wall.id === 'w2')!;

    expect(joinedWall.startPoint).toEqual({ x: 600, y: 0 });
    expect(joinedWall.endPoint).toEqual({ x: 400, y: 400 });
    expect(plan.doors[0].position.x).toBeCloseTo(Math.hypot(-200, 400) / 2);
  });

  it('does not edit an element assigned to a locked layer', () => {
    useDesignStore.getState().setBuildingModel({
      layers: [
        { id: 'layer-model', name: 'Model', visible: true, locked: false, elementIds: [] },
        { id: 'layer-locked', name: 'Locked', visible: true, locked: true, elementIds: ['w1'] },
      ],
    });
    useDesignStore.getState().updateWall('w1', { thickness: 300 });
    expect(useDesignStore.getState().floorPlan!.walls.find((wall) => wall.id === 'w1')!.thickness).toBe(225);
  });
});
