import { MM_PER_PX } from '@/lib/geometry/wall-joints';
import type { FloorPlan, Wall } from '@/types/design';
import type { ElementMatch, MetricDelta, MetricDeltas } from './types';

const wallLength = (wall: Wall) => Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y) * MM_PER_PX / 1000;
const totalArea = (plan: FloorPlan) => plan.rooms.reduce((sum, room) => sum + room.area, 0);

export function computeMetricDeltas(original: FloorPlan, redesign: FloorPlan, roomMatches: ElementMatch[]): MetricDeltas {
  const originalRooms = new Map(original.rooms.map((room) => [room.id, room]));
  const redesignRooms = new Map(redesign.rooms.map((room) => [room.id, room]));
  const totalAreaDelta = totalArea(redesign) - totalArea(original);
  const totalWallLengthDelta = redesign.walls.reduce((sum, wall) => sum + wallLength(wall), 0) - original.walls.reduce((sum, wall) => sum + wallLength(wall), 0);
  const roomCountDelta = redesign.rooms.length - original.rooms.length;
  const doorCountDelta = redesign.doors.length - original.doors.length;
  const windowCountDelta = redesign.windows.length - original.windows.length;
  const metrics: MetricDelta[] = [
    { label: 'Total floor area', original: totalArea(original), redesign: totalArea(redesign), unit: 'm²' },
    { label: 'Wall length', original: original.walls.reduce((sum, wall) => sum + wallLength(wall), 0), redesign: redesign.walls.reduce((sum, wall) => sum + wallLength(wall), 0), unit: 'm' },
    { label: 'Rooms', original: original.rooms.length, redesign: redesign.rooms.length, unit: '' },
    { label: 'Doors', original: original.doors.length, redesign: redesign.doors.length, unit: '' },
    { label: 'Windows', original: original.windows.length, redesign: redesign.windows.length, unit: '' },
  ];
  return Object.assign(metrics, {
    totalArea: totalAreaDelta,
    totalWallLength: totalWallLengthDelta,
    roomCount: roomCountDelta,
    doorCount: doorCountDelta,
    windowCount: windowCountDelta,
    perRoomArea: roomMatches.map((match) => ({ originalId: match.originalId, redesignId: match.redesignId, delta: (match.redesignId ? redesignRooms.get(match.redesignId)?.area ?? 0 : 0) - (match.originalId ? originalRooms.get(match.originalId)?.area ?? 0 : 0) })),
  }) as MetricDeltas;
}
