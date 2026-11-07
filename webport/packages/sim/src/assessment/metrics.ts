/**
 * Shift ledger + competency metrics (GDD §3, §10, §11) + debrief report.
 *
 * Every disposition is recorded here. At the end of the shift the ledger
 * computes the four measurable competency targets the GDD §3 actually holds
 * the player to:
 *
 *   Disposition_Accuracy         >= 0.85 by Day 3
 *   Parametric vs Catastrophic   >= 0.80 correct failure-mode classification
 *   Killer False_Accept_Rate     <= 0.10 on killer defects
 *   Process_Compliance           >= 0.70 on multi-step reworks
 *
 * plus the two §11 analytics dimensions (Metrology_Optimization_Rate and
 * Latency_By_Layer), and folds them into the §10 weighted Competency_Score.
 */

import type { ActionPath } from '@wafers/data';
import type { DispositionResult } from '../evaluation/disposition.js';
import type { CompetencyInputs } from '../evaluation/scoring.js';
import { competencyScore, normalizeCompetencyTarget } from '../evaluation/scoring.js';
import type { ProcessLayer } from '../generation/wafer.js';

export interface WaferRecord {
  readonly index: number;
  readonly routingStep: ProcessLayer;
  readonly result: DispositionResult;
  readonly correctAction: ActionPath;
  /** Defect classes present (active). */
  readonly defectClasses: readonly string[];
  /** Wall-clock seconds spent on this wafer. */
  readonly durationSeconds: number;
  /** Salary and competency deltas. */
  readonly salaryDelta: number;
  readonly competencyDelta: number;
  /** Compliance strikes incurred. */
  readonly complianceStrikes: number;
  /** Required metrology checks for this routing step. */
  readonly requiredChecks: number;
  /** A rework was attempted on this wafer. */
  readonly reworkAttempted: boolean;
  readonly reworkSucceeded: boolean | null;
  /**
   * Whether the player correctly separated the wafer's failure MODE, independent
   * of whether the resulting ACTION was right.
   *
   * Stored (rather than recomputed from `result.outcome`) because outcome mixes
   * two different questions: "was this a clean wafer?" and "did the player treat
   * a catastrophic defect as merely parametric?". Reworking a contaminated
   * wafer (parametric) is `Correct` and was correctly classified; rejecting a
   * bowed wafer is `Correct` and was correctly classified. GDD §3 asks about the
   * second question alone.
   */
  readonly modeClassifiedCorrectly: boolean;
  /**
   * Whether the player used the RIGHT tool for the target defect — the evidence
   * class the diagnosis was drawn from. GDD §11 Metrology_Optimization_Rate.
   */
  readonly diagnosticToolAppropriate: boolean | null;
}

export interface CompetencyMetrics {
  /** correct stamps / total stamps. */
  readonly dispositionAccuracy: number;
  /** 1 - (killer false-accepts / killer defects presented). */
  readonly killerFalseAcceptRate: number;
  readonly killerContainment: number;
  /** Correctly separated parametric from catastrophic outcomes / total. */
  readonly parametricVsCatastrophic: number;
  /** 1 - (compliance strikes / required checks). */
  readonly metrologyOptimizationRate: number;
  /**
   * §11: fraction of defected wafers where at least one USED tool was actually
   * capable of resolving the defect present. The other half of metrology
   * optimization — compliance asks "did you run what was required", this asks
   * "could it see anything".
   */
  readonly diagnosticToolRecall: number;
  /** successful reworks / rework attempts. */
  readonly processCompliance: number;
  /** §11: seconds by routing-step family (front-end vs back-end). */
  readonly latencyByLayer: { frontEnd: number; backEnd: number };
  /** §10 weighted blend. */
  readonly competencyScore: number;
  readonly totals: {
    readonly wafers: number;
    readonly correct: number;
    readonly falseAccepts: number;
    readonly killerFalseAccepts: number;
    readonly falseRejects: number;
    readonly wastedReworks: number;
    readonly complianceStrikes: number;
    readonly reworkAttempts: number;
    readonly reworkSuccesses: number;
    readonly salaryTotal: number;
  };
}

