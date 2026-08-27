'use client';

import React from 'react';
import { PBRMaterial, generateMaterialReport } from '@/lib/materials/material-system';
import { Leaf, DollarSign, Recycle } from 'lucide-react';

interface MaterialInfoProps {
  material: PBRMaterial;
  areaSqFt?: number;
}

export function MaterialInfo({ material, areaSqFt = 100 }: MaterialInfoProps) {
  const totalCost = material.costPerSqFt * areaSqFt;
  const carbonPerArea = material.embodiedCarbon * (areaSqFt * 0.0929); // Convert to sq m

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-3 text-sm">
      {/* Name & Description */}
      <div>
        <div className="font-semibold text-slate-200">{material.name}</div>
        <div className="text-xs text-slate-400">{material.description}</div>
      </div>

      {/* Properties */}
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-slate-500">Finish</div>
          <div className="text-slate-200 font-medium">{material.finish}</div>
        </div>
        <div>
          <div className="text-slate-500">Material</div>
          <div className="text-slate-200 font-medium">{material.material}</div>
        </div>
      </div>

      {/* PBR Properties */}
      <div className="space-y-2 bg-slate-900 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-semibold">PBR Properties</div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <div className="text-slate-500">Metalness</div>
            <div className="text-slate-200">{(material.metalness * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-slate-500">Roughness</div>
            <div className="text-slate-200">{(material.roughness * 100).toFixed(0)}%</div>
          </div>
          <div>
            <div className="text-slate-500">Normal</div>
            <div className="text-slate-200">{material.normalScale.toFixed(1)}x</div>
          </div>
        </div>
      </div>

      {/* Cost Analysis */}
      {areaSqFt && (
        <div className="space-y-2 bg-slate-900 rounded p-3">
          <div className="text-xs text-slate-500 uppercase font-semibold flex items-center gap-2">
            <DollarSign size={12} />
            Cost Estimate
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Area:</span>
            <span className="text-slate-200 font-medium">{areaSqFt.toFixed(1)} ft²</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Unit Price:</span>
            <span className="text-slate-200 font-medium">${material.costPerSqFt.toFixed(2)}/ft²</span>
          </div>
          <div className="flex justify-between text-xs border-t border-slate-700 pt-2">
            <span className="text-slate-300 font-medium">Total Cost:</span>
            <span className="text-blue-400 font-bold">${totalCost.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Sustainability */}
      <div className="space-y-2 bg-slate-900 rounded p-3">
        <div className="text-xs text-slate-500 uppercase font-semibold flex items-center gap-2">
          <Leaf size={12} />
          Sustainability
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Embodied Carbon:</span>
          <span className={`font-medium ${carbonPerArea < 0 ? 'text-green-400' : 'text-orange-400'}`}>
            {carbonPerArea.toFixed(2)} kg CO₂
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-slate-400">Recyclability:</span>
          <span className="text-slate-200 font-medium capitalize flex items-center gap-1">
            <Recycle size={12} />
            {material.recyclability}
          </span>
        </div>
      </div>
    </div>
  );
}
