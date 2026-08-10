import type { FloorPlan } from '@/types/design';
import type { RubricResult } from './types';

const result = (criterion: RubricResult['criterion'], baselineValue: number, redesignValue: number): RubricResult => ({ criterion, baselineValue, redesignValue, status: redesignValue > baselineValue ? 'improved' : redesignValue < baselineValue ? 'regressed' : 'neutral' });
const wallLength = (plan: FloorPlan) => plan.walls.reduce((sum, wall) => sum + Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y), 0);

export function evaluateRubric(original: FloorPlan, redesign: FloorPlan): RubricResult[] {
  const area = (plan: FloorPlan) => plan.rooms.reduce((sum, room) => sum + room.area, 0);
  const openings = (plan: FloorPlan) => plan.doors.length + plan.windows.length;
  const suitableWalls = (plan: FloorPlan) => plan.walls.filter((wall) => wall.type === 'loadBearing' && wall.height > 0 && wall.thickness > 0).length;
  const compliance = (plan: FloorPlan) => plan.rooms.filter((room) => room.area >= 0.5).length + plan.doors.filter((door) => door.width > 0).length + plan.windows.filter((window) => window.width > 0 && window.height > 0).length;
  return [result('spatialAdequacy', area(original), area(redesign)), result('circulationOpenings', openings(original), openings(redesign)), result('wallSuitability', suitableWalls(original) / Math.max(wallLength(original), 1), suitableWalls(redesign) / Math.max(wallLength(redesign), 1)), result('complianceCount', compliance(original), compliance(redesign))];
}
