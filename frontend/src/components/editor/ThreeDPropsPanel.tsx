'use client';

import React from 'react';
import { useFloorPlanStore } from '@/lib/store/floorPlanStore';
import { MaterialPicker } from '../ui/MaterialPicker';
import { MaterialInfo } from '../ui/MaterialInfo';
import { PBRMaterial } from '@/lib/materials/material-system';

export function ThreeDPropsPanel() {
  const { selectedElementId, selectedElementKind, currentFloor } = useFloorPlanStore((state) => ({
    selectedElementId: state.selectedElementId,
    selectedElementKind: state.selectedElementKind,
    currentFloor: state.currentFloor,
  }));

  const [selectedMaterial, setSelectedMaterial] = React.useState<string>('');
  const [materialInfo, setMaterialInfo] = React.useState<PBRMaterial | null>(null);

  const selectedElement = React.useMemo(() => {
    if (!currentFloor || !selectedElementId) return null;

    if (selectedElementKind === 'wall') {
      return currentFloor.walls.find((w) => w.id === selectedElementId);
    } else if (selectedElementKind === 'room') {
      return currentFloor.rooms.find((r) => r.id === selectedElementId);
    } else if (selectedElementKind === 'opening') {
      return currentFloor.openings.find((o) => o.id === selectedElementId);
    }

    return null;
  }, [currentFloor, selectedElementId, selectedElementKind]);

  const handleMaterialSelect = (materialId: string, material: PBRMaterial) => {
    setSelectedMaterial(materialId);
    setMaterialInfo(material);
  };

  if (!selectedElement) {
    return (
      <div className="p-4 text-center text-xs text-slate-500">
        Select an element in 3D view to edit properties
      </div>
    );
  }

  const elementLabel = selectedElementKind === 'wall'
    ? `Wall ${selectedElementId?.slice(0, 6) || ''}`
    : selectedElementKind === 'room'
    ? `Room: ${(selectedElement as any).label || 'Unnamed'}`
    : 'Opening';

  const area = selectedElementKind === 'room'
    ? ((selectedElement as any).area / 1e6).toFixed(1) + ' m²'
    : selectedElementKind === 'wall'
    ? (Math.hypot(
        (selectedElement as any).end.x - (selectedElement as any).start.x,
        (selectedElement as any).end.y - (selectedElement as any).start.y
      ) / 1000).toFixed(2) + ' m'
    : ((selectedElement as any).width / 1000).toFixed(2) + ' m';

  const category = selectedElementKind === 'wall'
    ? 'wall'
    : selectedElementKind === 'room'
    ? 'floor'
    : selectedElementKind === 'opening'
    ? 'trim'
    : 'wall';

  return (
    <div className="space-y-4">
      {/* Element Info */}
      <div className="bg-slate-700 rounded-lg p-3">
        <div className="text-xs text-slate-400 uppercase font-semibold mb-2">Selected Element</div>
        <div className="text-sm font-semibold text-slate-200">{elementLabel}</div>
        <div className="text-xs text-slate-400 mt-1">
          {selectedElementKind === 'wall' ? 'Length' : selectedElementKind === 'room' ? 'Area' : 'Size'}: {area}
        </div>
      </div>

      {/* Material Selection */}
      <div>
        <label className="text-xs text-slate-400 uppercase font-semibold block mb-2">
          Material
        </label>
        <MaterialPicker
          category={category}
          selectedMaterialId={selectedMaterial}
          onSelect={handleMaterialSelect}
        />
      </div>

      {/* Material Info */}
      {materialInfo && (
        <MaterialInfo
          material={materialInfo}
          areaSqFt={
            selectedElementKind === 'room'
              ? ((selectedElement as any).area / 1e6) * 10.764 // m² to ft²
              : selectedElementKind === 'wall'
              ? (Math.hypot(
                  (selectedElement as any).end.x - (selectedElement as any).start.x,
                  (selectedElement as any).end.y - (selectedElement as any).start.y
                ) / 1000) * 3.281 // m to ft
              : 100
          }
        />
      )}

      {/* Transform Properties */}
      <div className="bg-slate-700 rounded-lg p-3 space-y-2">
        <div className="text-xs text-slate-400 uppercase font-semibold">Transform</div>
        {selectedElementKind === 'wall' && (
          <>
            <div className="text-xs">
              <span className="text-slate-400">Start:</span>
              <span className="text-slate-200 ml-2">
                {((selectedElement as any).start.x / 1000).toFixed(2)}m, {((selectedElement as any).start.y / 1000).toFixed(2)}m
              </span>
            </div>
            <div className="text-xs">
              <span className="text-slate-400">End:</span>
              <span className="text-slate-200 ml-2">
                {((selectedElement as any).end.x / 1000).toFixed(2)}m, {((selectedElement as any).end.y / 1000).toFixed(2)}m
              </span>
            </div>
            <div className="text-xs">
              <span className="text-slate-400">Thickness:</span>
              <span className="text-slate-200 ml-2">{(selectedElement as any).thickness || 200}mm</span>
            </div>
            <div className="text-xs">
              <span className="text-slate-400">Height:</span>
              <span className="text-slate-200 ml-2">{(selectedElement as any).height || 2800}mm</span>
            </div>
          </>
        )}
        {selectedElementKind === 'room' && (
          <div className="text-xs space-y-1">
            <div>
              <span className="text-slate-400">Type:</span>
              <span className="text-slate-200 ml-2 capitalize">{(selectedElement as any).type || 'general'}</span>
            </div>
            <div>
              <span className="text-slate-400">Centroid:</span>
              <span className="text-slate-200 ml-2">
                {((selectedElement as any).centroid.x / 1000).toFixed(2)}m, {((selectedElement as any).centroid.y / 1000).toFixed(2)}m
              </span>
            </div>
          </div>
        )}
        {selectedElementKind === 'opening' && (
          <div className="text-xs space-y-1">
            <div>
              <span className="text-slate-400">Type:</span>
              <span className="text-slate-200 ml-2 capitalize">{(selectedElement as any).kind}</span>
            </div>
            <div>
              <span className="text-slate-400">Width:</span>
              <span className="text-slate-200 ml-2">{((selectedElement as any).width / 1000).toFixed(2)}m</span>
            </div>
            <div>
              <span className="text-slate-400">Height:</span>
              <span className="text-slate-200 ml-2">{((selectedElement as any).height / 1000).toFixed(2)}m</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
