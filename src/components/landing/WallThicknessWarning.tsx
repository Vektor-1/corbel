"use client";

import React, { useState } from 'react';
import { Heerich } from 'heerich';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function WallThicknessWarning() {
  const [stories, setStories] = useState<1 | 2>(1);
  const isInvalid = stories === 2;

  // Initialize Heerich engine for oblique projection
  const h = new Heerich({
    tile: [30, 30],
    camera: { type: 'oblique', angle: -45, distance: 10 }
  });

  // Theme-calibrated colors matching Atelier dark theme
  const colors = {
    compliant: {
      top: '#4ade80',    // Green-400
      front: '#22c55e',  // Green-500
      right: '#15803d',  // Green-700
    },
    nonCompliant: {
      top: '#f87171',    // Red-400
      front: '#ef4444',  // Red-500
      right: '#b91c1c',  // Red-700
    },
    neutralSlab: {
      top: '#94a3b8',    // Slate-400
      front: '#64748b',  // Slate-500
      right: '#475569',  // Slate-700
    },
    stressedSlab: {
      top: '#fb923c',    // Orange-400
      front: '#f97316',  // Orange-500
      right: '#c2410c',  // Orange-700
    }
  };

  // Wall A: 150mm Wall (Size: [1, 3, 1], Position: [0, -2, 0])
  const wallAColor = isInvalid ? colors.nonCompliant : colors.compliant;
  h.addBox({
    position: [0, -2, 0],
    size: [1, 3, 1],
    style: {
      default: { stroke: '#232019', strokeWidth: 1 },
      top: { fill: wallAColor.top },
      front: { fill: wallAColor.front },
      right: { fill: wallAColor.right }
    }
  });

  // Slab A on top of Wall A (representing structural load)
  const slabAColor = isInvalid ? colors.stressedSlab : colors.neutralSlab;
  h.addBox({
    position: [0, -3, 0],
    size: [1, 1, 1],
    style: {
      default: { stroke: '#232019', strokeWidth: 1 },
      top: { fill: slabAColor.top },
      front: { fill: slabAColor.front },
      right: { fill: slabAColor.right }
    }
  });

  // Wall B: 225mm Wall (Size: [2, 3, 1], Position: [2, -2, 0])
  // Wall B is always compliant for both 1 and 2 storeys
  const wallBColor = colors.compliant;
  h.addBox({
    position: [2, -2, 0],
    size: [2, 3, 1],
    style: {
      default: { stroke: '#232019', strokeWidth: 1 },
      top: { fill: wallBColor.top },
      front: { fill: wallBColor.front },
      right: { fill: wallBColor.right }
    }
  });

  // Slab B on top of Wall B (representing structural load)
  const slabBColor = colors.neutralSlab;
  h.addBox({
    position: [2, -3, 0],
    size: [2, 1, 1],
    style: {
      default: { stroke: '#232019', strokeWidth: 1 },
      top: { fill: slabBColor.top },
      front: { fill: slabBColor.front },
      right: { fill: slabBColor.right }
    }
  });

  // Render to SVG string using optimized bounds
  const svgMarkup = h.toSVG({ padding: 15 });

  return (
    <div className="flex flex-col lg:flex-row gap-8 py-6 text-slate-200 border-b border-[#232019]">
      {/* 3D Rendering Canvas */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-md font-semibold text-[#c9a96a]">Wall Thickness Check</h3>
            <p className="text-xs text-slate-400">Oblique Stress and Thickness Simulation</p>
          </div>

          {/* Building Height Selectors */}
          <div className="flex gap-1 bg-[#232019] p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setStories(1)}
              aria-pressed={stories === 1}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all active:scale-95 ${
                stories === 1
                  ? 'bg-emerald-600/25 border border-emerald-500/40 text-emerald-300'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              1-Storey
            </button>
            <button
              type="button"
              onClick={() => setStories(2)}
              aria-pressed={stories === 2}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all active:scale-95 ${
                stories === 2
                  ? 'bg-red-950/40 border border-red-500/40 text-red-400 font-semibold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              2-Storey
            </button>
          </div>
        </div>

        {/* Oblique Voxel Scene Display */}
        <div
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
          className="flex-1 min-h-[220px] bg-[#12110e]/20 border border-[#232019] rounded-lg p-4 flex items-center justify-center relative [&_path]:transition-colors [&_path]:duration-300"
        />

        {/* Labels underneath the model */}
        <div className="flex justify-around text-[10px] text-slate-400 font-semibold mt-3 select-none">
          <span className={isInvalid ? "text-red-400 font-bold" : "text-emerald-400"}>
            Wall A: 150mm Single Course
          </span>
          <span className="text-emerald-400">
            Wall B: 225mm Double Course
          </span>
        </div>
      </div>

      {/* Compliance / Status Card */}
      <div className="w-full lg:w-[320px] flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-[#232019] pt-6 lg:pt-0 lg:pl-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-[#232019] text-[#c9a96a] border border-amber-900/20 mb-3">
            Standards Verification
          </div>

          <h4 className="text-lg font-bold text-white tracking-wide mb-2">
            Load-Bearing Criteria
          </h4>

          {/* Compliance Status Block */}
          {isInvalid ? (
            <div className="rounded-lg border border-red-500/20 bg-red-950/20 p-4 mb-4">
              <div className="flex items-center gap-2 text-red-400 text-sm font-bold mb-1">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                <span>STRUCTURAL HAZARD DETECTED</span>
              </div>
              <p className="text-xs text-red-200/80 leading-relaxed">
                Building standards require load-bearing walls for multi-storey buildings to have a minimum thickness of <strong>225mm</strong>.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/10 p-4 mb-4">
              <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold mb-1">
                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                <span>STRUCTURE COMPLIANT</span>
              </div>
              <p className="text-xs text-emerald-200/80 leading-relaxed">
                A 150mm wall is legally sufficient for single-storey load bearing walls, subject to local structural design standards.
              </p>
            </div>
          )}

          <div className="space-y-3.5 my-4">
            <div className="flex justify-between items-center text-xs pb-1.5 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Height Limit</span>
              <span className="font-semibold text-white">{stories === 1 ? '1 Storey (Max 3.5m)' : '2 Storeys (Max 7.0m)'}</span>
            </div>
            <div className="flex justify-between items-center text-xs pb-1.5 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Wall A Status</span>
              <span className={`font-semibold font-mono ${isInvalid ? 'text-red-400' : 'text-emerald-400'}`}>
                {isInvalid ? 'NON-COMPLIANT' : 'COMPLIANT'}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs pb-1.5 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Wall B Status</span>
              <span className="font-semibold text-emerald-400 font-mono">COMPLIANT</span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed bg-[#232019]/40 p-3 rounded-lg border border-[#232019]/60">
            {isInvalid 
              ? 'Buckling risk increases exponentially on 150mm walls carrying load from upper levels. Extruded voxels simulate excessive structural stress under multi-level floor loads.'
              : 'Gravity load on a single storey is safely distributed across both wall types. No stress concentrations are expected under standard residential design constraints.'
            }
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-[#232019] text-[10px] text-slate-500 leading-normal">
          * Warning: Always verify wall thickness rules against your local zoning, structural regulations, and planning codes.
        </div>
      </div>
    </div>
  );
}
