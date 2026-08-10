'use client';

import { EditorPanel } from '@/components/ui/editor-panel';
import { FieldLabel, Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/cn';
import type {
  DesignObject,
  Door,
  FloorPlan,
  MaterialType,
  ObjectAsset,
  Room,
  ValidationResult,
  Wall,
  WallType,
  Window,
} from '@/types/design';

const materialLabels: Record<MaterialType, string> = {
  sandcrete: 'Sandcrete',
  laterite: 'Laterite',
  concrete: 'Concrete',
  timber: 'Timber',
};

function getSuggestion(result: ValidationResult | undefined, wall: Wall) {
  if (!result) return `${materialLabels[wall.material]} passes the current wall checks.`;
  if (result.rule === 'wall-thickness-insufficient') return 'Increase thickness or change the structural role.';
  if (result.rule === 'span-thickness-ratio-high') return 'Shorten the unsupported run or increase thickness.';
  if (result.rule === 'material-unknown') return 'Choose a material mapped to Ghana standards.';
  return 'Review this wall before continuing.';
}

export function ComplianceScore({ score, hasGeometry }: { score: number | null; hasGeometry: boolean }) {
  const value = score ?? 0;
  const barTone = !hasGeometry
    ? 'bg-[var(--editor-border-strong)]'
    : value >= 85
    ? 'bg-[var(--editor-success)]'
    : value >= 60
    ? 'bg-[var(--editor-warning)]'
    : 'bg-[var(--editor-danger)]';

  return (
    <EditorPanel title="Project review" action={<span className="text-xs tabular-nums text-[var(--editor-text-muted)]">{hasGeometry ? `${value}%` : '—'}</span>}>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--editor-surface-muted)]">
        <div className={cn('h-full rounded-full transition-all', barTone)} style={{ width: `${hasGeometry ? value : 0}%` }} />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-[var(--editor-text-subtle)]">
        {!hasGeometry
          ? 'Draw a wall to begin review.'
          : value >= 85
          ? 'No blocking project issues.'
          : value >= 60
          ? 'A few items need attention.'
          : 'Resolve blocking issues before export.'}
      </p>
    </EditorPanel>
  );
}

export function SelectedWallInspector({
  wall,
  results,
  onUpdate,
}: {
  wall: Wall;
  results: ValidationResult[];
  onUpdate: (updates: Partial<Wall>) => void;
}) {
  const length = Math.sqrt(
    Math.pow(wall.endPoint.x - wall.startPoint.x, 2) +
      Math.pow(wall.endPoint.y - wall.startPoint.y, 2)
  );
  const primaryIssue = results.find((result) => result.type === 'error') ?? results[0];

  const updateNumber = (field: 'thickness' | 'height', value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) onUpdate({ [field]: parsed });
  };

  return (
    <EditorPanel
      title="Wall"
      description={wall.id}
      action={
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-medium',
            primaryIssue
              ? primaryIssue.type === 'error'
                ? 'bg-[var(--editor-danger-soft)] text-[var(--editor-danger)]'
                : 'bg-[var(--editor-warning-soft)] text-[var(--editor-warning)]'
              : 'bg-[var(--editor-success-soft)] text-[var(--editor-success)]'
          )}
        >
          {primaryIssue ? primaryIssue.type : 'Passing'}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Material">
          <Select value={wall.material} onChange={(event) => onUpdate({ material: event.target.value as MaterialType })}>
            <option value="sandcrete">Sandcrete</option>
            <option value="laterite">Laterite</option>
            <option value="concrete">Concrete</option>
            <option value="timber">Timber</option>
          </Select>
        </FieldLabel>

        <FieldLabel label="Role">
          <Select value={wall.type} onChange={(event) => onUpdate({ type: event.target.value as WallType })}>
            <option value="loadBearing">Load bearing</option>
            <option value="partition">Partition</option>
          </Select>
        </FieldLabel>

        <FieldLabel label="Thickness" unit="mm">
          <Input
            type="number"
            min={75}
            step={25}
            value={wall.thickness}
            onChange={(event) => updateNumber('thickness', event.target.value)}
          />
        </FieldLabel>

        <FieldLabel label="Height" unit="mm">
          <Input
            type="number"
            min={2100}
            step={100}
            value={wall.height}
            onChange={(event) => updateNumber('height', event.target.value)}
          />
        </FieldLabel>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--editor-border)] pt-3 text-[11px]">
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--editor-text-subtle)]">Length</dt>
          <dd className="tabular-nums text-[var(--editor-text-muted)]">{Math.round(length)} mm</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[var(--editor-text-subtle)]">Checks</dt>
          <dd className="text-[var(--editor-text-muted)]">{results.length || 'Clear'}</dd>
        </div>
      </dl>

      <p className={cn('mt-3 rounded-md px-2.5 py-2 text-[11px] leading-4', primaryIssue ? 'bg-[var(--editor-warning-soft)] text-[var(--editor-warning)]' : 'bg-[var(--editor-success-soft)] text-[var(--editor-success)]')}>
        {getSuggestion(primaryIssue, wall)}
      </p>
    </EditorPanel>
  );
}

