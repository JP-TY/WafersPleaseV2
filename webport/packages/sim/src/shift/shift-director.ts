/**
 * Shift state machine — the 7-phase core loop (GDD §5).
 *
 *   Briefing → Inspection → Break → Review → EndOfDay → Debrief → Complete
 *
 * The machine consumes a generated lot, presents wafers one at a time, applies
 * the disposition evaluator to each stamp, accumulates the shift ledger, ticks
 * the CMP safety brake, and ends with the dual-gate evaluation and the §11
 * debrief report.
 *
 * Determinism: the same seed + the same sequence of player actions always
 * produces the same lot, the same outcomes, and the same final score. That is
 * the GDD §16 "identical procedural lot seeds generate identical performance
 * scores" requirement.
 */

import { generateLot, projectWafer } from '../generation/lot-generator.js';
import {
  INITIAL_STATION_STATE,
  armCmpBrake,
  tickCmpBrake,
  type EffectiveWafer,
  type LatentLot,
  type StationState,
} from '../generation/wafer.js';
import {
  evaluateDisposition,
  correctActionFor,
  classifyWaferMode,
  modeClassifiedCorrectly,
  toolCanResolve,
} from '../evaluation/disposition.js';
import { scoreDisposition, evaluateGate, scoringTableFromConfig, type ScoringTable } from '../evaluation/scoring.js';
import { ShiftLedger, buildDebrief, type CompetencyMetrics, type DebriefReport } from '../assessment/metrics.js';
import type { ActionPath, DayConfig, DefectProfile, RuleMatrix, ScoringConfig, ToolType } from '@wafers/data';
import type { PlayerAction } from '../evaluation/disposition.js';

export const SHIFT_PHASES_ORDER = [
  'Briefing',
  'Inspection',
  'Break',
  'Review',
  'EndOfDay',
  'Debrief',
  'Complete',
] as const;
export type ShiftPhaseName = (typeof SHIFT_PHASES_ORDER)[number];

export interface ShiftInputs {
  readonly day: DayConfig;
  readonly defects: readonly DefectProfile[];
  readonly ruleMatrix: RuleMatrix;
  readonly scoring: ScoringConfig | null;
  readonly seed: number;
}

export interface WaferPresentation {
  readonly index: number;
  readonly routingStep: EffectiveWafer['routingStep'];
  readonly requiredMetrology: readonly ToolType[];
  readonly totalWafers: number;
  /** Active defects, for the metrology instruments to render. */
  readonly defectCount: number;
  /** Salary and competency so far. */
  readonly salarySoFar: number;
  readonly correctSoFar: number;
}

export interface StampResult {
  readonly outcome: ReturnType<typeof evaluateDisposition>['outcome'];
  readonly correctAction: ActionPath;
  readonly falseAcceptSeverity: ReturnType<typeof evaluateDisposition>['falseAcceptSeverity'];
  readonly salaryDelta: number;
  readonly competencyDelta: number;
  readonly complianceStrikes: number;
  /** True when this wafer needs a rework minigame next. */
  readonly needsRework: boolean;
  readonly reworkDefectType: string | null;
}

/** The rework outcome for a wafer the player chose to rework. */
export type ReworkResolution = { success: boolean; quality: number };

const WAFER_SECONDS_DEFAULT = 30;

export class ShiftDirector {
  readonly lot: LatentLot;
  readonly day: DayConfig;
  readonly scoring: ScoringTable;

  private station: StationState = INITIAL_STATION_STATE;
  private phase: ShiftPhaseName = 'Briefing';
  private waferIndex = -1;
  private readonly ledger = new ShiftLedger();
  private readonly inputs: ShiftInputs;
  private readonly pendingRework = new Set<number>();

  constructor(inputs: ShiftInputs) {
    this.inputs = inputs;
    this.day = inputs.day;
    this.scoring = scoringTableFromConfig(inputs.scoring);
    this.lot = generateLot({ day: inputs.day, defects: inputs.defects, seed: inputs.seed });
  }

  get currentPhase(): ShiftPhaseName {
    return this.phase;
  }

  get metrics(): CompetencyMetrics {
    return this.ledger.metrics();
  }

