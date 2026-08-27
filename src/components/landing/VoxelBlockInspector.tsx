"use client";

import React, { useState } from 'react';
import { Heerich } from 'heerich';

interface BlockDetails {
  name: string;
  materialType: string;
  density: string;
  strength: string;
  standard: string;
  description: string;
}

export function VoxelBlockInspector() {
  const [material, setMaterial] = useState<'sandcrete' | 'laterite'>('sandcrete');
  const [hoveredCoords, setHoveredCoords] = useState<{ x: number; y: number; z: number } | null>(null);

  // Shading configuration for beautiful 3D look matching Atelier dark theme
  const colors = {
    sandcrete: {
      top: '#a39f94',
      front: '#8a867b',
      right: '#6f6c63',
    },
    laterite: {
      top: '#ca6c4c',
      front: '#b25a3d',
      right: '#92482f',
    },
    lintel: {
      top: '#a3824f',
      front: '#8a6b3f',
      right: '#6c5330',
    },
  };

  // Initialize Heerich engine for the oblique projection
  const h = new Heerich({
    tile: [40, 40],
    camera: { type: 'oblique', angle: -45, distance: 15 }
  });

  const getStyleForVoxel = (yVal: number) => {
    // y === -2 is the lintel course
    const isLintel = yVal === -2;
    const activeColorMap = isLintel ? colors.lintel : colors[material];

    return {
      default: { stroke: '#232019', strokeWidth: 1.5 },
      top: { fill: activeColorMap.top },
      front: { fill: activeColorMap.front },
      right: { fill: activeColorMap.right },
    };
  };

  // Add the 3D wall corner structure
  // Base layer (y = 0)
  h.addBox({ position: [0, 0, 0], size: [1, 1, 1], style: getStyleForVoxel(0) });
  h.addBox({ position: [1, 0, 0], size: [1, 1, 1], style: getStyleForVoxel(0) });
  h.addBox({ position: [0, 0, 1], size: [1, 1, 1], style: getStyleForVoxel(0) });

  // Middle layer (y = -1)
  h.addBox({ position: [0, -1, 0], size: [1, 1, 1], style: getStyleForVoxel(-1) });
  h.addBox({ position: [1, -1, 0], size: [1, 1, 1], style: getStyleForVoxel(-1) });
  h.addBox({ position: [0, -1, 1], size: [1, 1, 1], style: getStyleForVoxel(-1) });

  // Lintel layer (y = -2)
  h.addBox({ position: [0, -2, 0], size: [1, 1, 1], style: getStyleForVoxel(-2) });
  h.addBox({ position: [1, -2, 0], size: [1, 1, 1], style: getStyleForVoxel(-2) });
  h.addBox({ position: [0, -2, 1], size: [1, 1, 1], style: getStyleForVoxel(-2) });

  // Render SVG markup using optimal viewBox mapping
  const svgMarkup = h.toSVG({ padding: 15 });

  // Extract block details based on coordinate depth (y-axis)
  const getActiveBlockDetails = (): BlockDetails => {
    const isHoveredLintel = hoveredCoords ? hoveredCoords.y === -2 : false;
    
    if (isHoveredLintel) {
      return {
        name: 'Reinforced Concrete Lintel',
        materialType: 'C25/30 Concrete & Steel Rebar',
        density: '2,400 kg/m³',
        strength: '25.0 N/mm²',
        standard: 'BS EN 1992 (Eurocode 2)',
        description: 'Placed over wall openings to distribute loads from upper structures.'
      };
    }

    if (material === 'sandcrete') {
      return {
        name: hoveredCoords ? `Sandcrete Block (${hoveredCoords.x}, ${hoveredCoords.y}, ${hoveredCoords.z})` : 'Sandcrete Block (150mm)',
        materialType: 'Portland Cement & Clean Sand',
        density: '2,200 kg/m³',
        strength: '3.4 N/mm² (Class A Load-Bearing)',
        standard: 'GS 1207:2018',
        description: 'Standard sand-cement block widely used for load-bearing and partition walls.'
      };
    } else {
      return {
        name: hoveredCoords ? `Stabilized Laterite Block (${hoveredCoords.x}, ${hoveredCoords.y}, ${hoveredCoords.z})` : 'Stabilized Laterite Block (150mm)',
        materialType: 'Laterite Soil & 5% Cement',
        density: '1,800 kg/m³',
        strength: '2.8 N/mm² (Class B Load-Bearing)',
        standard: 'GS 1207:2018',
        description: 'Eco-friendly block option leveraging locally sourced natural laterite soils.'
      };
    }
  };

  const details = getActiveBlockDetails();

  const handleMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as SVGElement;
    const voxelData = target.getAttribute('data-voxel');
    if (voxelData) {
      const [x, y, z] = voxelData.split(',').map(Number);
      setHoveredCoords({ x, y, z });
    }
  };

  const handleMouseLeave = () => {
    setHoveredCoords(null);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6 rounded-xl border border-[#232019] bg-[#161511] text-slate-200">
      {/* Voxel Viewer Section */}
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-md font-semibold text-[#c9a96a]">3D Voxel Inspector</h3>
            <p className="text-xs text-slate-400">Interactive Oblique CAD Model</p>
          </div>
          
          {/* Material Select Toggles */}
          <div className="flex gap-1.5 bg-[#232019] p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setMaterial('sandcrete')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                material === 'sandcrete'
                  ? 'bg-[#8a6b3f] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sandcrete
            </button>
            <button
              onClick={() => setMaterial('laterite')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                material === 'laterite'
                  ? 'bg-[#8a6b3f] text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Laterite
            </button>
          </div>
        </div>

        {/* SVG Render Container */}
        <div
          id="voxel-container"
          onMouseOver={handleMouseOver}
          onMouseLeave={handleMouseLeave}
          dangerouslySetInnerHTML={{ __html: svgMarkup }}
          className="flex-1 min-h-[220px] bg-[#1a1814]/60 border border-[#232019] rounded-lg p-4 flex items-center justify-center cursor-pointer transition-colors duration-200 hover:border-amber-900/40 relative [&_path]:transition-all [&_path]:duration-150 [&_path:hover]:brightness-110 [&_path:hover]:stroke-amber-500 [&_path:hover]:stroke-[2px]"
        />
        
        <p className="text-[10px] text-slate-500 mt-2 text-center">
          Hover over individual voxels to read layout coordinates and check localized load properties.
        </p>
      </div>

      {/* Info Card Panel */}
      <div className="w-full lg:w-[320px] flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-[#232019] pt-6 lg:pt-0 lg:pl-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-semibold bg-[#232019] text-[#c9a96a] border border-amber-900/20 mb-3">
            {hoveredCoords ? 'Selected Element' : 'Material Properties'}
          </div>
          
          <h4 className="text-lg font-bold text-white tracking-wide mb-1">
            {details.name}
          </h4>
          <p className="text-xs text-slate-400 font-medium mb-4">
            {details.materialType}
          </p>
          
          <div className="space-y-3.5 my-4">
            <div className="flex justify-between items-center text-xs pb-2 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Dry Density</span>
              <span className="font-semibold text-white font-mono">{details.density}</span>
            </div>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Compressive Strength</span>
              <span className="font-semibold text-white font-mono">{details.strength}</span>
            </div>
            <div className="flex justify-between items-center text-xs pb-2 border-b border-[#232019]">
              <span className="text-slate-400 font-medium">Reference Standard</span>
              <span className="font-semibold text-[#c9a96a] font-mono">{details.standard}</span>
            </div>
          </div>
          
          <p className="text-xs text-slate-400 leading-relaxed mt-4 italic bg-[#232019]/40 p-3 rounded-lg border border-[#232019]/60">
            &ldquo;{details.description}&rdquo;
          </p>
        </div>

        <div className="mt-6 pt-4 border-t border-[#232019] text-[10px] text-slate-500">
          * Materials compliant with building regulations based on the spatial structural planning guidelines.
        </div>
      </div>
    </div>
  );
}
