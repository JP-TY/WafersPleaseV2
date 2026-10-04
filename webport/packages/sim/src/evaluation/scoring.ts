/**
 * Scoring engine + dual-gate (GDD §10).
 *
 * Every wafer the player dispositions moves salary and competency. At the end
 * of the shift BOTH gates must pass:
 *
 *   Salary_Total     >= the day's salary target
 *   Competency_Score >= the day's competency target
 *
 * The dual gate is the GDD's answer to two failure modes: a reckless speed-run
 * (salary high, competency low — lots of fast, wrong stamps) and slow
 * perfectionism (competency high, salary low — too few wafers completed). One
 * number cannot catch both.
 *
 * The penalty ladder (GDD §10):
 *   False Accept (killer defect)   -> high penalty
 *   False Reject (clean wafer)     -> moderate penalty
 *   Process out-of-sequence        -> minor penalty (compliance strike)
 */

import type { DefectClass } from '@wafers/data';
import type { DispositionResult, FalseAcceptSeverity } from '../evaluation/disposition.js';
import type { ScoringConfig } from '@wafers/data';

/** Tunables for the economy. Sourced from config, never hardcoded in logic. */
export interface ScoringTable {
  readonly baseSalaryPerWafer: number;
  readonly correctBonusMultiplier: number;
  readonly falseAcceptKillerPenalty: number;
  readonly falseAcceptParametricPenalty: number;
  readonly falseRejectPenalty: number;
  readonly wastedReworkPenalty: number;
  readonly complianceStrikePenalty: number;
  readonly correctCompetencyGain: number;
  readonly incorrectCompetencyPenalty: number;
  readonly reworkSuccessCompetencyBonus: number;
}

/**
 * Default economy. Anchored to the converted `ScoringConfig` where a field maps
 * (base salary, correct bonus multiplier, competency gain/penalty); the
 * per-outcome penalty values come from the GDD §10 ladder, which the Unity
 * `ScoringConfigSO` did not carry.
 */
export const DEFAULT_SCORING: ScoringTable = {
  baseSalaryPerWafer: 100,
  correctBonusMultiplier: 2,
  // GDD §10: killer false-accept is the worst outcome in the game.
  falseAcceptKillerPenalty: 500,
  falseAcceptParametricPenalty: 250,
  // GDD §10: false reject wastes premium silicon.
  falseRejectPenalty: 200,
  wastedReworkPenalty: 120,
  // GDD §10: process out-of-sequence is a minor compliance strike.
  complianceStrikePenalty: 50,
  correctCompetencyGain: 5,
  incorrectCompetencyPenalty: 15,
  reworkSuccessCompetencyBonus: 8,
};

export interface WaferScore {
  readonly outcome: DispositionResult['outcome'];
  readonly salaryDelta: number;
  readonly competencyDelta: number;
  readonly complianceStrikes: number;
}

/** Score a single disposition. */
export function scoreDisposition(result: DispositionResult, table: ScoringTable = DEFAULT_SCORING): WaferScore {
  const strikes = result.complianceStrikes.length;
  const strikePenalty = strikes * table.complianceStrikePenalty;

  let salaryDelta = 0;
  let competencyDelta = 0;

  switch (result.outcome) {
    case 'Correct':
      salaryDelta = table.baseSalaryPerWafer * table.correctBonusMultiplier;
      competencyDelta = table.correctCompetencyGain;
      break;
    case 'FalseAccept':
      salaryDelta = -(result.falseAcceptSeverity === 'killer'
        ? table.falseAcceptKillerPenalty
        : table.falseAcceptParametricPenalty);
      competencyDelta = -table.incorrectCompetencyPenalty;
      break;
    case 'FalseReject':
      salaryDelta = -table.falseRejectPenalty;
      competencyDelta = -table.incorrectCompetencyPenalty;
      break;
    case 'WastedRework':
      salaryDelta = -table.wastedReworkPenalty;
      competencyDelta = -table.incorrectCompetencyPenalty * 0.5;
      break;
  }

  // Compliance strikes always cost salary, even on a correct stamp.
  salaryDelta -= strikePenalty;

  return {
    outcome: result.outcome,
    salaryDelta,
    competencyDelta,
    complianceStrikes: strikes,
  };
}

/** Competency metric per GDD §10: weighted blend of the four competencies. */
export interface CompetencyInputs {
  /** Disposition_Accuracy: correct stamps / total stamps. */
  readonly dispositionAccuracy: number;
  /** Killer_Containment: 1 - killer false-accept rate. */
  readonly killerContainment: number;
  /** Metrology_Optimization_Rate: 1 - (compliance strikes / required checks). */
  readonly metrologyOptimizationRate: number;
  /** Process_Compliance: successful reworks / rework attempts. */
  readonly processCompliance: number;
}

/**
 * Competency_Score in [0,1] per GDD §10 weighting:
 *   Disposition_Accuracy * 0.50 + Killer_Containment * 0.25 +
 *   Metrology_Optimization_Rate * 0.15 + Process_Compliance * 0.10
 */
export const COMPETENCY_WEIGHTS = {
  dispositionAccuracy: 0.5,
  killerContainment: 0.25,
  metrologyOptimizationRate: 0.15,
  processCompliance: 0.1,
} as const;

export function competencyScore(inputs: CompetencyInputs): number {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const w = COMPETENCY_WEIGHTS;
  return clamp(
    clamp(inputs.dispositionAccuracy) * w.dispositionAccuracy +
      clamp(inputs.killerContainment) * w.killerContainment +
      clamp(inputs.metrologyOptimizationRate) * w.metrologyOptimizationRate +
      clamp(inputs.processCompliance) * w.processCompliance,
  );
}

/** The dual gate for one day. */
export interface GateResult {
  readonly salaryTotal: number;
  readonly salaryTarget: number;
  readonly competencyScore: number;
  readonly competencyTarget: number;
  readonly salaryPassed: boolean;
  readonly competencyPassed: boolean;
  readonly passed: boolean;
}

export function evaluateGate(
  salaryTotal: number,
  competency: number,
  salaryTarget: number,
  competencyTarget: number,
): GateResult {
  const salaryPassed = salaryTotal >= salaryTarget;
  const competencyPassed = competency >= competencyTarget;
  return {
    salaryTotal,
    salaryTarget,
    competencyScore: competency,
    competencyTarget,
    salaryPassed,
    competencyPassed,
    passed: salaryPassed && competencyPassed,
  };
}

/** Convert the converted ScoringConfig into a ScoringTable. */
export function scoringTableFromConfig(config: ScoringConfig | null): ScoringTable {
  if (!config) return DEFAULT_SCORING;
  return {
    ...DEFAULT_SCORING,
    baseSalaryPerWafer: config.baseSalaryPerWafer,
    correctBonusMultiplier: config.correctBonusMultiplier,
    correctCompetencyGain: config.correctCompetencyGain,
    incorrectCompetencyPenalty: config.incorrectCompetencyPenalty,
  };
}

export type { FalseAcceptSeverity, DefectClass };
