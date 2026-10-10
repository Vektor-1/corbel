import type { BuildingModel, FloorPlan, PlanLayer, Wall } from '@/types/design';

export const MODEL_LAYER_ID = 'layer-model';

export function defaultBuildingModel(): BuildingModel {
  return {
    stories: [{ id: 'story-ground', name: 'Ground floor', elevation: 0, height: 3000 }],
    activeStoryId: 'story-ground',
    grids: [],
    layers: [{ id: MODEL_LAYER_ID, name: 'Model', visible: true, locked: false, elementIds: [] }],
    namedViews: [],
    sections: [],
    constraints: [],
    dimensions: [],
    sheets: [{ id: 'sheet-01', name: 'Ground floor plan', size: 'A3', scaleLabel: '1:100' }],
  };
}

export function buildingModelFor(plan: FloorPlan | null): BuildingModel {
  const defaults = defaultBuildingModel();
  const building = plan?.building;
  if (!building) return defaults;
  const layers = building.layers.length > 0 ? building.layers : defaults.layers;
  const stories = building.stories.length > 0 ? building.stories : defaults.stories;
  return {
    ...defaults,
    ...building,
    layers,
    stories,
    grids: Array.isArray(building.grids) ? building.grids : defaults.grids,
    namedViews: Array.isArray(building.namedViews) ? building.namedViews : defaults.namedViews,
    sections: Array.isArray(building.sections) ? building.sections : defaults.sections,
    constraints: Array.isArray(building.constraints) ? building.constraints : defaults.constraints,
    dimensions: Array.isArray(building.dimensions) ? building.dimensions : defaults.dimensions,
    sheets: Array.isArray(building.sheets) && building.sheets.length > 0 ? building.sheets : defaults.sheets,
    activeStoryId: stories.some((story) => story.id === building.activeStoryId) ? building.activeStoryId : stories[0].id,
  };
}

export function layerForElement(plan: FloorPlan | null, elementId: string): PlanLayer {
  const building = buildingModelFor(plan);
  return building.layers.find((layer) => layer.elementIds.includes(elementId)) ?? building.layers[0];
}

export function isElementVisible(plan: FloorPlan | null, elementId: string): boolean {
  return layerForElement(plan, elementId).visible;
}

export function isElementLocked(plan: FloorPlan | null, elementId: string): boolean {
  return layerForElement(plan, elementId).locked;
}

/** Applies a saved directional constraint while preserving the constrained wall's start point and length. */
export function enforceWallConstraint(plan: FloorPlan, wallId: string, wall: Wall): Wall {
  const constraint = buildingModelFor(plan).constraints.find((candidate) => candidate.wallId === wallId);
  if (!constraint) return wall;
  const reference = plan.walls.find((candidate) => candidate.id === constraint.referenceWallId);
  if (!reference) return wall;
  const referenceDx = reference.endPoint.x - reference.startPoint.x;
  const referenceDy = reference.endPoint.y - reference.startPoint.y;
  const referenceLength = Math.hypot(referenceDx, referenceDy);
  const length = Math.hypot(wall.endPoint.x - wall.startPoint.x, wall.endPoint.y - wall.startPoint.y);
  if (referenceLength === 0 || length === 0) return wall;
  const direction = constraint.kind === 'parallel'
    ? { x: referenceDx / referenceLength, y: referenceDy / referenceLength }
    : { x: -referenceDy / referenceLength, y: referenceDx / referenceLength };
  const originalDx = wall.endPoint.x - wall.startPoint.x;
  const originalDy = wall.endPoint.y - wall.startPoint.y;
  const sign = originalDx * direction.x + originalDy * direction.y < 0 ? -1 : 1;
  return { ...wall, endPoint: { x: wall.startPoint.x + direction.x * length * sign, y: wall.startPoint.y + direction.y * length * sign } };
}