  get brakeWafersRemaining(): number {
    return this.station.cmpBrakeWafersRemaining;
  }

  get wafersCompleted(): number {
    return this.ledger.count;
  }

  get totalWafers(): number {
    return this.lot.wafers.length;
  }

  /** Begin the shift: Briefing -> Inspection. */
  beginShift(): void {
    if (this.phase !== 'Briefing') throw new Error(`cannot begin from ${this.phase}`);
    this.phase = 'Inspection';
  }

  /** The effective wafer currently being inspected, or null between wafers. */
  private effectiveAt(index: number): EffectiveWafer {
    const latent = this.lot.wafers[index];
    if (!latent) throw new Error(`no wafer at index ${index}`);
    return projectWafer(latent, this.station);
  }

  /** The effective wafer currently under inspection, or null between wafers. */
  currentWafer(): EffectiveWafer | null {
    if (this.waferIndex < 0) return null;
    return this.effectiveAt(this.waferIndex);
  }

  /** Present the next wafer for inspection. */
  presentNextWafer(): WaferPresentation | null {
    if (this.phase !== 'Inspection') return null;
    const next = this.waferIndex + 1;
    if (next >= this.lot.wafers.length) return null;
    this.waferIndex = next;
    const eff = this.effectiveAt(next);
    return {
      index: next,
      routingStep: eff.routingStep,
      requiredMetrology: eff.requiredMetrology,
      totalWafers: this.lot.wafers.length,
      defectCount: eff.activeDefectCount,
      salarySoFar: this.ledger.metrics().totals.salaryTotal,
      correctSoFar: this.ledger.metrics().totals.correct,
    };
  }

  /** The player stamps the current wafer. */
  stampWafer(action: PlayerAction, toolsUsed: readonly ToolType[], durationSeconds = WAFER_SECONDS_DEFAULT): StampResult {
    if (this.phase !== 'Inspection') throw new Error(`cannot stamp during ${this.phase}`);
    if (this.waferIndex < 0) throw new Error('no wafer presented');

    const eff = this.effectiveAt(this.waferIndex);
    const result = evaluateDisposition({
      wafer: eff,
      ruleMatrix: this.inputs.ruleMatrix,
      playerAction: action,
      toolsUsed,
      defectClasses: eff.defects.filter((d) => !d.masked).map((d) => d.defectClass),
    });
    const score = scoreDisposition(result, this.scoring);

    const correctAction = correctActionFor(eff, this.inputs.ruleMatrix);
    const activeDefects = eff.defects.filter((d) => !d.masked);
    const needsRework = action === 'Rework' && correctAction === 'Rework' && activeDefects.length > 0;
    const reworkDefectType = needsRework ? activeDefects[0]!.defectType : null;

    // Failure-mode classification (GDD §3) and diagnostic-tool recall (GDD §11)
    // are separate signals from the disposition outcome, so they are computed
    // here rather than inferred later from the outcome.
    const mode = classifyWaferMode(activeDefects.map((d) => d.defectClass));
    const modeCorrect = modeClassifiedCorrectly(mode, action);
    // Recall is only meaningful when there is something to have missed: on a
    // clean wafer no tool could have helped, so record null rather than credit.
    const toolAppropriate =
      activeDefects.length === 0
        ? null
        : toolsUsed.some((t) => activeDefects.some((d) => toolCanResolve(t, d.defectType)));

    if (needsRework) this.pendingRework.add(this.waferIndex);

    this.ledger.record({
      index: this.waferIndex,
      routingStep: eff.routingStep,
      result,
      correctAction,
      defectClasses: activeDefects.map((d) => d.defectClass),
      durationSeconds,
      salaryDelta: score.salaryDelta,
      competencyDelta: score.competencyDelta,
      complianceStrikes: score.complianceStrikes,
      requiredChecks: eff.requiredMetrology.length,
      reworkAttempted: action === 'Rework',
      reworkSucceeded: needsRework ? null : action === 'Rework' ? false : null,
      modeClassifiedCorrectly: modeCorrect,
      diagnosticToolAppropriate: toolAppropriate,
    });

    this.station = tickCmpBrake(this.station);

    return {
      outcome: result.outcome,
      correctAction,
      falseAcceptSeverity: result.falseAcceptSeverity,
      salaryDelta: score.salaryDelta,
      competencyDelta: score.competencyDelta,
      complianceStrikes: score.complianceStrikes,
      needsRework,
      reworkDefectType,
    };
  }

