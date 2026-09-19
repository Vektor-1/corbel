import { describe, expect, it } from 'vitest';
import { canPlaceDoor, canPlaceObjectInRoom, canPlaceWindow } from '../placement-constraints';
import type { Door, Room, Wall, Window } from '@/types/design';

function wall(overrides: Partial<Wall> = {}): Wall {
  return {
    id: 'w1',
    startPoint: { x: 0, y: 0 },
    endPoint: { x: 4000, y: 0 }, // 4000mm long
    thickness: 225,
    material: 'sandcrete',
    type: 'loadBearing',
    height: 2700,
    ...overrides,
  };
}

const door = (overrides: Partial<Door> = {}): Door => ({
  id: 'd1',
  wallId: 'w1',
  position: { x: 2000, y: 0 },
  width: 900,
  type: 'internal',
  swing: 'left',
  ...overrides,
});

const win = (overrides: Partial<Window> = {}): Window => ({
  id: 'win1',
  wallId: 'w1',
  position: { x: 2000, y: 0 },
  width: 900,
  height: 1200,
  sillHeight: 900,
  ...overrides,
});

describe('canPlaceDoor', () => {
  it('allows a well-clear door in the middle of a long wall', () => {
    expect(canPlaceDoor(wall(), 2000, 900, [], [])).toEqual([]);
  });

  it('rejects a door wider than its host wall, and stops there', () => {
    const violations = canPlaceDoor(wall({ endPoint: { x: 500, y: 0 } }), 250, 900, [], []);
    expect(violations).toHaveLength(1);
    expect(violations[0].rule).toBe('Geometry');
    expect(violations[0].severity).toBe('error');
  });

  it('rejects a door too close to the wall start', () => {
    const violations = canPlaceDoor(wall(), 200, 900, [], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: 'Opening-placement heuristic', severity: 'error' })
    );
  });

  it('rejects a door too close to the wall end', () => {
    const violations = canPlaceDoor(wall(), 3800, 900, [], []);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('accepts a door placed exactly at the minimum edge distance', () => {
    // 300mm clearance, half-width 450mm -> position must be >= 750mm from start.
    const violations = canPlaceDoor(wall(), 750, 900, [], []);
    expect(violations).toEqual([]);
  });

  it('rejects a door that overlaps an existing door on the same wall', () => {
    const violations = canPlaceDoor(wall(), 2000, 900, [door({ position: { x: 2000, y: 0 } })], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('adjacent opening') })
    );
  });

  it('rejects a door placed too close to (but not overlapping) an existing door', () => {
    // Existing door spans 1550-2450; a new 900mm door centred at 3100 spans
    // 2650-3550 -- a 200mm gap, exactly at the separation threshold's edge.
    const violations = canPlaceDoor(wall(), 3040, 900, [door({ position: { x: 2000, y: 0 } })], []);
    expect(violations.length).toBeGreaterThan(0);
  });

  it('accepts a door with adequate separation from an existing door', () => {
    // Existing door spans 1550-2450. A door at 3150 spans 2700-3600: 250mm clear
    // of the existing door, and within the 300mm corner clearance on both ends.
    const violations = canPlaceDoor(wall(), 3150, 900, [door({ position: { x: 2000, y: 0 } })], []);
    expect(violations).toEqual([]);
  });

  it('ignores doors on a different wall entirely', () => {
    const otherWallDoor = door({ wallId: 'somewhere-else', position: { x: 2000, y: 0 } });
    expect(canPlaceDoor(wall(), 2000, 900, [otherWallDoor], [])).toEqual([]);
  });

  it('also checks separation against existing windows on the same wall', () => {
    const violations = canPlaceDoor(wall(), 2000, 900, [], [win({ position: { x: 2000, y: 0 } })]);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('adjacent opening') })
    );
  });

  it('can report more than one violation at once', () => {
    // Too close to the start AND overlapping an existing door.
    const violations = canPlaceDoor(wall(), 250, 900, [door({ position: { x: 250, y: 0 } })], []);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('canPlaceWindow', () => {
  it('allows a well-formed window in the middle of a long wall', () => {
    expect(canPlaceWindow(wall(), 2000, 900, 1200, 900, 2700, [], [])).toEqual([]);
  });

  it('rejects a window wider than its host wall', () => {
    const violations = canPlaceWindow(wall({ endPoint: { x: 500, y: 0 } }), 250, 900, 1200, 900, 2700, [], []);
    expect(violations).toEqual([
      expect.objectContaining({ rule: 'Geometry' }),
    ]);
  });

  it('rejects a window whose head height exceeds the wall height', () => {
    // sill 900 + height 1200 = head at 2100, wall is only 2000 tall.
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 900, 2000, [], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('head height') })
    );
  });

  it('warns when the sill sits below the recommended minimum', () => {
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 400, 2700, [], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('minimum') })
    );
  });

  it('warns when the sill sits above the typical maximum', () => {
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 1800, 2700, [], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('maximum') })
    );
  });

  it('accepts a sill at exactly the recommended minimum', () => {
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 600, 2700, [], []);
    expect(violations.some((v) => v.message.includes('minimum'))).toBe(false);
  });

  it('rejects a window too close to a wall corner', () => {
    const violations = canPlaceWindow(wall(), 200, 900, 1200, 900, 2700, [], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('wall corner') })
    );
  });

  it('rejects a window overlapping an existing window', () => {
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 900, 2700, [], [win()]);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('adjacent opening') })
    );
  });

  it('rejects a window overlapping an existing door', () => {
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 900, 2700, [door()], []);
    expect(violations).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('adjacent opening') })
    );
  });

  it('returns only the Geometry violation when the wall is too narrow, without evaluating other rules', () => {
    const violations = canPlaceWindow(
      wall({ endPoint: { x: 500, y: 0 } }),
      100,
      900,
      1200,
      300,
      2700,
      [],
      []
    );
    expect(violations).toEqual([expect.objectContaining({ rule: 'Geometry' })]);
  });

  it('does not early-return after the vertical-fit check, unlike the width check', () => {
    // Head height exceeds wall height AND sill is below minimum -- both should surface.
    const violations = canPlaceWindow(wall(), 2000, 900, 1200, 400, 1000, [], []);
    expect(violations.length).toBeGreaterThanOrEqual(2);
  });
});

describe('canPlaceObjectInRoom', () => {
  const room: Room = { id: 'r1', name: 'Room', vertices: [], area: 12 };

  it('currently accepts any placement, since room-boundary checking is not wired up', () => {
    // Documents the module's own TODO: point-in-polygon is not implemented yet, so
    // this always returns no violations. A future fix should update this test.
    expect(canPlaceObjectInRoom(room, { x: 0, y: 0 }, [500, 500, 500])).toEqual([]);
    expect(canPlaceObjectInRoom(room, { x: 99999, y: 99999 }, [500, 500, 500])).toEqual([]);
  });
});
