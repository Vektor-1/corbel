export type MatchStatus = 'added' | 'removed' | 'moved' | 'resized' | 'unchanged';

export interface ElementMatch {
  originalId: string | null;
  redesignId: string | null;
  status: MatchStatus;
}

export interface MetricDelta {
  label: string;
  original: number;
  redesign: number;
  unit: string;
}

export type MetricDeltas = MetricDelta[] & {
  totalArea: number;
  totalWallLength: number;
  roomCount: number;
  doorCount: number;
  windowCount: number;
  perRoomArea: Array<{
    originalId: string | null;
    redesignId: string | null;
    delta: number;
  }>;
};

export interface RoomAreaDelta {
  name: string;
  originalArea: number | null;
  redesignArea: number | null;
}

export type RubricCriterion = 'spatialAdequacy' | 'circulationOpenings' | 'wallSuitability' | 'complianceCount';

export interface RubricResult {
  criterion: RubricCriterion;
  baselineValue: number;
  redesignValue: number;
  status: 'improved' | 'regressed' | 'neutral';
}

export interface ComparisonReport {
  walls: ElementMatch[];
  rooms: ElementMatch[];
  openings: ElementMatch[];
  metrics: MetricDeltas;
  rubric: RubricResult[];
  /** @deprecated Compatibility fields for the existing comparison panel. */
  roomAreas: RoomAreaDelta[];
  /** @deprecated Compatibility fields for the existing comparison panel. */
  counts: Record<MatchStatus, number>;
}
