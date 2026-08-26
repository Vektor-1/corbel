'use client';

import { useState } from 'react';
import { Canonical } from '@/types/schema';
import { DiffVisualization } from './DiffVisualization';
import { FeedbackScore } from './FeedbackScore';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface TraceToLearnViewProps {
  baseline: Canonical.Floor | null;
  redesign: Canonical.Floor | null;
  onAccept?: () => void;
}

type Panel = 'diff' | 'score' | 'both';

export function TraceToLearnView({ baseline, redesign, onAccept }: TraceToLearnViewProps) {
  const [activePanel, setActivePanel] = useState<Panel>('both');
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    const next = new Set(collapsedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setCollapsedSections(next);
  };

  if (!baseline || !redesign) {
    return (
      <div className="p-8 text-center">
        <div className="text-sm text-slate-400">
          Upload a baseline floor plan and redesign to begin Trace-to-Learn feedback
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
        <h2 className="text-lg font-bold text-slate-50 mb-1">Trace-to-Learn Feedback</h2>
        <p className="text-xs text-slate-400">Compare your redesign against the baseline and receive scoring feedback</p>
      </div>

      {/* Panel Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setActivePanel('diff')}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${
            activePanel === 'diff'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Diff Analysis
        </button>
        <button
          onClick={() => setActivePanel('score')}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${
            activePanel === 'score'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Score & Feedback
        </button>
        <button
          onClick={() => setActivePanel('both')}
          className={`flex-1 px-3 py-2 text-xs font-medium rounded transition-colors ${
            activePanel === 'both'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
        >
          Both
        </button>
      </div>

      {/* Content */}
      <div className="grid gap-4" style={{ gridTemplateColumns: activePanel === 'both' ? '1fr 1fr' : '1fr' }}>
        {/* Diff Visualization */}
        {(activePanel === 'diff' || activePanel === 'both') && (
          <CollapsiblePanel
            title="Design Changes"
            section="diff"
            collapsed={collapsedSections.has('diff')}
            onToggle={toggleSection}
          >
            <DiffVisualization baseline={baseline} redesign={redesign} />
          </CollapsiblePanel>
        )}

        {/* Feedback Score */}
        {(activePanel === 'score' || activePanel === 'both') && (
          <CollapsiblePanel
            title="Design Score"
            section="score"
            collapsed={collapsedSections.has('score')}
            onToggle={toggleSection}
          >
            <FeedbackScore baseline={baseline} redesign={redesign} />
          </CollapsiblePanel>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-4">
        <button
          onClick={onAccept}
          className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
        >
          Accept Redesign
        </button>
        <button className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
          Continue Editing
        </button>
      </div>
    </div>
  );
}

interface CollapsiblePanelProps {
  title: string;
  section: string;
  collapsed: boolean;
  onToggle: (section: string) => void;
  children: React.ReactNode;
}

function CollapsiblePanel({ title, section, collapsed, onToggle, children }: CollapsiblePanelProps) {
  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50">
      <button
        onClick={() => onToggle(section)}
        className="w-full p-3 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <h3 className="font-semibold text-slate-200 text-sm">{title}</h3>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>
      {!collapsed && <div className="p-4 border-t border-slate-700">{children}</div>}
    </div>
  );
}
