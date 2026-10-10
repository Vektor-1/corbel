import { describe, expect, it } from 'vitest';
import { isSuspiciousSnapshotWipe } from '../snapshotGuard';
import type { FloorPlan } from '@/types/design';

const plan = (count: number): FloorPlan => ({
  id: 'p', name: 'Plan', width: 1000, height: 1000, scale: 100,
  walls: Array.from({ length: count }, (_, index) => ({ id: 'w' + index, startPoint: { x: 0, y: index }, endPoint: { x: 100, y: index }, thickness: 225, material: 'sandcrete', type: 'partition', height: 2700 })),
  rooms: [], doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(),
});

describe('snapshot wipe guard', () => {
  it('blocks a populated plan being replaced by an empty transient state', () => {
    expect(isSuspiciousSnapshotWipe(plan(5), plan(0))).toBe(true);
  });

  it('allows normal edits and first saves', () => {
    expect(isSuspiciousSnapshotWipe(null, plan(0))).toBe(false);
    expect(isSuspiciousSnapshotWipe(plan(5), plan(4))).toBe(false);
  });
});
