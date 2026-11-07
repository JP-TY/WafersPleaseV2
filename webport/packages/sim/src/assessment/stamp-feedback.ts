/**
 * Stamp feedback (GDD §7 / §11 teaching loop).
 *
 * A wrong stamp used to debit salary with no explanation. The authored
 * `ruleText` already names the defect and the correct disposition — this
 * module surfaces that text from simulation state alone so presentation can
 * print it on the traveler without grading from physics.
 */

import type { ActionPath, RuleMatrix } from '@wafers/data';
import {
  defectTypeToId,
  type DispositionOutcome,
  type DispositionResult,
  type PlayerAction,
} from '../evaluation/disposition.js';

export interface StampFeedback {
  readonly outcome: DispositionOutcome;
  /** True when the stamp matched the rule matrix. */
  readonly correct: boolean;
  readonly playerAction: PlayerAction;
  readonly correctAction: ActionPath;
  /** Active defect config ids on the wafer (empty when clean). */
  readonly defectIds: readonly string[];
  /**
   * Authored rule text for the primary defect that justified the correct
   * action. Null on a clean wafer stamped correctly, or when no rule matches.
   */
  readonly ruleText: string | null;
  /** Salary delta already applied for this stamp (includes compliance). */
  readonly penaltyApplied: number;
  /** One-sentence coaching the traveler / callout can print verbatim. */
  readonly reasoning: string;
  /** Required tools the player never ran. */
  readonly complianceMissed: readonly string[];
}

/**
 * Build teaching feedback for one stamp from the disposition result and the
 * day's rule matrix. Pure: identical inputs always yield identical feedback.
 */
export function buildStampFeedback(
  result: DispositionResult,
  ruleMatrix: RuleMatrix,
  salaryDelta: number,
): StampFeedback {
  const correct = result.outcome === 'Correct';
  const defectIds = result.defectTypes.map(defectTypeToId);
  const primaryId = primaryDefectId(result, ruleMatrix);
  const rule = primaryId ? ruleMatrix.rules.find((r) => r.defect === primaryId) : undefined;
  const ruleText = rule?.ruleText?.trim() ? rule.ruleText : null;

  return {
    outcome: result.outcome,
    correct,
    playerAction: result.playerAction,
    correctAction: result.correctAction,
    defectIds,
    ruleText,
    penaltyApplied: salaryDelta,
    reasoning: reasonFor(result, ruleText),
    complianceMissed: [...result.complianceStrikes],
  };
}

/**
 * The defect whose rule justified the correct action. Prefer a defect whose
 * `correctAction` matches the wafer's correct action; fall back to the first
 * active defect.
 */
function primaryDefectId(result: DispositionResult, ruleMatrix: RuleMatrix): string | null {
  if (result.wasClean || result.defectTypes.length === 0) return null;
  const ids = result.defectTypes.map(defectTypeToId);
  const ranked = ids.find((id) => {
    const rule = ruleMatrix.rules.find((r) => r.defect === id);
    return rule?.correctAction === result.correctAction;
  });
  return ranked ?? ids[0] ?? null;
}

function reasonFor(result: DispositionResult, ruleText: string | null): string {
  if (result.outcome === 'Correct') {
    if (result.wasClean) return 'Clean wafer routed correctly.';
    return ruleText ?? `Correct ${result.correctAction.toUpperCase()} call.`;
  }

  const stamped = result.playerAction.toUpperCase();
  const needed = result.correctAction.toUpperCase();

  if (result.outcome === 'FalseAccept') {
    const kind = result.falseAcceptSeverity === 'killer' ? 'killer' : 'parametric';
    const lead = `False accept on a ${kind} defect — should have been ${needed}.`;
    return ruleText ? `${lead} ${ruleText}` : lead;
  }
  if (result.outcome === 'FalseReject') {
    const lead = result.wasClean
      ? 'False reject: the wafer was clean.'
      : `False reject: this wafer needed ${needed}, not REJECT.`;
    return ruleText ? `${lead} ${ruleText}` : lead;
  }
  // WastedRework
  const lead = `Improper rework: stamped ${stamped}, correct call was ${needed}.`;
  return ruleText ? `${lead} ${ruleText}` : lead;
}
