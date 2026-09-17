import { describe, expect, it } from 'vitest';

import { formatArea, formatLength, toMillimetres } from '../measurements';

describe('measurement conversion', () => {
  it('converts common input units to Corbel’s millimetre storage unit', () => {
    expect(toMillimetres(2.4, 'm')).toBe(2400);
    expect(toMillimetres(240, 'cm')).toBe(2400);
    expect(toMillimetres(8, 'ft')).toBeCloseTo(2438.4);
    expect(toMillimetres(96, 'in')).toBeCloseTo(2438.4);
  });

  it('formats stored millimetres for metric and imperial readers', () => {
    expect(formatLength(2400, 'm')).toBe('2.40 m');
    expect(formatLength(2400, 'ft-in')).toBe("7′ 10½″");
    expect(formatArea(12, 'ft²')).toBe('129.2 ft²');
  });
});
