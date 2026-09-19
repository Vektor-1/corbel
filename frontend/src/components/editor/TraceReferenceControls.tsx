'use client';

import { useState } from 'react';
import { AlertTriangle, EyeOff, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { EditorPanel } from '@/components/ui/editor-panel';
import { FieldLabel, Input, Select } from '@/components/ui/field';
import { toMillimetres, type LengthUnit } from '@/lib/units/measurements';
import type { ValidationResult, Wall } from '@/types/design';
import type { TraceImageReference } from '@/store/designStore';

type CalibrationUnit = Exclude<LengthUnit, 'ft-in'>;

interface TraceReferenceControlsProps {
  reference: TraceImageReference;
  selectedWall: Wall | null;
  scaleIssue?: ValidationResult;
  onUpdate: (updates: Partial<Omit<TraceImageReference, 'url'>>) => void;
  onRemove: () => void;
  onCalibrate: (knownLengthMm: number) => boolean;
  onReviewScaleIssue: () => void;
  onUpdateWallThickness: (thickness: number) => void;
}

/** Persistent controls for an image-first trace. Kept outside the overflow menu
 * because image alignment and calibration are part of the active drawing task. */
export function TraceReferenceControls({
  reference,
  selectedWall,
  scaleIssue,
  onUpdate,
  onRemove,
  onCalibrate,
  onReviewScaleIssue,
  onUpdateWallThickness,
}: TraceReferenceControlsProps) {
  const [knownLength, setKnownLength] = useState('3');
  const [unit, setUnit] = useState<CalibrationUnit>('m');

  const calibrate = () => {
    const value = Number(knownLength);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a positive known wall length to calibrate the retrace.');
      return;
    }
    if (!selectedWall) {
      toast.message('Select a traced wall, then calibrate it against its known length.');
      return;
    }
    if (!onCalibrate(toMillimetres(value, unit))) {
      toast.error('That calibration could not be applied. Check the selected wall and length, then try again.');
      return;
    }
    toast.success('Reference scale calibrated. Review the updated dimensions and room areas.');
  };

  return (
    <EditorPanel
      title="Reference image"
      description="Trace alignment and measurement"
      action={<span className="rounded bg-[var(--editor-accent-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--editor-accent-text)]">2D guide</span>}
    >
      <p className="mb-3 text-[11px] leading-4 text-[var(--editor-text-subtle)]">
        Match the image size to your drawing, then calibrate one known wall before relying on dimensions or area.
      </p>

      {scaleIssue && (
        <div role="alert" className="mb-3 rounded-md bg-[var(--editor-warning-soft)] px-2.5 py-2 text-[11px] leading-4 text-[var(--editor-warning)]">
          <div className="flex gap-1.5">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Retrace scale needs attention</p>
              <p className="mt-0.5">The rooms you traced appear too small. Adjust the image size, redraw affected walls, then calibrate again.</p>
              <button type="button" onClick={onReviewScaleIssue} className="mt-1.5 font-semibold underline decoration-current/50 underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--editor-accent)]">
                Review selected reference wall
              </button>
            </div>
          </div>
        </div>
      )}

      {reference.calibration ? (
        <p className="mb-3 rounded-md bg-[var(--editor-success-soft)] px-2 py-1.5 text-[10px] leading-4 text-[var(--editor-success)]">
          Calibrated from the selected wall · {reference.calibration.knownLengthMm} mm · {Math.round(reference.calibration.pixelsPerMeter)} px/m
        </p>
      ) : (
        <div className="mb-3 rounded-md bg-[var(--editor-warning-soft)] px-2 py-1.5 text-[10px] leading-4 text-[var(--editor-warning)]">
          <p>Select a traced wall and set one known length to make measurements reliable.</p>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-1.5">
        <FieldLabel label="Known wall length">
          <Input type="number" min={0.1} step={unit === 'm' || unit === 'ft' ? 0.1 : 10} value={knownLength} onChange={(event) => setKnownLength(event.target.value)} />
        </FieldLabel>
        <FieldLabel label="Unit">
          <Select className="w-[4.5rem]" value={unit} onChange={(event) => setUnit(event.target.value as CalibrationUnit)}>
            <option value="mm">mm</option>
            <option value="cm">cm</option>
            <option value="m">m</option>
            <option value="ft">ft</option>
            <option value="in">in</option>
          </Select>
        </FieldLabel>
      </div>
      <Button variant="secondary" size="sm" className="mt-2 w-full justify-start" onClick={calibrate}>
        <Ruler /> {selectedWall ? 'Calibrate from selected wall' : 'Select a traced wall to calibrate'}
      </Button>

      {selectedWall && (
        <div className="mt-3 border-t border-[var(--editor-border)] pt-3">
          <FieldLabel label="Selected wall thickness" unit="mm">
            <Input
              type="number"
              min={75}
              step={25}
              value={selectedWall.thickness}
              onChange={(event) => {
                const thickness = Number(event.target.value);
                if (Number.isFinite(thickness) && thickness >= 75) onUpdateWallThickness(thickness);
              }}
            />
          </FieldLabel>
          <p className="mt-1 text-[10px] leading-4 text-[var(--editor-text-subtle)]">Adjust this wall only; use the wall defaults when drawing new walls.</p>
        </div>
      )}

      <div className="mt-3 space-y-2.5 border-t border-[var(--editor-border)] pt-3">
        <FieldLabel label={`Image display size · ${reference.scale.toFixed(2)}×`}>
          <input type="range" min={0.25} max={1.5} step={0.05} value={reference.scale} onChange={(event) => onUpdate({ scale: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image display size" />
        </FieldLabel>
        <FieldLabel label={`Blur · ${reference.blur}px`}>
          <input type="range" min={0} max={12} step={1} value={reference.blur} onChange={(event) => onUpdate({ blur: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image blur" />
        </FieldLabel>
        <FieldLabel label={`Opacity · ${Math.round(reference.opacity * 100)}%`}>
          <input type="range" min={0} max={1} step={0.05} value={reference.opacity} onChange={(event) => onUpdate({ opacity: Number(event.target.value) })} className="w-full accent-[var(--editor-accent)]" aria-label="Reference image opacity" />
        </FieldLabel>
      </div>

      <Button variant="ghost" size="sm" className="mt-2 w-full justify-start text-[var(--editor-text-muted)]" onClick={onRemove}>
        <EyeOff /> Remove reference image
      </Button>
    </EditorPanel>
  );
}
