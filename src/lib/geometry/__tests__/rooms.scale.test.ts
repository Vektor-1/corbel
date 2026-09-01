import { describe, expect, it } from 'vitest';
import { deriveRoomsFromWalls } from '../rooms';
import type { Wall } from '@/types/design';

const walls: Wall[] = [
  [{ x: 0, y: 0 }, { x: 300, y: 0 }],
  [{ x: 300, y: 0 }, { x: 300, y: 300 }],
  [{ x: 300, y: 300 }, { x: 0, y: 300 }],
  [{ x: 0, y: 300 }, { x: 0, y: 0 }],
].map(([startPoint, endPoint], index) => ({
  id: `wall-${index}`, startPoint, endPoint, thickness: 225, material: 'sandcrete', type: 'loadBearing', height: 2700,
}));

describe('room derivation scale', () => {
  it('uses the calibrated pixels-per-metre value for room area', () => {
    expect(deriveRoomsFromWalls(walls, 100)[0]?.area).toBe(9);
    expect(deriveRoomsFromWalls(walls, 150)[0]?.area).toBe(4);
  });
});
