'use client';

import { useState } from 'react';
import { Eye, EyeOff, Grid3x3, Type, Ruler, Share2 } from 'lucide-react';

interface LayerTogglePanelProps {
  onLayerToggle?: (layer: LayerName, visible: boolean) => void;
}

export type LayerName = 'grid' | 'labels' | 'dimensions' | 'openings';

interface Layer {
  id: LayerName;
  label: string;
  icon: React.ReactNode;
  description: string;
  visible: boolean;
}

export function LayerTogglePanel({ onLayerToggle }: LayerTogglePanelProps) {
  const [layers, setLayers] = useState<Layer[]>([
    {
      id: 'grid',
      label: 'Grid',
      icon: <Grid3x3 className="w-4 h-4" />,
      description: 'Background reference grid',
      visible: true,
    },
    {
      id: 'labels',
      label: 'Room Labels',
      icon: <Type className="w-4 h-4" />,
      description: 'Room names and annotations',
      visible: true,
    },
    {
      id: 'dimensions',
      label: 'Dimensions',
      icon: <Ruler className="w-4 h-4" />,
      description: 'Wall and room measurements',
      visible: true,
    },
    {
      id: 'openings',
      label: 'Doors & Windows',
      icon: <Share2 className="w-4 h-4" />,
      description: 'Door and window symbols',
      visible: true,
    },
  ]);

  const handleToggle = (id: LayerName) => {
    setLayers((prev) =>
      prev.map((layer) =>
        layer.id === id ? { ...layer, visible: !layer.visible } : layer
      )
    );
    const newLayer = layers.find((l) => l.id === id);
    if (newLayer) {
      onLayerToggle?.(id, !newLayer.visible);
    }
  };

  const visibleCount = layers.filter((l) => l.visible).length;

  return (
    <div className="space-y-3 p-4 bg-slate-800/40 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200">Visibility Layers</h3>
        <div className="text-xs text-slate-500">{visibleCount}/{layers.length}</div>
      </div>

      <div className="space-y-2">
        {layers.map((layer) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            onToggle={() => handleToggle(layer.id)}
          />
        ))}
      </div>

      <div className="text-xs text-slate-500 pt-2 border-t border-slate-700">
        Toggle layers to declutter your workspace and focus on specific elements
      </div>
    </div>
  );
}

interface LayerRowProps {
  layer: Layer;
  onToggle: () => void;
}

function LayerRow({ layer, onToggle }: LayerRowProps) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center gap-3 p-2 rounded transition-colors ${
        layer.visible
          ? 'bg-slate-700/40 hover:bg-slate-600/40'
          : 'bg-slate-800/40 hover:bg-slate-700/40 opacity-60'
      }`}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex-shrink-0 p-1 rounded ${
          layer.visible
            ? 'text-slate-300 bg-slate-600/40'
            : 'text-slate-500 bg-slate-700/40'
        }`}
      >
        {layer.visible ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>

      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-slate-300">{layer.icon}</span>
          <span className="text-sm font-medium text-slate-200">{layer.label}</span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">{layer.description}</div>
      </div>
    </button>
  );
}
