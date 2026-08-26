'use client';

import React, { useState } from 'react';
import {
  Pointer,
  Square,
  Circle,
  DoorOpen,
  FrameIcon,
  Trash2,
  Save,
  Download,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useDesignStore } from '@/store/designStore';
import { useFloorPlanStore } from '@/store/floorPlanStore';
import { useValidation } from '@/hooks/useValidation';
import { ValidationPanel } from './ValidationPanel';

// Mock compliance visualization component
const ComplianceScore = ({ score }: { score: number }) => {
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          {/* Background circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#334155"
            strokeWidth="3"
          />
          {/* Progress circle */}
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#2563eb"
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{score}%</div>
            <div className="text-xs text-slate-400">Compliance</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Tool button component
interface ToolButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

const ToolButton = ({ icon, label, isActive, onClick }: ToolButtonProps) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center w-full gap-2 px-4 py-4 rounded-lg transition-all ${
      isActive
        ? 'bg-blue-600 text-white shadow-lg'
        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
    }`}
    title={label}
  >
    <div className="w-12 h-12 flex items-center justify-center">{icon}</div>
    <span className="text-xs font-medium text-center whitespace-nowrap">{label}</span>
  </button>
);

// View mode toggle
interface ViewModeToggleProps {
  currentMode: '2d' | '3d' | 'split';
  onChange: (mode: '2d' | '3d' | 'split') => void;
}

const ViewModeToggle = ({ currentMode, onChange }: ViewModeToggleProps) => (
  <div className="flex gap-1 bg-slate-800 p-1 rounded-lg">
    {(['2d', '3d', 'split'] as const).map((mode) => (
      <button
        key={mode}
        onClick={() => onChange(mode)}
        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
          currentMode === mode
            ? 'bg-blue-600 text-white'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        {mode.toUpperCase()}
      </button>
    ))}
  </div>
);

// Main editor layout component
export default function EditorLayout() {
  const {
    currentTool,
    setCurrentTool,
    viewMode,
    setViewMode,
    floorPlan,
    validationResults,
  } = useDesignStore();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  const validation = useValidation();
  const { currentFloor, library } = useFloorPlanStore((state) => ({
    currentFloor: state.currentFloor,
    library: state.library,
  }));

  const wallCount = floorPlan?.walls.length || 0;
  const roomCount = floorPlan?.rooms.length || 0;
  const doorCount = floorPlan?.doors.length || 0;
  const windowCount = floorPlan?.windows.length || 0;

  return (
    <div className="flex h-screen bg-slate-900 text-slate-50">
      {/* Left Sidebar - Tools */}
      <div
        className={`${
          sidebarOpen ? 'w-80' : 'w-0'
        } bg-slate-800 border-r border-slate-700 flex flex-col transition-all duration-300 overflow-hidden`}
      >
        {/* Tools Section */}
        <div className="p-4 space-y-2 flex-1 overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Tools
          </h3>

          <ToolButton
            icon={<Pointer size={24} />}
            label="Select"
            isActive={currentTool === 'select'}
            onClick={() => setCurrentTool('select')}
          />

          <ToolButton
            icon={<Square size={24} />}
            label="Wall"
            isActive={currentTool === 'wall'}
            onClick={() => setCurrentTool('wall')}
          />

          <ToolButton
            icon={<Circle size={24} />}
            label="Room"
            isActive={currentTool === 'room'}
            onClick={() => setCurrentTool('room')}
          />

          <ToolButton
            icon={<DoorOpen size={24} />}
            label="Door"
            isActive={currentTool === 'door'}
            onClick={() => setCurrentTool('door')}
          />

          <ToolButton
            icon={<FrameIcon size={24} />}
            label="Window"
            isActive={currentTool === 'window'}
            onClick={() => setCurrentTool('window')}
          />

          <ToolButton
            icon={<Trash2 size={24} />}
            label="Delete"
            isActive={currentTool === 'delete'}
            onClick={() => setCurrentTool('delete')}
          />
        </div>

        {/* Material Picker Section */}
        <div className="p-4 border-t border-slate-700 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Materials
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {['Sandcrete', 'Laterite', 'Concrete', 'Timber'].map((material) => (
              <button
                key={material}
                className="px-3 py-2 rounded bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors"
              >
                {material}
              </button>
            ))}
          </div>
        </div>

        {/* Properties Section */}
        <div className="p-4 border-t border-slate-700 space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Properties
          </h3>
          <div className="space-y-2 text-xs text-slate-300">
            <div className="flex justify-between">
              <span>Thickness:</span>
              <input
                type="number"
                placeholder="mm"
                className="w-16 px-2 py-1 bg-slate-700 rounded border border-slate-600 text-right"
              />
            </div>
            <div className="flex justify-between">
              <span>Height:</span>
              <input
                type="number"
                placeholder="mm"
                className="w-16 px-2 py-1 bg-slate-700 rounded border border-slate-600 text-right"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 gap-4">
          {/* Left: Menu & File */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-slate-400 hover:text-slate-200 transition-colors"
            >
              {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="h-8 w-px bg-slate-700"></div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">Project</span>
              <span className="text-sm font-semibold text-white">
                {floorPlan?.name || 'Untitled Floor Plan'}
              </span>
            </div>
          </div>

          {/* Center: View Mode Toggle */}
          <ViewModeToggle currentMode={viewMode} onChange={setViewMode} />

          {/* Right: Save & Export */}
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
              <Save size={16} />
              Save
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 flex">
          {/* 2D/3D Canvas */}
          <div className="flex-1 bg-slate-900 relative overflow-hidden">
            {/* Placeholder for Konva 2D or R3F 3D */}
            <div className="w-full h-full flex items-center justify-center">
              {viewMode === '2d' && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-300 mb-2">
                    2D Canvas (Konva)
                  </div>
                  <div className="text-xs text-slate-500">
                    Selected tool: <span className="font-mono text-blue-400">{currentTool}</span>
                  </div>
                </div>
              )}
              {viewMode === '3d' && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-300 mb-2">
                    3D Canvas (React Three Fiber)
                  </div>
                  <div className="text-xs text-slate-500">
                    Ready for 3D visualization
                  </div>
                </div>
              )}
              {viewMode === 'split' && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-slate-300 mb-2">
                    Split View (2D + 3D)
                  </div>
                  <div className="text-xs text-slate-500">
                    Left: 2D Canvas | Right: 3D Canvas
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Vertical Divider for Split View */}
          {viewMode === 'split' && (
            <div className="w-px bg-slate-700"></div>
          )}

          {/* Right Sidebar - Feedback & Compliance */}
          <div
            className={`${
              rightSidebarOpen ? 'w-96' : 'w-0'
            } bg-slate-800 border-l border-slate-700 flex flex-col transition-all duration-300 overflow-hidden`}
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Validation & Feedback</h2>
              <button
                onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                {rightSidebarOpen ? <X size={18} /> : <ChevronRight size={18} />}
              </button>
            </div>

            {/* Validation Panel */}
            <div className="p-4 border-b border-slate-700 flex-1 overflow-y-auto">
              <ValidationPanel
                floor={currentFloor}
                library={library}
                selectedElementId={selectedElementId}
                onSelectElement={(elementId) => setSelectedElementId(elementId)}
              />
            </div>

            {/* Statistics */}
            <div className="p-4 border-t border-slate-700 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Statistics
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-slate-400">Walls</div>
                  <div className="text-lg font-bold text-blue-400">{currentFloor?.walls.length || 0}</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-slate-400">Rooms</div>
                  <div className="text-lg font-bold text-blue-400">{currentFloor?.rooms.length || 0}</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-slate-400">Doors</div>
                  <div className="text-lg font-bold text-blue-400">{currentFloor?.openings.filter((o) => o.kind === 'door').length || 0}</div>
                </div>
                <div className="bg-slate-700/50 p-3 rounded">
                  <div className="text-slate-400">Windows</div>
                  <div className="text-lg font-bold text-blue-400">{currentFloor?.openings.filter((o) => o.kind === 'window').length || 0}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