export function SelectedDoorInspector({
  door,
  onUpdate,
}: {
  door: Door;
  onUpdate: (updates: Partial<Door>) => void;
}) {
  return (
    <EditorPanel
      title="Door"
      description="Hosted by a wall; the arc shows its swing"
      action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">Opening</span>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <FieldLabel label="Width" unit="mm">
            <Input
              type="number"
              min={600}
              step={50}
              value={door.width}
              onChange={(event) => onUpdate({ width: Math.max(600, Number(event.target.value) || 600) })}
            />
          </FieldLabel>
          <FieldLabel label="Wall offset" unit="mm">
            <Input
              type="number"
              min={0}
              step={100}
              value={Math.round(door.position.x * 10)}
              onChange={(event) => onUpdate({ position: { ...door.position, x: Math.max(0, Number(event.target.value) / 10) } })}
            />
          </FieldLabel>
        </div>
        <FieldLabel label="Door type">
          <Select value={door.type} onChange={(event) => onUpdate({ type: event.target.value as Door['type'] })}>
            <option value="internal">Internal</option>
            <option value="entry">Entry</option>
          </Select>
        </FieldLabel>
        <FieldLabel label="Hinge side">
          <Select value={door.swing} onChange={(event) => onUpdate({ swing: event.target.value as Door['swing'] })}>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </Select>
        </FieldLabel>
      </div>
    </EditorPanel>
  );
}

export function SelectedWindowInspector({
  window,
  onUpdate,
}: {
  window: Window;
  onUpdate: (updates: Partial<Window>) => void;
}) {
  return (
    <EditorPanel
      title="Window"
      description="Hosted by a wall with plan and elevation dimensions"
      action={<span className="rounded bg-[var(--editor-info-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-info)]">Opening</span>}
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="Width" unit="mm">
          <Input type="number" min={400} step={50} value={window.width} onChange={(event) => onUpdate({ width: Math.max(400, Number(event.target.value) || 400) })} />
        </FieldLabel>
        <FieldLabel label="Height" unit="mm">
          <Input type="number" min={400} step={50} value={window.height} onChange={(event) => onUpdate({ height: Math.max(400, Number(event.target.value) || 400) })} />
        </FieldLabel>
        <FieldLabel label="Sill" unit="mm">
          <Input type="number" min={0} step={50} value={window.sillHeight} onChange={(event) => onUpdate({ sillHeight: Math.max(0, Number(event.target.value) || 0) })} />
        </FieldLabel>
        <FieldLabel label="Wall offset" unit="mm">
          <Input type="number" min={0} step={100} value={Math.round(window.position.x * 10)} onChange={(event) => onUpdate({ position: { ...window.position, x: Math.max(0, Number(event.target.value) / 10) } })} />
        </FieldLabel>
      </div>
    </EditorPanel>
  );
}

