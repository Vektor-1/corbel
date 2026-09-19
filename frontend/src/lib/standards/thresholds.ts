/**
 * Numeric limits a building code imposes, separated from the checks that apply
 * them so a second jurisdiction supplies values rather than new code.
 *
 * Kept in its own module because `validation.ts` reads these and the rule sets in
 * `codes/` import `validation.ts`; sharing them from either side would be circular.
 */
export interface CodeThresholds {
  /** Unsupported wall run, as a multiple of its thickness, before review. */
  maxSpanToThicknessRatio: number;
  /** Opening width above which structural support needs checking. */
  maxOpeningWidthMm: number;
  /** Minimum floor area per room type, keyed by lowercase room type. */
  minimumRoomAreaM2: Record<string, number>;
}

/**
 * Ghana Building Code (GS 1207:2018, L.I. 1630).
 *
 * These are the values Corbel has always applied; moving them here changed no
 * behaviour. Only wall thickness carries a verified citation (see `citations.ts`)
 * -- the span ratio and opening width are Corbel's own review thresholds, and are
 * worded as such to students rather than presented as code requirements.
 */
export const GHANA_THRESHOLDS: CodeThresholds = {
  maxSpanToThicknessRatio: 30,
  maxOpeningWidthMm: 2000,
  minimumRoomAreaM2: {
    bedroom: 9,
    kitchen: 6,
    bathroom: 3,
    living: 12,
    dining: 8,
  },
};
