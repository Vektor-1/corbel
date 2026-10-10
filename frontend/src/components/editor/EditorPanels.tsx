'use client';

import { useEffect, useState } from 'react';
import { EditorPanel } from '@/components/ui/editor-panel';
import { FieldLabel, Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { citationForRule } from '@/lib/standards/citations';
import { millimetresPerPixel } from '@/lib/geometry/scale';
import type {
  DesignObject,
  Door,
  FloorPlan,
  MaterialType,
  ObjectAsset,
  Room,
  ValidationResult,
  Wall,
  WallConstraint,
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
  scale,
  walls,
  constraints,
  onSaveConstraint,
  onAddDimensions,
}: {
  wall: Wall;
  results: ValidationResult[];
  onUpdate: (updates: Partial<Wall>) => void;
  scale: number;
  walls: Wall[];
  constraints: WallConstraint[];
  onSaveConstraint: (kind: WallConstraint['kind'], wallId: string, referenceWallId: string) => void;
  onAddDimensions: (wallId: string) => void;
}) {
  const [referenceWallId, setReferenceWallId] = useState('');
  const length = Math.sqrt(
    Math.pow(wall.endPoint.x - wall.startPoint.x, 2) +
      Math.pow(wall.endPoint.y - wall.startPoint.y, 2)
  );
  const primaryIssue = results.find((result) => result.type === 'error') ?? results[0];

  const updateNumber = (field: 'thickness' | 'height', value: string) => {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) onUpdate({ [field]: parsed });
  };
  const updateLength = (value: string) => {
    const lengthMm = Number(value);
    if (!Number.isFinite(lengthMm) || lengthMm <= 0) return;
    const lengthPx = lengthMm / millimetresPerPixel(scale);
    const direction = length > 0 ? { x: (wall.endPoint.x - wall.startPoint.x) / length, y: (wall.endPoint.y - wall.startPoint.y) / length } : { x: 1, y: 0 };
    onUpdate({ endPoint: { x: wall.startPoint.x + direction.x * lengthPx, y: wall.startPoint.y + direction.y * lengthPx } });
  };
  const updateAngle = (value: string) => {
    const degrees = Number(value);
    if (!Number.isFinite(degrees)) return;
    const radians = degrees * Math.PI / 180;
    onUpdate({ endPoint: { x: wall.startPoint.x + Math.cos(radians) * length, y: wall.startPoint.y + Math.sin(radians) * length } });
  };
  const referenceWall = walls.find((candidate) => candidate.id === referenceWallId);
  useEffect(() => {
    if (referenceWallId && !walls.some((candidate) => candidate.id === referenceWallId && candidate.id !== wall.id)) {
      setReferenceWallId('');
    }
  }, [referenceWallId, wall.id, walls]);
  const constrainToReference = (perpendicular: boolean) => {
    if (!referenceWall) return;
    const referenceDx = referenceWall.endPoint.x - referenceWall.startPoint.x;
    const referenceDy = referenceWall.endPoint.y - referenceWall.startPoint.y;
    const referenceLength = Math.hypot(referenceDx, referenceDy);
    if (referenceLength <= 0 || length <= 0) return;
    const direction = perpendicular
      ? { x: -referenceDy / referenceLength, y: referenceDx / referenceLength }
      : { x: referenceDx / referenceLength, y: referenceDy / referenceLength };
    const currentDx = wall.endPoint.x - wall.startPoint.x;
    const currentDy = wall.endPoint.y - wall.startPoint.y;
    const sign = currentDx * direction.x + currentDy * direction.y < 0 ? -1 : 1;
    onUpdate({ endPoint: { x: wall.startPoint.x + direction.x * length * sign, y: wall.startPoint.y + direction.y * length * sign } });
    onSaveConstraint(perpendicular ? 'perpendicular' : 'parallel', wall.id, referenceWall.id);
  };
  const angle = Math.round(Math.atan2(wall.endPoint.y - wall.startPoint.y, wall.endPoint.x - wall.startPoint.x) * 180 / Math.PI);

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
          {wall.source === 'ai' && typeof wall.confidence === 'number'
            ? `AI ${Math.round(wall.confidence * 100)}%`
            : primaryIssue ? primaryIssue.type : 'Passing'}
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
        <FieldLabel label="Length" unit="mm">
          <Input type="number" min={1} step={10} value={Math.round(length * millimetresPerPixel(scale))} onChange={(event) => updateLength(event.target.value)} />
        </FieldLabel>
        <FieldLabel label="Angle" unit="°">
          <Input type="number" min={-180} max={180} step={1} value={angle} onChange={(event) => updateAngle(event.target.value)} />
        </FieldLabel>
      </div>

      {walls.length > 1 && (
        <div className="mt-3 border-t border-[var(--editor-border)] pt-3">
          <p className="mb-2 text-[11px] font-medium text-[var(--editor-text-muted)]">Constraint</p>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
            <Select aria-label="Reference wall" value={referenceWallId} onChange={(event) => setReferenceWallId(event.target.value)}>
              <option value="">Reference wall…</option>
              {walls.filter((candidate) => candidate.id !== wall.id).map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.id}</option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="secondary" disabled={!referenceWall} onClick={() => constrainToReference(false)}>Parallel</Button>
            <Button type="button" size="sm" variant="secondary" disabled={!referenceWall} onClick={() => constrainToReference(true)}>Perpendicular</Button>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2"><p className="text-[10px] leading-3 text-[var(--editor-text-subtle)]">Keeps this wall’s start point and length; connected endpoints follow.</p><Button type="button" size="xs" variant="ghost" onClick={() => onAddDimensions(wall.id)}>Pin dimensions</Button></div>
          {constraints.filter((constraint) => constraint.wallId === wall.id).length > 0 && <p className="mt-1 text-[10px] text-[var(--editor-accent-text)]">{constraints.filter((constraint) => constraint.wallId === wall.id).map((constraint) => constraint.kind).join(' · ')} constraint saved</p>}
        </div>
      )}

      <p className="mt-3 rounded-md bg-[var(--editor-info-soft)] px-2.5 py-2 text-[11px] leading-4 text-[var(--editor-info)]">
        In Plan view, select this wall and drag either highlighted endpoint to reshape it. Endpoints snap to the drawing grid.
      </p>

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

      {primaryIssue && (
        <p className="mt-2 rounded-md bg-[var(--editor-info-soft)] px-2.5 py-2 text-[10px] leading-3 text-[var(--editor-info)]">
          <span className="font-semibold">Citation: </span>
          {citationForRule(primaryIssue.rule) || 'No citation available for this rule'}
        </p>
      )}
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
      action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">{door.source === 'ai' && typeof door.confidence === 'number' ? `AI ${Math.round(door.confidence * 100)}%` : 'Opening'}</span>}
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
        <FieldLabel label="Swing direction">
          <Select value={door.openDirection ?? 'in'} onChange={(event) => onUpdate({ openDirection: event.target.value as Door['openDirection'] })}>
            <option value="in">In</option>
            <option value="out">Out</option>
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
      action={<span className="rounded bg-[var(--editor-info-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-info)]">{window.source === 'ai' && typeof window.confidence === 'number' ? `AI ${Math.round(window.confidence * 100)}%` : 'Opening'}</span>}
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
        <FieldLabel label="Room type">
          <Select
            value={room.type ?? ''}
            onChange={(event) => onUpdate({ type: (event.target.value || undefined) as Room['type'] })}
          >
            <option value="">Choose a type</option>
            <option value="bedroom">Bedroom</option>
            <option value="kitchen">Kitchen</option>
            <option value="bathroom">Bathroom</option>
            <option value="living">Living room</option>
            <option value="dining">Dining room</option>
            <option value="other">Other / not assessed</option>
          </Select>
        </FieldLabel>
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
          {room.type && room.type !== 'other'
            ? 'Area guidance now uses this room type. Move or redraw a wall to change the space.'
            : 'Choose a room type to enable area guidance, then move or redraw a wall to change the space.'}
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