export function SelectedRoomInspector({
  room,
  onUpdate,
}: {
  room: Room;
  onUpdate: (updates: Partial<Room>) => void;
}) {
  return (
    <EditorPanel
      title="Space"
      description="Created automatically from a closed wall boundary"
      action={
        <span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">
          Room
        </span>
      }
    >
      <div className="space-y-3">
        <FieldLabel label="Room name">
          <Input
            value={room.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
            placeholder="e.g. Bedroom"
          />
        </FieldLabel>
        <dl className="grid grid-cols-2 gap-2 rounded-md bg-[var(--editor-surface-muted)] px-2.5 py-2 text-[11px]">
          <div>
            <dt className="text-[var(--editor-text-subtle)]">Floor area</dt>
            <dd className="mt-0.5 font-mono text-[var(--editor-text)]">{room.area.toFixed(2)} m²</dd>
          </div>
          <div>
            <dt className="text-[var(--editor-text-subtle)]">Boundary</dt>
            <dd className="mt-0.5 font-mono text-[var(--editor-text)]">{room.vertices.length} sides</dd>
          </div>
        </dl>
        <p className="text-[11px] leading-4 text-[var(--editor-text-subtle)]">
          Move or redraw a wall to change this space. Area feedback updates with the boundary.
        </p>
      </div>
    </EditorPanel>
  );
}

export function SelectedObjectInspector({
  object,
  asset,
  onUpdate,
}: {
  object: DesignObject;
  asset: ObjectAsset;
  onUpdate: (updates: Partial<DesignObject>) => void;
}) {
  const rotationDegrees = Math.round((object.rotation * 180) / Math.PI);

  return (
    <EditorPanel
      title={asset.name}
      description={`${asset.category} · ${asset.dimensions[0].toFixed(2)} × ${asset.dimensions[2].toFixed(2)} m`}
      action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">Object</span>}
    >
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label="X" unit="mm">
          <Input
            type="number"
            step={100}
            value={Math.round(object.position.x * 10)}
            onChange={(event) =>
              onUpdate({ position: { ...object.position, x: Number(event.target.value) / 10 } })
            }
          />
        </FieldLabel>
        <FieldLabel label="Y" unit="mm">
          <Input
            type="number"
            step={100}
            value={Math.round(object.position.y * 10)}
            onChange={(event) =>
              onUpdate({ position: { ...object.position, y: Number(event.target.value) / 10 } })
            }
          />
        </FieldLabel>
        <FieldLabel label="Rotation" unit="deg">
          <Input
            type="number"
            step={15}
            value={rotationDegrees}
            onChange={(event) => onUpdate({ rotation: (Number(event.target.value) * Math.PI) / 180 })}
          />
        </FieldLabel>
        <FieldLabel label="Scale">
          <Input
            type="number"
            min={0.25}
            max={4}
            step={0.1}
            value={object.scale}
            onChange={(event) => onUpdate({ scale: Math.max(0.25, Number(event.target.value) || 1) })}
          />
        </FieldLabel>
      </div>
    </EditorPanel>
  );
}

export function ValidationPanel({
  results,
  hasGeometry,
  title = 'Feedback',
  subtitle,
  emptyMessage = 'No issues found.',
}: {
  results: ValidationResult[];
  hasGeometry: boolean;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
}) {
  const errors = results.filter((result) => result.type === 'error').length;
  const warnings = results.filter((result) => result.type === 'warning').length;

  return (
    <EditorPanel
      title={title}
      description={subtitle}
      action={
        results.length > 0 ? (
          <span className="text-[10px] tabular-nums text-[var(--editor-text-subtle)]">{errors}E · {warnings}W</span>
        ) : null
      }
    >
      {!hasGeometry ? (
        <p className="text-[11px] leading-4 text-[var(--editor-text-subtle)]">Draw a wall to begin standards review.</p>
      ) : results.length === 0 ? (
        <p className="text-[11px] leading-4 text-[var(--editor-success)]">{emptyMessage}</p>
      ) : (
        <div className="space-y-1.5">
          {results.map((result) => (
            <div key={result.id} className="rounded-md bg-[var(--editor-surface-muted)] px-2.5 py-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-medium capitalize text-[var(--editor-text)]">{result.rule.replace(/-/g, ' ')}</p>
                <span
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    result.type === 'error'
                      ? 'bg-[var(--editor-danger)]'
                      : result.type === 'warning'
                      ? 'bg-[var(--editor-warning)]'
                      : 'bg-[var(--editor-info)]'
                  )}
                />
              </div>
              <p className="mt-1 text-[11px] leading-4 text-[var(--editor-text-subtle)]">{result.message}</p>
            </div>
          ))}
        </div>
      )}
    </EditorPanel>
  );
}

export function Statistics({ floorPlan }: { floorPlan: FloorPlan | null }) {
  if (!floorPlan) return null;

  const totalArea = floorPlan.rooms.reduce((sum, room) => sum + room.area, 0);

  return (
    <EditorPanel title="Summary">
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-[11px]">
        {[
          ['Walls', floorPlan.walls.length],
          ['Rooms', floorPlan.rooms.length],
          ['Doors', floorPlan.doors.length],
          ['Windows', floorPlan.windows.length],
          ['Objects', floorPlan.objects?.length ?? 0],
          ['Room area', `${totalArea.toFixed(1)} m²`],
          ['Canvas', `${(floorPlan.width / 1000).toFixed(0)} × ${(floorPlan.height / 1000).toFixed(0)} m`],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-[var(--editor-text-subtle)]">{label}</dt>
            <dd className="tabular-nums text-[var(--editor-text-muted)]">{value}</dd>
          </div>
        ))}
      </dl>
    </EditorPanel>
  );
}