  /** Record the outcome of a rework minigame for the current wafer. */
  resolveRework(waferIndex: number, outcome: ReworkResolution): void {
    if (!this.pendingRework.has(waferIndex)) throw new Error(`no pending rework for wafer ${waferIndex}`);
    this.pendingRework.delete(waferIndex);

    const rec = this.ledger.get(waferIndex);
    if (!rec) throw new Error(`no ledger record for wafer ${waferIndex}`);

    // The disposition call and the rework execution are independent economic
    // events, summed. stampWafer already credited the correct Rework call; the
    // resolution adjusts that record additively rather than replacing it, which
    // is what the earlier replace-with-a-fresh-delta version got wrong (it
    // silently threw the correct-call reward away).
    //
    //  - success: the wafer is salvaged. A salvage bonus on top of the
    //    disposition reward, plus the rework competency bonus.
    //  - failure: the wafer is scrapped despite the correct call. The scrap
    //    cost is subtracted; the disposition call itself stays 'Correct'
    //    (it WAS the right call) and is not re-labelled.
    const salvageBonus = this.scoring.baseSalaryPerWafer * 0.5;
    const reworkScrapPenalty = this.scoring.baseSalaryPerWafer * 3;

    this.ledger.replace(waferIndex, {
      ...rec,
      result: { ...rec.result, outcome: outcome.success ? 'Correct' : rec.result.outcome },
      salaryDelta: rec.salaryDelta + (outcome.success ? salvageBonus : -reworkScrapPenalty),
      competencyDelta:
        rec.competencyDelta + (outcome.success ? this.scoring.reworkSuccessCompetencyBonus : -this.scoring.incorrectCompetencyPenalty),
      reworkSucceeded: outcome.success,
      modeClassifiedCorrectly: rec.modeClassifiedCorrectly,
      diagnosticToolAppropriate: rec.diagnosticToolAppropriate,
    });
  }

  /** Arm the CMP safety brake after a successful calibration (GDD §8C). */
  applyCmpBrake(wafers = 5): void {
    this.station = armCmpBrake(this.station, wafers);
  }

  /** Move Inspection -> Break -> Review once the last wafer is dispositioned. */
  private maybeEndInspection(): void {
    if (this.phase !== 'Inspection') return;
    if (this.ledger.count >= this.lot.wafers.length && this.pendingRework.size === 0) {
      this.phase = 'Break';
    }
  }

  /** Advance through the terminal phases. */
  advancePhase(): void {
    this.maybeEndInspection();
    const order: readonly ShiftPhaseName[] = SHIFT_PHASES_ORDER;
    const i = order.indexOf(this.phase);
    if (i < 0 || i >= order.length - 1) throw new Error(`cannot advance from ${this.phase}`);
    if (this.phase === 'Inspection') {
      // Only allowed to leave Inspection once every wafer is dispositioned.
      if (this.ledger.count < this.lot.wafers.length) {
        throw new Error('cannot end shift with wafers remaining');
      }
    }
    this.phase = order[i + 1]!;
  }

  /** End-of-shift gate + debrief. Call once phase reaches 'EndOfDay' or 'Debrief'. */
  completeShift(): { gate: ReturnType<typeof evaluateGate>; debrief: DebriefReport } {
    if (this.ledger.count < this.lot.wafers.length) {
      throw new Error('cannot complete shift with wafers remaining');
    }
    const metrics = this.ledger.metrics();
    const gate = evaluateGate(
      metrics.totals.salaryTotal,
      metrics.competencyScore,
      this.day.salaryTarget,
      this.day.competencyTarget,
    );
    const debrief = buildDebrief(metrics, this.day.salaryTarget, this.day.competencyTarget);
    this.phase = 'Complete';
    return { gate, debrief };
  }
}
