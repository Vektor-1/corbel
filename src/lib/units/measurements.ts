/**
 * Canonical conversion helpers. Geometry is always persisted in millimetres
 * and room areas in square metres; these functions only affect input/output.
 */
export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft' | 'ft-in';
export type AreaUnit = 'm²' | 'ft²' | 'cm²';

const MILLIMETRES_PER_UNIT: Record<Exclude<LengthUnit, 'ft-in'>, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export function toMillimetres(value: number, unit: Exclude<LengthUnit, 'ft-in'>): number {
  if (!Number.isFinite(value)) throw new Error('Measurement must be a finite number.');
  return value * MILLIMETRES_PER_UNIT[unit];
}

export function fromMillimetres(valueMm: number, unit: Exclude<LengthUnit, 'ft-in'>): number {
  if (!Number.isFinite(valueMm)) throw new Error('Measurement must be a finite number.');
  return valueMm / MILLIMETRES_PER_UNIT[unit];
}

export function formatLength(valueMm: number, unit: LengthUnit = 'mm'): string {
  if (unit === 'ft-in') {
    const totalHalfInches = Math.round((valueMm / 25.4) * 2);
    const feet = Math.floor(totalHalfInches / 24);
    const halfInches = totalHalfInches % 24;
    const inches = Math.floor(halfInches / 2);
    return `${feet}′ ${inches}${halfInches % 2 ? '½' : ''}″`;
  }

  const value = fromMillimetres(valueMm, unit);
  const digits = unit === 'm' || unit === 'ft' ? 2 : unit === 'cm' ? 1 : 0;
  return `${value.toFixed(digits)} ${unit}`;
}

export function formatArea(valueSquareMetres: number, unit: AreaUnit = 'm²'): string {
  if (!Number.isFinite(valueSquareMetres)) return `— ${unit}`;
  const value = unit === 'ft²' ? valueSquareMetres * 10.7639104167 : unit === 'cm²' ? valueSquareMetres * 10_000 : valueSquareMetres;
  const digits = unit === 'cm²' ? 0 : 1;
  return `${value.toFixed(digits)} ${unit}`;
}
