'use client';

import { useState } from 'react';
import { Annotation, AnnotationType } from '@/lib/standards/annotations';
import { Plus, Trash2, MessageSquare, Ruler } from 'lucide-react';

interface AnnotationPanelProps {
  annotations: Annotation[];
  onAddAnnotation?: (type: AnnotationType, content: string, color: string) => void;
  onRemoveAnnotation?: (id: string) => void;
}

export function AnnotationPanel({ annotations, onAddAnnotation, onRemoveAnnotation }: AnnotationPanelProps) {
  const [newContent, setNewContent] = useState('');
  const [activeType, setActiveType] = useState<AnnotationType>('note');
  const [activeColor, setActiveColor] = useState<string>('yellow');

  const handleAdd = () => {
    if (newContent.trim()) {
      onAddAnnotation?.(activeType, newContent, activeColor);
      setNewContent('');
    }
  };

  return (
    <div className="space-y-3 p-4 bg-slate-800/40 rounded-lg">
      <h3 className="text-sm font-semibold text-slate-200">Annotations ({annotations.length})</h3>

      {/* Add annotation */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveType('note')}
            className={`flex-1 px-2 py-1 text-xs rounded flex items-center gap-1 justify-center ${
              activeType === 'note'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <MessageSquare className="w-3 h-3" /> Note
          </button>
          <button
            onClick={() => setActiveType('measurement')}
            className={`flex-1 px-2 py-1 text-xs rounded flex items-center gap-1 justify-center ${
              activeType === 'measurement'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <Ruler className="w-3 h-3" /> Measure
          </button>
        </div>

        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Add a note or measurement..."
          className="w-full px-2 py-1 text-xs bg-slate-700 border border-slate-600 rounded text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          rows={2}
        />

        <div className="flex gap-2 items-center">
          <div className="flex gap-1">
            {['yellow', 'blue', 'red', 'green'].map((color) => (
              <button
                key={color}
                onClick={() => setActiveColor(color)}
                className={`w-5 h-5 rounded border-2 ${
                  activeColor === color ? 'border-white' : 'border-slate-600'
                } ${
                  color === 'yellow'
                    ? 'bg-yellow-400'
                    : color === 'blue'
                    ? 'bg-blue-400'
                    : color === 'red'
                    ? 'bg-red-400'
                    : 'bg-green-400'
                }`}
              />
            ))}
          </div>
          <button
            onClick={handleAdd}
            disabled={!newContent.trim()}
            className="flex-1 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white rounded flex items-center gap-1 justify-center"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>
      </div>

      {/* Annotations list */}
      {annotations.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto border-t border-slate-700 pt-2">
          {annotations.map((ann) => (
            <div key={ann.id} className="flex items-start gap-2 p-2 bg-slate-700/30 rounded text-xs">
              <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                ann.color === 'yellow' ? 'bg-yellow-400' :
                ann.color === 'blue' ? 'bg-blue-400' :
                ann.color === 'red' ? 'bg-red-400' :
                'bg-green-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="text-slate-300 break-words">{ann.content}</div>
                <div className="text-slate-500 text-xs mt-1">
                  {ann.type === 'measurement' ? '📏 Measurement' : '📝 Note'}
                </div>
              </div>
              <button
                onClick={() => onRemoveAnnotation?.(ann.id)}
                className="text-slate-500 hover:text-red-400 flex-shrink-0 p-1"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {annotations.length === 0 && (
        <div className="text-xs text-slate-500 py-4 text-center">No annotations yet</div>
      )}
    </div>
  );
}
