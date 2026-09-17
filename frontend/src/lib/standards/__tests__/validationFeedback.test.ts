import { describe, expect, it } from 'vitest';
import {
  validateOpeningSize,
  validateRoomLayout,
  validateSpanThickness,
  validateWallThickness,
  validateFloorPlan,
} from '../validation';

describe('student-facing validation feedback', () => {
  it('pairs a wall thickness finding with an actionable correction', () => {
    const result = validateWallThickness('wall-1', 'sandcrete', 100, true, 1);

    expect(result?.type).toBe('error');
    expect(result?.remediation).toContain('150mm');
  });

  it('explains the threshold and next step for review warnings', () => {
    const span = validateSpanThickness('wall-1', 100, 3200);
    const opening = validateOpeningSize('door-1', 2100);
    const room = validateRoomLayout('room-1', 8, 'bedroom');

    expect(span?.message).toContain('30:1 review threshold');
    expect(span?.remediation).toBeTruthy();
    expect(opening?.remediation).toContain('structural support');
    expect(room?.remediation).toContain('9m²');
  });

  it('uses a selected room type for area guidance instead of relying on the room name', () => {
    const results = validateFloorPlan({
      id: 'typed-room', name: 'Typed room', width: 12000, height: 9000, scale: 100,
      walls: [], doors: [], windows: [], objects: [], createdAt: new Date(), updatedAt: new Date(),
      rooms: [{ id: 'room-1', name: 'My quiet corner', type: 'bedroom', vertices: [], area: 8 }],
    });

    expect(results).toContainEqual(expect.objectContaining({ rule: 'room-area-small', targetId: 'room-1' }));
  });
});
