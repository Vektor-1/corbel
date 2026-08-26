'use client';

import { useMemo } from 'react';
import { Canonical } from '@/types/schema';
import { compareCanonicalFloors } from '@/lib/comparison/canonical';
import { AlertCircle, TrendingUp, Award } from 'lucide-react';

interface FeedbackScoreProps {
  baseline: Canonical.Floor | null;
  redesign: Canonical.Floor | null;
}

interface ScoreDimension {
  id: string;
  label: string;
  weight: number;
  score: number; // 0-2
}

export function FeedbackScore({ baseline, redesign }: FeedbackScoreProps) {
  const { score, dimensions } = useMemo(() => {
    if (!baseline || !redesign) return { score: 0, dimensions: [] };

    const diff = compareCanonicalFloors(baseline, redesign);

    // Rule-based scoring
    const dimensions: ScoreDimension[] = [
      {
        id: 'area',
        label: 'Total Area',
        weight: 0.2,
        score: scoreAreaChange(diff.metrics),
      },
      {
        id: 'rooms',
        label: 'Room Count',
        weight: 0.15,
        score: scoreRoomCount(diff.metrics),
      },
      {
        id: 'iteration',
        label: 'Design Iteration',
        weight: 0.3,
        score: scoreIteration(diff.walls, diff.rooms),
      },
      {
        id: 'connectivity',
        label: 'Wall Connectivity',
        weight: 0.2,
        score: scoreConnectivity(redesign),
      },
      {
        id: 'compliance',
        label: 'Compliance',
        weight: 0.15,
        score: scoreCompliance(redesign),
      },
    ];

    const weightedScore = dimensions.reduce((sum, d) => sum + (d.score / 2) * d.weight * 100, 0);

    return { score: Math.round(weightedScore), dimensions };
  }, [baseline, redesign]);

  if (!baseline || !redesign) {
    return <div className="text-xs text-slate-400">Load both floors to see score</div>;
  }

  return (
    <div className="space-y-4">
      {/* Overall Score */}
      <div className="p-4 rounded-lg bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-indigo-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-200">Design Score</h3>
          <Award className="w-5 h-5 text-indigo-400" />
        </div>
        <div className="text-4xl font-bold text-indigo-300 mb-2">{score}</div>
        <div className="text-xs text-slate-400">out of 100</div>
      </div>

      {/* Dimension Breakdown */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-300">Criteria</h4>
        {dimensions.map((dim) => (
          <DimensionBar key={dim.id} dimension={dim} />
        ))}
      </div>

      {/* Feedback */}
      <div className="border-t border-slate-700 pt-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-2 flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Suggestions
        </h4>
        <div className="space-y-2 text-xs text-slate-400">
          {score < 50 && (
            <div className="flex gap-2">
              <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0 mt-0.5" />
              <span>Consider major redesign: score below 50</span>
            </div>
          )}
          {score >= 50 && score < 75 && (
            <div className="flex gap-2">
              <AlertCircle className="w-3 h-3 text-amber-400 flex-shrink-0 mt-0.5" />
              <span>Room for improvement in several areas</span>
            </div>
          )}
          {score >= 75 && (
            <div className="flex gap-2">
              <Award className="w-3 h-3 text-green-400 flex-shrink-0 mt-0.5" />
              <span>Strong design. Minor refinements possible.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface DimensionBarProps {
  dimension: ScoreDimension;
}

function DimensionBar({ dimension }: DimensionBarProps) {
  const percentage = (dimension.score / 2) * 100;
  const color =
    dimension.score === 2 ? 'bg-green-600' : dimension.score === 1 ? 'bg-amber-600' : 'bg-red-600';

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-300">{dimension.label}</span>
        <span className="text-xs text-slate-500 font-semibold">{dimension.score}/2</span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// Scoring functions
function scoreAreaChange(metrics: any[]): number {
  const areaMetric = metrics.find((m) => m.label === 'Total floor area');
  if (!areaMetric) return 1;
  const delta = Math.abs(areaMetric.redesign - areaMetric.original);
  if (delta < 5) return 2; // < 5% change
  if (delta < 15) return 1;
  return 0;
}

function scoreRoomCount(metrics: any[]): number {
  const roomMetric = metrics.find((m) => m.label === 'Room count');
  if (!roomMetric) return 1;
  return roomMetric.redesign >= roomMetric.original ? 2 : 1;
}

function scoreIteration(walls: any[], rooms: any[]): number {
  const wallChanges = walls.filter((w) => w.status !== 'unchanged').length;
  const roomChanges = rooms.filter((r) => r.status !== 'unchanged').length;
  const totalChanges = wallChanges + roomChanges;

  if (totalChanges === 0) return 0; // No changes
  if (totalChanges < 3) return 1;
  return 2;
}

function scoreConnectivity(floor: Canonical.Floor): number {
  // All rooms should have bounding walls
  const allConnected = floor.rooms.every((r) => r.boundingWallIds.length > 0);
  return allConnected ? 2 : 1;
}

function scoreCompliance(floor: Canonical.Floor): number {
  // Basic check: rooms meet minimum area
  const minArea = 5e6; // 5 m²
  const compliant = floor.rooms.filter((r) => r.area >= minArea).length;
  return compliant === floor.rooms.length ? 2 : compliant > 0 ? 1 : 0;
}
