'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, Layers3, Lock, LockKeyholeOpen, MapPinned, Plus, Printer, Rows3, SquareStack } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditorPanel } from '@/components/ui/editor-panel';
import { Input, Select } from '@/components/ui/field';
import { buildingModelFor, MODEL_LAYER_ID } from '@/lib/building/model';
import type { BuildingModel, FloorPlan, NamedPlanView } from '@/types/design';

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export function BuildingStructurePanel({
  floorPlan,
  selection,
  onUpdate,
  onAssignSelection,
  onApplyView,
  onSaveView,
  onExportSheet,
  onPreviewSection,
}: {
  floorPlan: FloorPlan;
  selection: string[];
  onUpdate: (updates: Partial<BuildingModel>) => void;
  onAssignSelection: (ids: string[], layerId: string) => void;
  onApplyView: (view: NamedPlanView) => void;
  onSaveView: (name: string) => void;
  onExportSheet: (sheetId: string) => void;
  onPreviewSection: (sectionId: string) => void;
}) {
  const model = useMemo(() => buildingModelFor(floorPlan), [floorPlan]);
  const [viewName, setViewName] = useState('Working view');
  const [layerName, setLayerName] = useState('Annotations');
  const currentStory = model.stories.find((story) => story.id === model.activeStoryId) ?? model.stories[0];
  const updateLayer = (layerId: string, updates: Partial<BuildingModel['layers'][number]>) => onUpdate({
    layers: model.layers.map((layer) => layer.id === layerId ? { ...layer, ...updates } : layer),
  });
  const isolateLayer = (layerId: string) => onUpdate({
    layers: model.layers.map((layer) => ({ ...layer, visible: layer.id === layerId })),
  });

  return (
    <EditorPanel title="Building" description="Stories, coordination, and sheets" action={<SquareStack className="size-3.5 text-[var(--editor-text-subtle)]" />}>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-[var(--editor-text-muted)]"><Rows3 className="mr-1 inline size-3" />Stories</p>
          <Button size="xs" variant="ghost" aria-label="Add story" onClick={() => {
            const next = model.stories.length + 1;
            onUpdate({ stories: [...model.stories, { id: id('story'), name: `Level ${next}`, elevation: currentStory.elevation + currentStory.height, height: currentStory.height }] });
          }}><Plus /></Button>
        </div>
        <Select value={model.activeStoryId} aria-label="Active story" onChange={(event) => onUpdate({ activeStoryId: event.target.value })}>
          {model.stories.map((story) => <option key={story.id} value={story.id}>{story.name} · {story.elevation} mm</option>)}
        </Select>
      </section>

      <section className="mt-3 border-t border-[var(--editor-border)] pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-[var(--editor-text-muted)]"><MapPinned className="mr-1 inline size-3" />Coordination grids</p>
          <Button size="xs" variant="ghost" aria-label="Add grid line" onClick={() => {
            const next = model.grids.length + 1;
            onUpdate({ grids: [...model.grids, { id: id('grid'), label: String(next), axis: next % 2 ? 'vertical' : 'horizontal', position: next * 1000 }] });
          }}><Plus /></Button>
        </div>
        <p className="text-[10px] leading-3 text-[var(--editor-text-subtle)]">{model.grids.length ? `${model.grids.length} grid line${model.grids.length === 1 ? '' : 's'} stored with this plan.` : 'Add grid lines to coordinate drawings and sheets.'}</p>
      </section>

      <section className="mt-3 border-t border-[var(--editor-border)] pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-[var(--editor-text-muted)]">Sections</p>
          <Button size="xs" variant="ghost" aria-label="Add section marker" onClick={() => {
            const next = model.sections.length + 1;
            onUpdate({ sections: [...model.sections, { id: id('section'), label: `Section ${String.fromCharCode(64 + next)}`, startPoint: { x: -400, y: next * 200 }, endPoint: { x: 400, y: next * 200 } }] });
          }}><Plus /></Button>
        </div>
        {model.sections.length ? <div className="space-y-1">{model.sections.map((section) => <Button key={section.id} size="xs" variant="ghost" className="w-full justify-start" onClick={() => onPreviewSection(section.id)}>{section.label}<span className="ml-auto text-[10px] text-[var(--editor-text-subtle)]">Generate elevation</span></Button>)}</div> : <p className="text-[10px] leading-3 text-[var(--editor-text-subtle)]">Add a section marker for coordinated drawing sets.</p>}
      </section>

      <section className="mt-3 border-t border-[var(--editor-border)] pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-medium text-[var(--editor-text-muted)]"><Layers3 className="mr-1 inline size-3" />Layers</p>
          <Button size="xs" variant="ghost" aria-label="Add layer" onClick={() => {
            const name = layerName.trim() || 'Layer';
            onUpdate({ layers: [...model.layers, { id: id('layer'), name, visible: true, locked: false, elementIds: [] }] });
            setLayerName('Annotations');
          }}><Plus /></Button>
        </div>
        <div className="mb-2 flex gap-1.5"><Input aria-label="New layer name" value={layerName} onChange={(event) => setLayerName(event.target.value)} /></div>
        <div className="space-y-1">
          {model.layers.map((layer) => (
            <div key={layer.id} className="flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-[var(--editor-surface-muted)]">
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--editor-text-muted)]">{layer.name}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`} onClick={() => updateLayer(layer.id, { visible: !layer.visible })}>{layer.visible ? <Eye /> : <EyeOff />}</Button>
              <Button size="icon-xs" variant="ghost" aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`} onClick={() => updateLayer(layer.id, { locked: !layer.locked })}>{layer.locked ? <Lock /> : <LockKeyholeOpen />}</Button>
              <Button size="xs" variant="ghost" disabled={layer.id === MODEL_LAYER_ID} onClick={() => isolateLayer(layer.id)}>Only</Button>
            </div>
          ))}
        </div>
        {selection.length > 0 && (
          <Select className="mt-2" aria-label="Assign selection to layer" defaultValue="" onChange={(event) => {
            if (event.target.value) onAssignSelection(selection, event.target.value);
            event.currentTarget.value = '';
          }}>
            <option value="">Move {selection.length} selected to layer…</option>
            {model.layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}
          </Select>
        )}
      </section>

      <section className="mt-3 border-t border-[var(--editor-border)] pt-3">
        <p className="mb-2 text-[11px] font-medium text-[var(--editor-text-muted)]">Named views</p>
        <div className="flex gap-1.5"><Input aria-label="Named view" value={viewName} onChange={(event) => setViewName(event.target.value)} /><Button size="sm" variant="secondary" onClick={() => onSaveView(viewName)}>Save</Button></div>
        {model.namedViews.map((view) => <Button key={view.id} size="xs" variant="ghost" className="mt-1 w-full justify-start" onClick={() => onApplyView(view)}>{view.name}</Button>)}
      </section>

      <section className="mt-3 border-t border-[var(--editor-border)] pt-3">
        <p className="mb-1 text-[11px] font-medium text-[var(--editor-text-muted)]">Sheets</p>
        {model.sheets.map((sheet) => <Button key={sheet.id} size="sm" variant="ghost" className="w-full justify-start" onClick={() => onExportSheet(sheet.id)}><Printer />{sheet.name}<span className="ml-auto text-[10px] text-[var(--editor-text-subtle)]">{sheet.size} · {sheet.scaleLabel}</span></Button>)}
      </section>
    </EditorPanel>
  );
}