/**
 * GDD §11 latency is split front-end vs back-end. Boundary is the gate stack:
 * everything through HighKMetalGate is front-end of line, everything after it
 * is back-end. Strain/silicide sits on the boundary — the Ti/TiN contacts are
 * formed in the FEOL/MEOL transition — so it counts as back-end, alongside the
 * copper damascene work it immediately precedes.
 */
const FRONT_END: readonly ProcessLayer[] = ['Substrate', 'ShallowTrenchIsolation', 'HighKMetalGate'];

export class ShiftLedger {
  private records: WaferRecord[] = [];

  record(rec: WaferRecord): void {
    this.records.push(rec);
  }

  /** Replace the record for a wafer index. Used when a rework resolves later. */
  replace(index: number, rec: WaferRecord): void {
    const i = this.records.findIndex((r) => r.index === index);
    if (i < 0) throw new Error(`no ledger record for wafer ${index}`);
    this.records[i] = rec;
  }

  get(index: number): WaferRecord | undefined {
    return this.records.find((r) => r.index === index);
  }

  get count(): number {
    return this.records.length;
  }

  get all(): readonly WaferRecord[] {
    return this.records;
  }

  /**
   * Fold the recorded wafers into the competency metrics.
   *
   * All rates are defined against their own denominators and clamped to [0,1]
   * by the caller; a zero denominator yields 1 (nothing to fail at).
   */
  metrics(): CompetencyMetrics {
    const rs = this.records;
    const total = rs.length;
    // Success ratios default to 1 when the denominator is empty; failure rates
    // must default to 0 (no killers presented ⇒ no killer false-accepts).
    const safeDiv = (a: number, b: number, empty = 1) => (b === 0 ? empty : a / b);

    const correct = rs.filter((r) => r.result.outcome === 'Correct').length;
    const falseAccepts = rs.filter((r) => r.result.outcome === 'FalseAccept').length;
    const killerFalseAccepts = rs.filter((r) => r.result.falseAcceptSeverity === 'killer').length;
    const falseRejects = rs.filter((r) => r.result.outcome === 'FalseReject').length;
    const wastedReworks = rs.filter((r) => r.result.outcome === 'WastedRework').length;
    const complianceStrikes = rs.reduce((a, r) => a + r.complianceStrikes, 0);
    const requiredChecks = rs.reduce((a, r) => a + r.requiredChecks, 0);
    const reworkAttempts = rs.filter((r) => r.reworkAttempted).length;
    const reworkSuccesses = rs.filter((r) => r.reworkSucceeded === true).length;
    const salaryTotal = rs.reduce((a, r) => a + r.salaryDelta, 0);

    // Killer defects presented = wafers that had any Catastrophic defect.
    const killerPresented = rs.filter((r) => r.defectClasses.includes('Catastrophic')).length;
    const killerFalseAcceptRate = safeDiv(killerFalseAccepts, killerPresented, 0);

    // Failure-mode identification (GDD §3): did the player correctly treat
    // catastrophic defects as catastrophic, and parametric defects as merely
    // parametric? Computed per wafer and scored against wafers that actually
    // carried a defect — there is no mode to classify on a clean wafer, and
    // folding those in would let a player pass by avoiding hard calls.
    const defectWafers = rs.filter((r) => r.defectClasses.length > 0);
    const modeCorrect = defectWafers.filter((r) => r.modeClassifiedCorrectly).length;
    const parametricVsCatastrophic = safeDiv(modeCorrect, defectWafers.length);

    // Diagnostic tool recall: of the wafers that carried a defect, how many were
    // diagnosed with a tool capable of resolving it. A `null` means no defect,
    // which is neither a hit nor a miss.
    const diagnosed = rs.filter((r) => r.diagnosticToolAppropriate !== null);
    const toolHits = diagnosed.filter((r) => r.diagnosticToolAppropriate === true).length;
    const diagnosticToolRecall = safeDiv(toolHits, diagnosed.length);

    const frontEnd = rs.filter((r) => FRONT_END.includes(r.routingStep)).reduce((a, r) => a + r.durationSeconds, 0);
    const backEnd = rs.filter((r) => !FRONT_END.includes(r.routingStep)).reduce((a, r) => a + r.durationSeconds, 0);

    const inputs: CompetencyInputs = {
      dispositionAccuracy: safeDiv(correct, total),
      killerContainment: 1 - killerFalseAcceptRate,
      metrologyOptimizationRate: 1 - Math.min(1, safeDiv(complianceStrikes, requiredChecks)),
      processCompliance: safeDiv(reworkSuccesses, reworkAttempts),
    };

    return {
      dispositionAccuracy: inputs.dispositionAccuracy,
      killerFalseAcceptRate,
      killerContainment: inputs.killerContainment,
      parametricVsCatastrophic,
      metrologyOptimizationRate: inputs.metrologyOptimizationRate,
      diagnosticToolRecall,
      processCompliance: inputs.processCompliance,
      latencyByLayer: { frontEnd, backEnd },
      competencyScore: competencyScore(inputs),
      totals: {
        wafers: total,
        correct,
        falseAccepts,
        killerFalseAccepts,
        falseRejects,
        wastedReworks,
        complianceStrikes,
        reworkAttempts,
        reworkSuccesses,
        salaryTotal,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Debrief report (GDD §11)
// ---------------------------------------------------------------------------

export interface DebriefLine {
  readonly competency: string;
  readonly value: number;
  readonly target: number;
  readonly passed: boolean;
  /** Plain-language capture of the dominant error, or a strength. */
  readonly note: string;
  /** Recommended remediation, from the dominant missed defect's config. */
  readonly remediation: string;
}

export interface DebriefReport {
  readonly lines: readonly DebriefLine[];
  readonly headline: string;
  readonly competencyScore: number;
  readonly salaryTotal: number;
  readonly passed: boolean;
}

const TARGETS = {
  dispositionAccuracy: 0.85,
  parametricVsCatastrophic: 0.8,
  killerFalseAcceptRate: 0.1,
  processCompliance: 0.7,
} as const;

/**
 * Build the §11 diagnostic sheet.
 *
 * Each tracked competency is a line with value / target / pass and a note in
 * the GDD's diagnostic language. The headline names the dominant failure mode.
 */
export function buildDebrief(m: CompetencyMetrics, salaryTarget: number, competencyTarget: number): DebriefReport {
  const lines: DebriefLine[] = [];
  const t = m.totals;

  lines.push({
    competency: 'Disposition Accuracy',
    value: m.dispositionAccuracy,
    target: TARGETS.dispositionAccuracy,
    passed: m.dispositionAccuracy >= TARGETS.dispositionAccuracy,
    note:
      m.dispositionAccuracy >= TARGETS.dispositionAccuracy
        ? `Clean dispositions: ${t.correct} of ${t.wafers} wafers stamped correctly.`
        : `Only ${t.correct} of ${t.wafers} wafers stamped correctly (${t.falseAccepts} false accepts, ${t.falseRejects} false rejects).`,
    remediation: 'Re-read the rule matrix before the next lot; verify each stamp against the traveler.',
  });

  lines.push({
    competency: 'Failure-Mode Identification',
    value: m.parametricVsCatastrophic,
    target: TARGETS.parametricVsCatastrophic,
    passed: m.parametricVsCatastrophic >= TARGETS.parametricVsCatastrophic,
    note:
      m.parametricVsCatastrophic >= TARGETS.parametricVsCatastrophic
        ? 'Parametric speed drops and catastrophic open/short structures were reliably separated.'
        : `Operator frequently misidentified failure modes: only ${Math.round(m.parametricVsCatastrophic * 100)}% of defected wafers were correctly classified.`,
    remediation: 'Review Section 6 — parametric leakage vs. catastrophic short. The class matters more than the size.',
  });

  lines.push({
    competency: 'Killer False-Accept Rate',
    value: m.killerFalseAcceptRate,
    target: TARGETS.killerFalseAcceptRate,
    passed: m.killerFalseAcceptRate <= TARGETS.killerFalseAcceptRate,
    note:
      m.killerFalseAcceptRate <= TARGETS.killerFalseAcceptRate
        ? `Killer defects contained: ${t.killerFalseAccepts} slipped through.`
        : `${t.killerFalseAccepts} killer defect(s) passed downstream — open circuits and copper poisoning reached the fab.`,
    remediation: 'Slow down on Day 3 lots. Cross-check every Electron Microscope read against the routing card.',
  });

  lines.push({
    competency: 'Metrology Optimization',
    value: m.metrologyOptimizationRate,
    target: 0.9,
    passed: m.metrologyOptimizationRate >= 0.9,
    note:
      t.complianceStrikes === 0
        ? 'Every required metrology tool was invoked; no out-of-sequence checks.'
        : `${t.complianceStrikes} required metrology check(s) skipped across the lot.`,
    remediation: 'Run the full required metrology set for the routing step before stamping.',
  });

  // §11 Metrology Optimization is really two questions: did you run what was
  // required (compliance), and did you pick a tool that could see the defect
  // (diagnostic quality). Surface the second one separately, because a player
  // can satisfy the first while diagnosing from an instrument blind to the fault.
  const diagSeen = m.diagnosticToolRecall;
  lines.push({
    competency: 'Diagnostic Tool Selection',
    value: diagSeen,
    target: 0.85,
    passed: diagSeen >= 0.85,
    note:
      diagSeen >= 0.85
        ? 'Defects were diagnosed with instruments capable of resolving them.'
        : `${Math.round((1 - diagSeen) * 100)}% of defects were diagnosed without a tool that can see them (e.g. treating conductive Titanium bridging as benign surface variance).`,
    remediation:
      'Match the instrument to the failure mode: surface topography to the Stylus Probe, sub-surface fill to Ellipsometry, interfaces to X-Ray Refractometry, metallization cross-sections to the Electron Microscope.',
  });

  lines.push({
    competency: 'Process Compliance',
    value: m.processCompliance,
    target: TARGETS.processCompliance,
    passed: m.processCompliance >= TARGETS.processCompliance,
    note:
      t.reworkAttempts === 0
        ? 'No reworks attempted this shift.'
        : m.processCompliance >= TARGETS.processCompliance
          ? `${t.reworkSuccesses} of ${t.reworkAttempts} reworks completed cleanly.`
          : `${t.reworkAttempts - t.reworkSuccesses} of ${t.reworkAttempts} reworks failed — chemistry or timing was off.`,
    remediation: 'Practice the rework benches: bath temperature windows, C49 timing, endpoint calibration.',
  });

  const salaryPassed = t.salaryTotal >= salaryTarget;
  const competencyPassed = m.competencyScore >= normalizeCompetencyTarget(competencyTarget);
  const passed = salaryPassed && competencyPassed;

  // Headline: the single most damaging failure mode, or a strength.
  let headline: string;
  if (t.killerFalseAccepts > 0) {
    headline = 'Killer defects reached downstream — false accepts are the dominant error.';
  } else if (m.dispositionAccuracy < TARGETS.dispositionAccuracy) {
    headline = 'Disposition accuracy is the binding constraint on this shift.';
  } else if (!competencyPassed) {
    headline = 'Process competency is holding the gate, not speed.';
  } else if (!salaryPassed) {
    headline = 'Throughput is holding the gate — too few wafers completed.';
  } else {
    headline = 'Both gates passed. Strong, clean shift.';
  }

  return {
    lines,
    headline,
    competencyScore: m.competencyScore,
    salaryTotal: t.salaryTotal,
    passed,
  };
}
