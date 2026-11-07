/**
 * Disposition evaluator (GDD §7, §10).
 *
 * The player stamps a wafer Accept / Reject / Rework. This module decides
 * whether that was the correct call, and classifies the error when not. The
 * correct action comes from the rule matrix — the authoritative source, since
 * `defaultAction` and the stale `reworkAction` field in the defect profiles
 * both encode the same GDD disposition but `reworkAction` was a Unity default
 * bug on every Reject defect.
 *
 * Per-wafer resolution: Reject dominates Rework dominates Accept. A wafer with
 * any Reject-class defect is scrap no matter what else is on it; a wafer with a
 * reworkable defect and no fatal ones must be reworked; a clean wafer is
 * accepted. That matches the GDD §7 matrix's per-defect actions aggregated to
 * the wafer the player actually stamps.
 */

import type { ActionPath, DefectClass, ToolType } from '@wafers/data';
import type { RuleEntry, RuleMatrix } from '@wafers/data';
import type { EffectiveWafer } from '../generation/wafer.js';

/** The player's stamping decision. */
export type PlayerAction = 'Accept' | 'Reject' | 'Rework';

export const DISPOSITION_OUTCOMES = [
  /** Stamped the correct action. */
  'Correct',
  /** Accepted a wafer that should have been Rejected. Killer when the missed defect is Catastrophic. */
  'FalseAccept',
  /** Rejected a wafer that was clean or reworkable. */
  'FalseReject',
  /** Reworked a wafer that did not need it, wasting time and material. */
  'WastedRework',
] as const;
export type DispositionOutcome = (typeof DISPOSITION_OUTCOMES)[number];

/** Whether a FalseAccept killed a catastrophic defect (GDD §10 high penalty). */
export type FalseAcceptSeverity = 'none' | 'parametric' | 'killer';

export interface DispositionResult {
  readonly outcome: DispositionOutcome;
  readonly correctAction: ActionPath;
  readonly playerAction: PlayerAction;
  /** For FalseAccept, the class of the most severe missed defect. */
  readonly falseAcceptSeverity: FalseAcceptSeverity;
  /** Which defect types were present (active, unmasked), for the debrief. */
  readonly defectTypes: readonly string[];
  /** True when the wafer was clean (no active defects). */
  readonly wasClean: boolean;
  /** Any compliance strikes: the player never invoked a required tool. */
  readonly complianceStrikes: readonly string[];
}

/**
 * Which tools can actually resolve a given defect type (GDD §13, §11).
 *
 * This is the physical basis of "you cannot diagnose what you cannot see". Each
 * defect is characterised by the evidence it actually leaves:
 *
 *   Bowing/Warping            -> surface height. Only a stylus traces topography.
 *   Substrate contamination   -> sheet-resistance shift from a conductive film.
 *   Interface roughness       -> sub-surface density/roughness in the gate stack.
 *   STI void                  -> sub-surface optical density, invisible to a surface scan.
 *   Silicide bridging         -> a nanometre-scale filament, needs an electron beam.
 *   Tungsten plug void        -> an open circuit, only a cross-section resolves it.
 *
 * The config already names a single `requiredTool` per defect (that is what
 * enforces compliance). This is the broader set: tools that produce a genuinely
 * informative reading on that fault, some of which will not satisfy compliance.
 * Running the WRONG tool is not a compliance strike — it just cannot see the
 * defect, which is a different (and more instructive) failure.
 */
const RESOLVING_TOOLS: Record<string, readonly ToolType[]> = {
  BowingWarping: ['StylusProfilometer'],
  SubstrateContamination: ['FourPointProbe', 'StylusProfilometer'],
  InterfaceRoughness: ['XRayRefractometry', 'SpectroscopicEllipsometry'],
  STIVoid: ['SpectroscopicEllipsometry', 'XRayRefractometry'],
  SilicideBridging: ['ElectronMicroscope'],
  TungstenPlugVoid: ['ElectronMicroscope', 'FourPointProbe'],
};

/** Can this tool resolve this defect type at all? */
export function toolCanResolve(tool: ToolType, defectType: string): boolean {
  return RESOLVING_TOOLS[defectType]?.includes(tool) ?? false;
}

/**
 * Failure mode the wafer should be classified as (GDD §3).
 *
 * Catastrophic dominates: one open circuit or short makes the whole wafer
 * catastrophic regardless of any parametric drift riding along with it.
 */
export function classifyWaferMode(defectClasses: readonly DefectClass[]): DefectClass | 'clean' {
  if (defectClasses.includes('Catastrophic')) return 'Catastrophic';
  if (defectClasses.includes('Parametric')) return 'Parametric';
  return 'clean';
}

