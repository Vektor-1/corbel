import { strict as assert } from 'node:assert';
import { test } from 'vitest';

import { compareFloorPlans } from '../index';
import type { FloorPlan, Point, Room, Wall } from '@/types/design';

const point = (x: number, y: number): Point => ({ x, y });

const wall = (id: string, startPoint: Point, endPoint: Point): Wall => ({
  id,
  startPoint,
  endPoint,
  thickness: 150,
  material: 'sandcrete',
  type: 'partition',
  height: 2700,
});

const room = (id: string, name: string, vertices: Point[], area: number): Room => ({ id, name, vertices, area });

const plan = (overrides: Partial<FloorPlan> = {}): FloorPlan => ({
  id: 'plan',
  name: 'Plan',
  width: 10000,
  height: 10000,
  scale: 100,
  walls: [wall('wall-1', point(0, 0), point(400, 0))],
  rooms: [room('room-1', 'Living', [point(0, 0), point(400, 0), point(400, 300), point(0, 300)], 12)],
  doors: [],
  windows: [],
  objects: [],
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});

test('reports identical plans as unchanged with zero metric deltas', () => {
  const report = compareFloorPlans(plan(), plan({ id: 'redesign' }));

  assert.deepEqual(report.walls, [{ originalId: 'wall-1', redesignId: 'wall-1', status: 'unchanged' }]);
  assert.deepEqual(report.rooms, [{ originalId: 'room-1', redesignId: 'room-1', status: 'unchanged' }]);
  assert.equal(report.metrics.totalArea, 0);
  assert.equal(report.metrics.totalWallLength, 0);
  assert.equal(report.metrics.roomCount, 0);
});

test('classifies a parallel wall translation as moved', () => {
  const report = compareFloorPlans(plan(), plan({ walls: [wall('wall-2', point(0, 20), point(400, 20))] }));

  assert.deepEqual(report.walls, [{ originalId: 'wall-1', redesignId: 'wall-2', status: 'moved' }]);
});

test('globally matches nearby parallel walls instead of falsely removing one', () => {
  const original = plan({
    walls: [
      wall('original-a', point(0, 0), point(400, 0)),
      wall('original-b', point(45, 0), point(445, 0)),
    ],
  });
  const redesign = plan({
    walls: [
      wall('redesign-a', point(10, 0), point(410, 0)),
      wall('redesign-b', point(-40, 0), point(360, 0)),
    ],
  });

  const report = compareFloorPlans(original, redesign);

  assert.deepEqual(report.walls, [
    { originalId: 'original-a', redesignId: 'redesign-b', status: 'moved' },
    { originalId: 'original-b', redesignId: 'redesign-a', status: 'moved' },
  ]);
});

test('reports a newly introduced room as added', () => {
  const report = compareFloorPlans(
    plan(),
    plan({ rooms: [
      room('room-1', 'Living', [point(0, 0), point(400, 0), point(400, 300), point(0, 300)], 12),
      room('room-2', 'Study', [point(500, 0), point(700, 0), point(700, 200), point(500, 200)], 4),
    ] })
  );

  assert.deepEqual(report.rooms.find((match) => match.redesignId === 'room-2'), {
    originalId: null,
    redesignId: 'room-2',
    status: 'added',
  });
  assert.equal(report.metrics.roomCount, 1);
});

test('reports an omitted room as removed', () => {
  const report = compareFloorPlans(plan(), plan({ rooms: [] }));

  assert.deepEqual(report.rooms, [{ originalId: 'room-1', redesignId: null, status: 'removed' }]);
  assert.equal(report.metrics.roomCount, -1);
});
