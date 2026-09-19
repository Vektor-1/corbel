import type { FloorPlan, ValidationResult } from '@/types/design';

/**
 * A jurisdiction's building code, expressed as data the engine runs rather than
 * logic baked into the engine.
 *
 * Corbel's validator started as Ghana Building Code checks written inline. That is
 * correct for the teaching context it was built for and wrong for anywhere else,
 * because the thresholds, the citations and the room vocabulary all change with
 * jurisdiction while the traversal over walls, openings and rooms does not. This
 * splits the two apart so a second code can be added without touching the engine.
 *
 * Citations follow the provenance rule already enforced by `citations.ts`: a rule
 * carries a citation only when that exact string is verifiable against a real
 * source. An uncited rule is honest; an invented citation is not.
 */

export interface RuleContext {
  floorPlan: FloorPlan;
  /** Storey count, which several thickness rules depend on. */
  stories: number;
}

export interface CodeRule {
  /** Stable identifier, also the key used to look up this rule's citation. */
  id: string;
  /** One line describing what the rule checks, for the rule-set index. */
  summary: string;
  evaluate(context: RuleContext): ValidationResult[];
}

export interface CodeRuleSet {
  id: string;
  name: string;
  jurisdiction: string;
  /**
   * Verbatim code references keyed by rule id. A missing entry means the rule has
   * no verified citation yet, and must surface as uncited rather than guessed.
   */
  citations: Partial<Record<string, string>>;
  rules: CodeRule[];
}

export function runRuleSet(ruleSet: CodeRuleSet, context: RuleContext): ValidationResult[] {
  return ruleSet.rules.flatMap((rule) => rule.evaluate(context));
}

/** The citation for a rule within a given code, or undefined when uncited. */
export function citationForRuleIn(ruleSet: CodeRuleSet, rule: string): string | undefined {
  return ruleSet.citations[rule];
}