/**
 * Did the player treat the wafer's failure mode correctly?
 *
 * Deliberately NOT the same question as "was the action right". GDD §3 measures
 * the player's ability to separate parametric speed drops from catastrophic
 * open/short structures. Every action is legitimate for a given mode except one:
 *   - Accepting a catastrophic wafer is always a misclassification. It ships a
 *     short or an open circuit downstream.
 *   - Accepting a parametric wafer is a defensible call — it is a yield-margin
 *     miss, which is precisely what a parametric bin means, and the GDD has the
 *     player reject those anyway. It is not a failure of mode identification.
 *   - Rework or Reject are both correct mode handling in either direction.
 *
 * So mode classification fails exactly when a catastrophic defect is waved
 * through, which is also the GDD's most heavily penalised outcome. That keeps
 * the metric from double-counting the disposition-accuracy penalty.
 */
export function modeClassifiedCorrectly(
  mode: DefectClass | 'clean',
  playerAction: PlayerAction,
): boolean {
  if (mode === 'clean') return true;
  if (mode === 'Catastrophic') return playerAction !== 'Accept';
  return true;
}

/**
 * Compute the correct action for an effective wafer.
 *
 * Reads the rule matrix for each ACTIVE defect's correct action. Reject
 * dominates Rework dominates Accept. Masked defects (CMP brake) contribute
 * nothing.
 */
export function correctActionFor(wafer: EffectiveWafer, ruleMatrix: RuleMatrix): ActionPath {
  const rulesByDefect = new Map<string, RuleEntry>(ruleMatrix.rules.map((r) => [r.defect, r]));

  let best: ActionPath = 'Accept';
  const rank: Record<ActionPath, number> = { Accept: 0, Rework: 1, Reject: 2 };

  for (const defect of wafer.defects) {
    if (defect.masked) continue;
    // Look up by defect id -> defect type. The rule matrix is keyed by defect id.
    const rule = rulesByDefect.get(defectTypeToId(defect.defectType));
    const action: ActionPath = rule?.correctAction ?? 'Reject';
    if (rank[action] > rank[best]) best = action;
  }

  return best;
}

/**
 * Map a defect type back to its config id.
 *
 * The rule matrix references defects by config id (`sti-void`). Defects on the
 * wafer carry `DefectType` enum names (`STIVoid`). Kept in one place so a
 * naming change is a single edit.
 */
export function defectTypeToId(defectType: string): string {
  const map: Record<string, string> = {
    BowingWarping: 'bowing-warping',
    STIVoid: 'sti-void',
    InterfaceRoughness: 'interface-roughness',
    SilicideBridging: 'silicide-bridging',
    TungstenPlugVoid: 'tungsten-plug-void',
    SubstrateContamination: 'substrate-contamination',
  };
  return map[defectType] ?? defectType;
}

export interface DispositionInputs {
  readonly wafer: EffectiveWafer;
  readonly ruleMatrix: RuleMatrix;
  readonly playerAction: PlayerAction;
  /** Tools the player actually invoked on this wafer, for compliance. */
  readonly toolsUsed: readonly ToolType[];
  /** Defect classes of the active defects (for killer detection). */
  readonly defectClasses: readonly DefectClass[];
}

/**
 * Evaluate the player's stamp.
 */
export function evaluateDisposition(inputs: DispositionInputs): DispositionResult {
  const { wafer, playerAction, toolsUsed } = inputs;

  const correctAction = correctActionFor(wafer, inputs.ruleMatrix);
  const activeDefects = wafer.defects.filter((d) => !d.masked);
  const defectTypes = activeDefects.map((d) => d.defectType);
  const wasClean = activeDefects.length === 0;

  // Compliance: every required tool for the routing step must have been used.
  // GDD §10: bypassing a required metrology tool is a minor penalty.
  const complianceStrikes = wafer.requiredMetrology.filter((t) => !toolsUsed.includes(t));

  let outcome: DispositionOutcome;
  if (playerAction === correctAction) {
    outcome = 'Correct';
  } else if (playerAction === 'Accept' && (correctAction === 'Reject' || correctAction === 'Rework')) {
    outcome = 'FalseAccept';
  } else if (playerAction === 'Reject' && correctAction !== 'Reject') {
    outcome = 'FalseReject';
  } else {
    // Rework when the wafer was clean or scrap — wasted material and time.
    outcome = 'WastedRework';
  }

  // Killer detection: a FalseAccept is "killer" when the most severe missed
  // defect is Catastrophic (GDD §3 false-accept on killer defects ≤ 10%).
  let falseAcceptSeverity: FalseAcceptSeverity = 'none';
  if (outcome === 'FalseAccept') {
    const killer = activeDefects.some((d) => d.defectClass === 'Catastrophic');
    falseAcceptSeverity = killer ? 'killer' : 'parametric';
  }

  return {
    outcome,
    correctAction,
    playerAction,
    falseAcceptSeverity,
    defectTypes,
    wasClean,
    complianceStrikes,
  };
}
