'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MATERIAL_LIBRARY, getMaterialsByCategory, type PBRMaterial } from '@/lib/materials/material-system';

interface MaterialPickerProps {
  category: 'wall' | 'floor' | 'ceiling' | 'trim' | 'fixture';
  selectedMaterialId?: string;
  onSelect: (materialId: string, material: PBRMaterial) => void;
}

export function MaterialPicker({ category, selectedMaterialId, onSelect }: MaterialPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const materials = getMaterialsByCategory(category);
  const selected = selectedMaterialId ? MATERIAL_LIBRARY[selectedMaterialId] : materials[0];

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-6 h-6 rounded border border-slate-500"
            style={{ backgroundColor: selected?.baseColor || '#888888' }}
          />
          <span>{selected?.name || 'Select material'}</span>
        </div>
        <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 rounded-lg border border-slate-700 shadow-lg z-50 max-h-64 overflow-y-auto">
          {materials.map((mat) => (
            <button
              key={mat.name}
              onClick={() => {
                onSelect(Object.keys(MATERIAL_LIBRARY).find((k) => MATERIAL_LIBRARY[k] === mat) || '', mat);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left hover:bg-slate-700 transition-colors flex items-center gap-3 border-b border-slate-700 last:border-b-0 ${
                selectedMaterialId === Object.keys(MATERIAL_LIBRARY).find((k) => MATERIAL_LIBRARY[k] === mat) ? 'bg-slate-700' : ''
              }`}
            >
              <div
                className="w-8 h-8 rounded border border-slate-500 flex-shrink-0"
                style={{ backgroundColor: mat.baseColor }}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">{mat.name}</div>
                <div className="text-xs text-slate-500">{mat.description}</div>
              </div>
              <div className="text-xs text-slate-400 flex-shrink-0">
                ${mat.costPerSqFt}/ft²
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
