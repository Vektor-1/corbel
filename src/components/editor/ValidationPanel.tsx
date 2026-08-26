'use client';

import { useMemo } from 'react';
import { Canonical } from '@/types/schema';
import { validateFloorRealtime, type ValidationIssue } from '@/lib/standards/realtimeValidation';
import { AlertCircle, CheckCircle2, AlertTriangle, Info } from 'lucide-react';

interface ValidationPanelProps {
  floor: Canonical.Floor | null;
  library: Canonical.Library;
  selectedElementId?: string;
  onSelectElement?: (elementId: string, elementType: string) => void;
}

export function ValidationPanel({ floor, library, selectedElementId, onSelectElement }: ValidationPanelProps) {
  const validation = useMemo(() => validateFloorRealtime(floor, library), [floor, library]);

  if (validation.issues.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-green-50 border border-green-200 flex gap-2 items-start">
        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-green-900 text-sm">No issues</div>
          <div className="text-xs text-green-700">Floor plan is valid and ready to export.</div>
        </div>
      </div>
    );
  }

  const errorIssues = validation.issues.filter((i) => i.severity === 'error');
  const warningIssues = validation.issues.filter((i) => i.severity === 'warning');
  const infoIssues = validation.issues.filter((i) => i.severity === 'info');

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex gap-4 text-xs">
        {validation.errorCount > 0 && (
          <div className="flex gap-1 items-center text-red-600">
            <AlertCircle className="w-4 h-4" />
            <span>{validation.errorCount} error{validation.errorCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {validation.warningCount > 0 && (
          <div className="flex gap-1 items-center text-amber-600">
            <AlertTriangle className="w-4 h-4" />
            <span>{validation.warningCount} warning{validation.warningCount !== 1 ? 's' : ''}</span>
          </div>
        )}
        {validation.infoCount > 0 && (
          <div className="flex gap-1 items-center text-blue-600">
            <Info className="w-4 h-4" />
            <span>{validation.infoCount} note{validation.infoCount !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* Issues list */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {errorIssues.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-red-700">Errors</div>
            {errorIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} selected={selectedElementId === issue.elementId} onSelect={onSelectElement} />
            ))}
          </div>
        )}

        {warningIssues.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-amber-700">Warnings</div>
            {warningIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} selected={selectedElementId === issue.elementId} onSelect={onSelectElement} />
            ))}
          </div>
        )}

        {infoIssues.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-blue-700">Notes</div>
            {infoIssues.map((issue) => (
              <IssueRow key={issue.id} issue={issue} selected={selectedElementId === issue.elementId} onSelect={onSelectElement} />
            ))}
          </div>
        )}
      </div>

      {/* Export block message */}
      {!validation.canExport && (
        <div className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200">
          ✗ Cannot export: fix errors above
        </div>
      )}
      {!validation.canAccept && (
        <div className="text-xs text-amber-600 p-2 bg-amber-50 rounded border border-amber-200">
          ⚠️ Cannot accept: fix critical errors above
        </div>
      )}
    </div>
  );
}

interface IssueRowProps {
  issue: ValidationIssue;
  selected: boolean;
  onSelect?: (elementId: string, elementType: string) => void;
}

function IssueRow({ issue, selected, onSelect }: IssueRowProps) {
  const bgColor =
    issue.severity === 'error' ? 'bg-red-50 hover:bg-red-100' : issue.severity === 'warning' ? 'bg-amber-50 hover:bg-amber-100' : 'bg-blue-50 hover:bg-blue-100';
  const borderColor = issue.severity === 'error' ? 'border-red-200' : issue.severity === 'warning' ? 'border-amber-200' : 'border-blue-200';
  const selectedBg = selected ? 'ring-2 ring-offset-1 ring-indigo-400' : '';

  return (
    <button
      onClick={() => onSelect?.(issue.elementId, issue.elementType)}
      className={`w-full text-left p-2 rounded border ${bgColor} ${borderColor} ${selectedBg} transition-colors cursor-pointer`}
    >
      <div className="flex gap-2 items-start">
        <div className="flex-shrink-0 mt-0.5">
          {issue.severity === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-600" />}
          {issue.severity === 'warning' && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          {issue.severity === 'info' && <Info className="w-3.5 h-3.5 text-blue-600" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">{issue.message}</div>
          {issue.suggestion && <div className="text-xs text-gray-600 mt-1">💡 {issue.suggestion}</div>}
        </div>
      </div>
    </button>
  );
}
