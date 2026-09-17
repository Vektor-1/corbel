/**
 * Citation registry for the AI tutor's citation-only grounding.
 *
 * Every entry here MUST be copied verbatim from an existing, unambiguous
 * citation string already present elsewhere in this codebase (see
 * src/lib/standards/validation.ts, canonicalValidation.ts, materials.ts).
 *
 * Do NOT add speculative, paraphrased, or inferred citations. Rules with
 * no clean existing citation must be omitted (resolve to `undefined`),
 * never fabricated. This file is the audit point for citation provenance.
 */

export const RULE_CITATIONS: Partial<Record<string, string>> = {
  // Verified repository reference. Do not infer subsection titles or attach a
  // citation to another educational rule until its exact source is reviewed.
  'wall-thickness-insufficient': 'GS 1207:2018 Part 7',
};

/**
 * Resolve a validation rule ID to its code citation, if any.
 * Returns undefined for uncited rules (the tutor must never fabricate a citation).
 */
export function citationForRule(rule: string): string | undefined {
  return RULE_CITATIONS[rule];
}
