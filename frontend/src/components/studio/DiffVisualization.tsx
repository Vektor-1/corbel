'use client';

import { useMemo } from 'react';
import { Canonical } from '@/types/schema';
import { compareCanonicalFloors } from '@/lib/comparison/canonical';
import type { ElementMatch } from '@/lib/comparison/types';
import { CheckCircle2, AlertCircle, Plus, Minus, ArrowRight } from 'lucide-react';

interface DiffVisualizationProps {
  baseline: Canonical.Floor | null;
  redesign: Canonical.Floor | null;
}

export function DiffVisualization({ baseline, redesign }: DiffVisualizationProps) {
  const diff = useMemo(() => {
    if (!baseline || !redesign) return null;
    return compareCanonicalFloors(baseline, redesign);
  }, [baseline, redesign]);

  if (!diff) {
    return <div className="text-xs text-slate-400">Load both baseline and redesign floors</div>;
  }

  const counts = {
    added: diff.walls.filter((m) => m.status === 'added').length,
    removed: diff.walls.filter((m) => m.status === 'removed').length,
    moved: diff.walls.filter((m) => m.status === 'moved').length,
    unchanged: diff.walls.filter((m) => m.status === 'unchanged').length,
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <StatBox label="Added" count={counts.added} color="green" icon={<Plus className="w-3 h-3" />} />
        <StatBox label="Removed" count={counts.removed} color="red" icon={<Minus className="w-3 h-3" />} />
        <StatBox label="Moved" count={counts.moved} color="amber" icon={<ArrowRight className="w-3 h-3" />} />
        <StatBox label="Unchanged" count={counts.unchanged} color="slate" icon={<CheckCircle2 className="w-3 h-3" />} />
      </div>

      {/* Metrics */}
      <div className="border-t border-slate-700 pt-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Metrics</h4>
        <div className="space-y-1 text-xs">
          {diff.metrics.map((m, i) => (
            <MetricRow key={i} metric={m} />
          ))}
        </div>
      </div>

      {/* Detailed changes */}
      <div className="border-t border-slate-700 pt-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Walls</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {diff.walls.slice(0, 10).map((match) => (
            <MatchRow key={`${match.originalId}-${match.redesignId}`} match={match} type="wall" />
          ))}
          {diff.walls.length > 10 && <div className="text-xs text-slate-500 px-2 py-1">+{diff.walls.length - 10} more</div>}
        </div>
      </div>

      <div className="border-t border-slate-700 pt-3">
        <h4 className="text-xs font-semibold text-slate-300 mb-2">Rooms</h4>
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {diff.rooms.slice(0, 10).map((match) => (
            <MatchRow key={`${match.originalId}-${match.redesignId}`} match={match} type="room" />
          ))}
          {diff.rooms.length > 10 && <div className="text-xs text-slate-500 px-2 py-1">+{diff.rooms.length - 10} more</div>}
        </div>
      </div>
    </div>
  );
}

interface StatBoxProps {
  label: string;
  count: number;
  color: 'red' | 'green' | 'amber' | 'slate';
  icon: React.ReactNode;
}

function StatBox({ label, count, color, icon }: StatBoxProps) {
  const colors = {
    red: 'bg-red-900/30 border-red-800 text-red-400',
    green: 'bg-green-900/30 border-green-800 text-green-400',
    amber: 'bg-amber-900/30 border-amber-800 text-amber-400',
    slate: 'bg-slate-700/30 border-slate-600 text-slate-400',
  };

  return (
    <div className={`p-2 rounded border ${colors[color]} flex flex-col items-center gap-1`}>
      <div className="flex items-center gap-1">
        {icon}
        <span className="font-bold text-sm">{count}</span>
      </div>
      <span className="text-xs opacity-75">{label}</span>
    </div>
  );
}

interface MetricRowProps {
  metric: {
    label: string;
    original: number;
    redesign: number;
    unit: string;
  };
}

function MetricRow({ metric }: MetricRowProps) {
  const delta = metric.redesign - metric.original;
  const deltaPercent = ((delta / metric.original) * 100).toFixed(0);
  const isIncrease = delta > 0;
  const color = isIncrease ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-slate-400';

  return (
    <div className="flex justify-between items-center px-2 py-1 bg-slate-800/40 rounded">
      <span className="text-slate-300">{metric.label}</span>
      <div className="flex items-center gap-2">
        <span className="text-slate-500 text-xs">
          {metric.original.toFixed(1)} → {metric.redesign.toFixed(1)} {metric.unit}
        </span>
        <span className={`text-xs font-semibold ${color}`}>
          {isIncrease ? '+' : ''}{deltaPercent}%
        </span>
      </div>
    </div>
  );
}

interface MatchRowProps {
  match: ElementMatch;
  type: 'wall' | 'room' | 'opening';
}

function MatchRow({ match, type }: MatchRowProps) {
  const statusColors = {
    added: 'text-green-400 bg-green-900/10 border-green-800/30',
    removed: 'text-red-400 bg-red-900/10 border-red-800/30',
    moved: 'text-amber-400 bg-amber-900/10 border-amber-800/30',
    resized: 'text-blue-400 bg-blue-900/10 border-blue-800/30',
    unchanged: 'text-slate-400 bg-slate-800/20 border-slate-700/20',
  };

  const statusIcons = {
    added: <Plus className="w-3.5 h-3.5" />,
    removed: <Minus className="w-3.5 h-3.5" />,
    moved: <ArrowRight className="w-3.5 h-3.5" />,
    resized: <ArrowRight className="w-3.5 h-3.5" />,
    unchanged: <CheckCircle2 className="w-3.5 h-3.5" />,
  };

  const idString = match.redesignId 
    ? `${type === 'wall' ? 'Wall' : 'Room'} ${match.redesignId.slice(0, 6)}`
    : `${type === 'wall' ? 'Wall' : 'Room'} ${match.originalId?.slice(0, 6) || ''}`;

  return (
    <div className={`flex justify-between items-center px-2 py-1 rounded border text-xs ${statusColors[match.status]}`}>
      <span className="font-mono">{idString}</span>
      <div className="flex items-center gap-1.5">
        {statusIcons[match.status]}
        <span className="capitalize text-[10px] font-semibold">{match.status}</span>
      </div>
    </div>
  );
}