/** Bulk actions + a precise scale field for a multi-element selection (2 or more elements, grouped or not). */
export function MultiSelectInspector({
  count,
  isGroup,
  canGroup,
  onGroup,
  onUngroup,
  onDelete,
  onScale,
}: {
  count: number;
  isGroup: boolean;
  /** Grouping only makes sense for 2+ elements; hide the Group/Ungroup action otherwise. */
  canGroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onDelete: () => void;
  onScale: (percent: number) => void;
}) {
  const [scalePercent, setScalePercent] = useState(100);

  return (
    <EditorPanel
      title={`${count} element${count === 1 ? '' : 's'} selected`}
      description={isGroup ? 'Grouped — moves and scales as one object' : 'Drag the dashed box to move, corners to resize'}
      action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">Selection</span>}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {canGroup && (
          isGroup ? (
            <Button variant="ghost" size="sm" className="col-span-2 justify-start" onClick={onUngroup}>
              Ungroup
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="col-span-2 justify-start" onClick={onGroup}>
              Group into one object
            </Button>
          )
        )}
        <FieldLabel label="Scale" unit="%">
          <Input
            type="number"
            min={10}
            max={400}
            step={5}
            value={scalePercent}
            onChange={(event) => setScalePercent(Number(event.target.value) || 100)}
          />
        </FieldLabel>
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          onClick={() => onScale(scalePercent)}
        >
          Apply scale
        </Button>
        <Button variant="ghost" size="sm" className="col-span-2 justify-start text-[var(--editor-danger)]" onClick={onDelete}>
          Delete selection
        </Button>
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
  onSelectElement,
}: {
  results: ValidationResult[];
  hasGeometry: boolean;
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  onSelectElement?: (id: string) => void;
}) {
  const errors = results.filter((result) => result.type === 'error').length;
  const warnings = results.filter((result) => result.type === 'warning').length;
  const priorityGroups = [
    { type: 'error' as const, label: 'Fix first' },
    { type: 'warning' as const, label: 'Review next' },
    { type: 'info' as const, label: 'Learning note' },
  ].map((group) => ({ ...group, results: results.filter((result) => result.type === group.type) }));

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
        <div className="space-y-3">
          {priorityGroups.filter((group) => group.results.length > 0).map((group) => (
            <div key={group.type}>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--editor-text-subtle)]">{group.label}</p>
              <div className="space-y-1.5">
                {group.results.map((result) => (
                  <FeedbackItem key={result.id} result={result} onSelectElement={onSelectElement} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </EditorPanel>
  );
}

function FeedbackItem({ result, onSelectElement }: { result: ValidationResult; onSelectElement?: (id: string) => void }) {
  const [hintOpen, setHintOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const citation = citationForRule(result.rule);
  const title = result.rule.replace(/-/g, ' ');

  return (
    <article className="rounded-md bg-[var(--editor-surface-muted)] px-2.5 py-2">
      <button type="button" onClick={() => onSelectElement?.(result.targetId)} className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]" aria-label={`Review ${title}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-medium capitalize text-[var(--editor-text)]">{title}</p>
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', result.type === 'error' ? 'bg-[var(--editor-danger)]' : result.type === 'warning' ? 'bg-[var(--editor-warning)]' : 'bg-[var(--editor-info)]')} />
        </div>
        <p className="mt-1 text-[11px] leading-4 text-[var(--editor-text-subtle)]">{result.message}</p>
        {citation && <p className="mt-1 text-[10px] text-[var(--editor-text-muted)] italic">Reference: {citation}</p>}
      </button>
      {(result.remediation || result.evidence) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
          {result.remediation && <button type="button" className="font-medium text-[var(--editor-accent-text)] underline decoration-[var(--editor-accent)]/40 underline-offset-2" onClick={() => setHintOpen((open) => !open)} aria-expanded={hintOpen}>Need a hint?</button>}
          {result.evidence && <button type="button" className="font-medium text-[var(--editor-text-muted)] underline decoration-[var(--editor-border-strong)]/60 underline-offset-2" onClick={() => setEvidenceOpen((open) => !open)} aria-expanded={evidenceOpen}>Why this?</button>}
        </div>
      )}
      {hintOpen && result.remediation && <p className="mt-1.5 text-[11px] leading-4 text-[var(--editor-text-muted)]"><span className="font-medium text-[var(--editor-text)]">Try this: </span>{result.remediation}</p>}
      {evidenceOpen && result.evidence && <p className="mt-1.5 text-[10px] leading-4 text-[var(--editor-text-subtle)]"><span className="font-medium text-[var(--editor-text-muted)]">Evidence: </span>{result.evidence}</p>}
    </article>
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
