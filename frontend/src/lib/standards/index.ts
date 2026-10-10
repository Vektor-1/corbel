import type { FloorPlan, ValidationResult } from '@/types/design';
import { ghanaBuildingCode } from './codes/ghana';
import { runRuleSet, type CodeRuleSet } from './ruleSet';

export { ghanaBuildingCode } from './codes/ghana';
export { runRuleSet, citationForRuleIn, type CodeRule, type CodeRuleSet, type RuleContext } from './ruleSet';
export { GHANA_THRESHOLDS, type CodeThresholds } from './thresholds';

/**
 * The code a plan is checked against unless a caller names another. Ghana is the
 * default because that is the jurisdiction Corbel teaches against; it is a default,
 * not an assumption baked into the engine.
 */
export const DEFAULT_RULE_SET = ghanaBuildingCode;

/** Every rule set the engine can run. */
export const RULE_SETS: CodeRuleSet[] = [ghanaBuildingCode];

/**
 * Runs a building code over a plan.
 *
 * `stories` defaults to 1, which is what the editor has always assumed. It is a
 * parameter now rather than a literal buried in the traversal, so multi-storey
 * schemes become a caller's decision instead of an engine limitation.
 */
export const validateFloorPlan = (
  floorPlan: FloorPlan | null,
  ruleSet: CodeRuleSet = DEFAULT_RULE_SET,
  stories = 1
): ValidationResult[] => (floorPlan ? runRuleSet(ruleSet, { floorPlan, stories }) : []);
