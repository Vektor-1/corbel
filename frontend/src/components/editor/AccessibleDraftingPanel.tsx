'use client';

import { useState } from 'react';
import { DoorOpen, Keyboard, PanelsTopLeft, Square } from 'lucide-react';
import { EditorPanel } from '@/components/ui/editor-panel';
import { FieldLabel, Input, Select } from '@/components/ui/field';
import type { Wall } from '@/types/design';

type OpeningKind = 'door' | 'window';

function asMillimetres(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A non-pointer equivalent to the Konva drawing tools. Coordinates are real
 * plan millimetres, rather than screen pixels, so a keyboard user can author
 * and review the same geometry as a pointer user. */
export function AccessibleDraftingPanel({
  walls,
  selectedWall,
  onAddWall,
  onAddOpening,
}: {
  walls: Wall[];
  selectedWall: Wall | null;
  onAddWall: (coordinates: { startX: number; startY: number; endX: number; endY: number }) => string | null;
  onAddOpening: (kind: OpeningKind, width: number, offset: number) => string | null;
}) {
  const [wall, setWall] = useState({ startX: '0', startY: '0', endX: '3000', endY: '0' });
  const [openingKind, setOpeningKind] = useState<OpeningKind>('door');
  const [openingWidth, setOpeningWidth] = useState('900');
  const [openingOffset, setOpeningOffset] = useState('1500');
  const [status, setStatus] = useState<string | null>(null);
  const [wallSubmitAttempted, setWallSubmitAttempted] = useState(false);
  const [openingSubmitAttempted, setOpeningSubmitAttempted] = useState(false);

  const createWall = () => {
    setWallSubmitAttempted(true);
    const coordinates = {
      startX: asMillimetres(wall.startX), startY: asMillimetres(wall.startY),
      endX: asMillimetres(wall.endX), endY: asMillimetres(wall.endY),
    };
    if (Object.values(coordinates).some((value) => value === null)) {
      setStatus('Enter four numeric millimetre coordinates.');
      return;
    }
    setStatus(onAddWall(coordinates as { startX: number; startY: number; endX: number; endY: number }) ?? 'Wall added and selected.');
  };

  const createOpening = () => {
    setOpeningSubmitAttempted(true);
    if (!selectedWall) {
      setStatus('Select a host wall in the Outline before adding an opening.');
      return;
    }
    const width = asMillimetres(openingWidth);
    const offset = asMillimetres(openingOffset);
    if (width === null || offset === null) {
      setStatus('Enter a numeric opening width and centre offset in millimetres.');
      return;
    }
    setStatus(onAddOpening(openingKind, width, offset) ?? `${openingKind === 'door' ? 'Door' : 'Window'} added and selected.`);
  };

  return (
    <EditorPanel title="Keyboard drafting" description="Create the same plan geometry without using the canvas" action={<Keyboard className="size-3.5 text-[var(--editor-accent-text)]" aria-hidden="true" />}>
      <p className="text-[10px] leading-4 text-[var(--editor-text-subtle)]">All coordinates are in millimetres from the drawing origin. Use the Outline to select an existing wall for a hosted opening.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <FieldLabel label="Start X" unit="mm"><Input inputMode="decimal" aria-invalid={wallSubmitAttempted && asMillimetres(wall.startX) === null} value={wall.startX} onChange={(event) => setWall((current) => ({ ...current, startX: event.target.value }))} /></FieldLabel>
        <FieldLabel label="Start Y" unit="mm"><Input inputMode="decimal" aria-invalid={wallSubmitAttempted && asMillimetres(wall.startY) === null} value={wall.startY} onChange={(event) => setWall((current) => ({ ...current, startY: event.target.value }))} /></FieldLabel>
        <FieldLabel label="End X" unit="mm"><Input inputMode="decimal" aria-invalid={wallSubmitAttempted && asMillimetres(wall.endX) === null} value={wall.endX} onChange={(event) => setWall((current) => ({ ...current, endX: event.target.value }))} /></FieldLabel>
        <FieldLabel label="End Y" unit="mm"><Input inputMode="decimal" aria-invalid={wallSubmitAttempted && asMillimetres(wall.endY) === null} value={wall.endY} onChange={(event) => setWall((current) => ({ ...current, endY: event.target.value }))} /></FieldLabel>
      </div>
      <button type="button" onClick={createWall} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--editor-accent)] px-3 text-xs font-medium text-[var(--editor-canvas)] hover:bg-[var(--editor-accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--editor-surface)]"><Square className="size-3.5" />Add wall from coordinates</button>

      <div className="mt-4 border-t border-[var(--editor-border)] pt-3">
        <p className="text-[11px] font-medium text-[var(--editor-text)]">Hosted opening</p>
        <p className="mt-0.5 text-[10px] leading-4 text-[var(--editor-text-subtle)]">{selectedWall ? `Host: selected wall (${selectedWall.id})` : walls.length ? 'No host selected.' : 'Add a wall before adding an opening.'}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <FieldLabel label="Type"><Select value={openingKind} onChange={(event) => setOpeningKind(event.target.value as OpeningKind)}><option value="door">Door</option><option value="window">Window</option></Select></FieldLabel>
          <FieldLabel label="Width" unit="mm"><Input inputMode="decimal" aria-invalid={openingSubmitAttempted && asMillimetres(openingWidth) === null} value={openingWidth} onChange={(event) => setOpeningWidth(event.target.value)} /></FieldLabel>
          <FieldLabel label="Centre offset" unit="mm"><Input className="col-span-2" inputMode="decimal" aria-invalid={openingSubmitAttempted && asMillimetres(openingOffset) === null} value={openingOffset} onChange={(event) => setOpeningOffset(event.target.value)} /></FieldLabel>
        </div>
        <button type="button" onClick={createOpening} className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[var(--editor-border-strong)] bg-[var(--editor-surface-raised)] px-3 text-xs font-medium text-[var(--editor-text)] hover:bg-[var(--editor-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]"><>{openingKind === 'door' ? <DoorOpen className="size-3.5" /> : <PanelsTopLeft className="size-3.5" />}</>Add {openingKind}</button>
      </div>
      <p aria-live="polite" className="mt-2 text-[10px] leading-4 text-[var(--editor-text-subtle)]">{status ?? 'Coordinate drafting is available alongside pointer drawing.'}</p>
    </EditorPanel>
  );
}
