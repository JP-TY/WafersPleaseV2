import { describe, expect, it } from 'vitest';
import { evaluateDisposition } from '../src/evaluation/disposition.js';
import {
  scoreDisposition,
  competencyScore,
  evaluateGate,
  normalizeCompetencyTarget,
  DEFAULT_SCORING,
  COMPETENCY_WEIGHTS,
} from '../src/evaluation/scoring.js';
import {
  modeClassifiedCorrectly,
  classifyWaferMode,
  toolCanResolve,
  correctActionFor,
} from '../src/evaluation/disposition.js';
import { ShiftDirector } from '../src/shift/shift-director.js';
import { generateLot, projectWafer } from '../src/generation/lot-generator.js';
import { INITIAL_STATION_STATE } from '../src/generation/wafer.js';
import { ShiftLedger, buildDebrief } from '../src/assessment/metrics.js';
import type { EffectiveWafer } from '../src/generation/wafer.js';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig } from '@wafers/data';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const load = (f: string) => JSON.parse(readFileSync(path.join(CONFIG, f), 'utf8'));

const DEFECTS: DefectProfile[] = load('defects.json').defects;
const DAYS: DayConfig[] = load('days.json').days;
const RULES: RuleMatrix[] = load('rule-matrices.json').ruleMatrices;
const SCORING: ScoringConfig = load('scoring.json').scoring;
const RULE_D1 = RULES.find((r) => r.id === 'rule-matrix-day-1')!;
const RULE_D3 = RULES.find((r) => r.id === 'rule-matrix-day-3')!;

function wafer(defects: Array<Partial<EffectiveWafer['defects'][number]> & { defectType: string }>, routingStep: EffectiveWafer['routingStep'] = 'Substrate'): EffectiveWafer {
  const ds = defects.map((d) => ({
    defectClass: 'Catastrophic' as const,
    severity: 0.8,
    regionX: 0.5,
    regionY: 0.5,
    masked: false,
    ...d,
  })) as EffectiveWafer['defects'];
  return {
    index: 0,
    routingStep,
    defects: ds,
    requiredMetrology: ['StylusProfilometer', 'FourPointProbe'],
    activeDefectCount: ds.filter((d) => !d.masked).length,
  };
}

describe('correctActionFor (GDD §7 aggregation)', () => {
  it('clean wafer is Accept', () => {
    expect(correctActionFor(wafer([]), RULE_D1)).toBe('Accept');
  });

  it('a Reject defect dominates — wafer must be Rejected', () => {
    // BowingWarping is Reject in the Day 1 matrix.
    expect(correctActionFor(wafer([{ defectType: 'BowingWarping' }]), RULE_D1)).toBe('Reject');
  });

  it('Reject dominates Rework when both present', () => {
    expect(
      correctActionFor(
        wafer([{ defectType: 'BowingWarping' }, { defectType: 'SubstrateContamination' }]),
        RULE_D1,
      ),
    ).toBe('Reject');
  });

  it('a reworkable defect alone is Rework', () => {
    // SubstrateContamination is Rework in the Day 1 matrix.
    expect(correctActionFor(wafer([{ defectType: 'SubstrateContamination' }]), RULE_D1)).toBe('Rework');
  });

  it('masked defects do not count (CMP brake masked STI voids)', () => {
    const w = wafer([{ defectType: 'STIVoid', masked: true }], 'ShallowTrenchIsolation');
    expect(correctActionFor(w, RULE_D3)).toBe('Accept');
  });
});

describe('evaluateDisposition classification (GDD §10 ladder)', () => {
  const base = {
    ruleMatrix: RULE_D1,
    toolsUsed: ['StylusProfilometer' as const, 'FourPointProbe' as const],
    defectClasses: ['Catastrophic' as const],
  };

  it('Correct when the stamp matches the matrix', () => {
    const r = evaluateDisposition({ wafer: wafer([{ defectType: 'BowingWarping' }]), playerAction: 'Reject', ...base });
    expect(r.outcome).toBe('Correct');
  });

  it('FalseAccept when a scrap wafer is accepted', () => {
    const r = evaluateDisposition({ wafer: wafer([{ defectType: 'BowingWarping' }]), playerAction: 'Accept', ...base });
    expect(r.outcome).toBe('FalseAccept');
  });

  it('FalseAccept is killer when the missed defect is Catastrophic', () => {
    const r = evaluateDisposition({ wafer: wafer([{ defectType: 'BowingWarping', defectClass: 'Catastrophic' }]), playerAction: 'Accept', ...base });
    expect(r.falseAcceptSeverity).toBe('killer');
  });

  it('FalseAccept is parametric when the missed defect is Parametric', () => {
    const r = evaluateDisposition({ wafer: wafer([{ defectType: 'SubstrateContamination', defectClass: 'Parametric' }]), playerAction: 'Accept', ...base });
    expect(r.falseAcceptSeverity).toBe('parametric');
  });

  it('FalseReject when a clean wafer is rejected', () => {
    const r = evaluateDisposition({ wafer: wafer([]), playerAction: 'Reject', ...base });
    expect(r.outcome).toBe('FalseReject');
  });

  it('WastedRework when rework is applied to a scrap wafer', () => {
    const r = evaluateDisposition({ wafer: wafer([{ defectType: 'BowingWarping' }]), playerAction: 'Rework', ...base });
    expect(r.outcome).toBe('WastedRework');
  });

  it('flags a compliance strike for each unused required tool', () => {
    const r = evaluateDisposition({ wafer: wafer([]), playerAction: 'Accept', ...base, toolsUsed: ['StylusProfilometer'] });
    expect(r.complianceStrikes).toContain('FourPointProbe');
  });
});

describe('scoreDisposition penalties (GDD §10)', () => {
  const mk = (outcome: 'Correct' | 'FalseAccept' | 'FalseReject' | 'WastedRework', severity: 'killer' | 'parametric' | 'none' = 'none') => ({
    outcome,
    correctAction: 'Reject' as const,
    playerAction: 'Accept' as const,
    falseAcceptSeverity: severity,
    defectTypes: [],
    wasClean: false,
    complianceStrikes: [],
  });

  it('Correct pays base * bonus multiplier and gains competency', () => {
    const s = scoreDisposition(mk('Correct'), DEFAULT_SCORING);
    expect(s.salaryDelta).toBe(DEFAULT_SCORING.baseSalaryPerWafer * DEFAULT_SCORING.correctBonusMultiplier);
    expect(s.competencyDelta).toBeGreaterThan(0);
  });

  it('killer FalseAccept is the worst penalty', () => {
    const killer = scoreDisposition(mk('FalseAccept', 'killer'), DEFAULT_SCORING);
    const parametric = scoreDisposition(mk('FalseAccept', 'parametric'), DEFAULT_SCORING);
    const reject = scoreDisposition(mk('FalseReject'), DEFAULT_SCORING);
    expect(killer.salaryDelta).toBeLessThan(parametric.salaryDelta);
    expect(parametric.salaryDelta).toBeLessThan(reject.salaryDelta);
  });

  it('compliance strikes cost salary even on a correct stamp', () => {
    const clean = scoreDisposition(mk('Correct'), DEFAULT_SCORING);
    const striking = scoreDisposition({ ...mk('Correct'), complianceStrikes: ['StylusProfilometer'] }, DEFAULT_SCORING);
    expect(striking.salaryDelta).toBe(clean.salaryDelta - DEFAULT_SCORING.complianceStrikePenalty);
  });
});

describe('competencyScore (GDD §10 weighting)', () => {
  it('is 1 for a perfect shift', () => {
    expect(competencyScore({ dispositionAccuracy: 1, killerContainment: 1, metrologyOptimizationRate: 1, processCompliance: 1 })).toBe(1);
  });

  it('weights disposition accuracy at 0.50', () => {
    const s = competencyScore({ dispositionAccuracy: 0.8, killerContainment: 1, metrologyOptimizationRate: 1, processCompliance: 1 });
    expect(s).toBeCloseTo(0.5 * 0.8 + 0.5, 6);
  });

  it('is clamped to [0,1]', () => {
    expect(competencyScore({ dispositionAccuracy: 5, killerContainment: 5, metrologyOptimizationRate: 5, processCompliance: 5 })).toBe(1);
    expect(competencyScore({ dispositionAccuracy: -5, killerContainment: -5, metrologyOptimizationRate: -5, processCompliance: -5 })).toBe(0);
  });

  it('weights sum to 1', () => {
    const w = COMPETENCY_WEIGHTS;
    expect(w.dispositionAccuracy + w.killerContainment + w.metrologyOptimizationRate + w.processCompliance).toBeCloseTo(1, 10);
  });
});

describe('evaluateGate (dual gate, GDD §10)', () => {
  it('passes only when BOTH gates pass', () => {
    expect(evaluateGate(1000, 0.8, 500, 0.7).passed).toBe(true);
    expect(evaluateGate(1000, 0.5, 500, 0.7).passed).toBe(false);
    expect(evaluateGate(300, 0.8, 500, 0.7).passed).toBe(false);
    expect(evaluateGate(300, 0.5, 500, 0.7).passed).toBe(false);
  });

  it('reports each gate independently', () => {
    const g = evaluateGate(300, 0.8, 500, 0.7);
    expect(g.salaryPassed).toBe(false);
    expect(g.competencyPassed).toBe(true);
  });
});

const rec = (over: Partial<import('../src/assessment/metrics.js').WaferRecord>) => ({
    index: 0,
    routingStep: 'Substrate' as const,
    result: { outcome: 'Correct' as const, correctAction: 'Accept' as const, playerAction: 'Accept' as const, falseAcceptSeverity: 'none' as const, defectTypes: [], wasClean: true, complianceStrikes: [] },
    correctAction: 'Accept' as const,
    defectClasses: [],
    durationSeconds: 30,
    salaryDelta: 200,
    competencyDelta: 5,
    complianceStrikes: 0,
    requiredChecks: 2,
    reworkAttempted: false,
    reworkSucceeded: null,
    modeClassifiedCorrectly: true,
    diagnosticToolAppropriate: null,
    ...over,
  });

describe('ShiftLedger metrics (GDD §3 targets)', () => {

  it('computes disposition accuracy', () => {
    const l = new ShiftLedger();
    l.record(rec({ index: 0 }));
    l.record(rec({ index: 1, result: { ...rec({}).result, outcome: 'FalseAccept', falseAcceptSeverity: 'killer' }, defectClasses: ['Catastrophic'] }));
    const m = l.metrics();
    expect(m.dispositionAccuracy).toBe(0.5);
    expect(m.totals.correct).toBe(1);
  });

  it('computes killer false-accept rate against killers presented', () => {
    const l = new ShiftLedger();
    l.record(rec({ index: 0, defectClasses: ['Catastrophic'] }));
    l.record(rec({ index: 1, defectClasses: ['Catastrophic'], result: { ...rec({}).result, outcome: 'FalseAccept', falseAcceptSeverity: 'killer' } }));
    l.record(rec({ index: 2, defectClasses: ['Parametric'] }));
    const m = l.metrics();
    expect(m.killerFalseAcceptRate).toBe(0.5);
    expect(m.killerContainment).toBe(0.5);
  });

  it('computes process compliance against rework attempts', () => {
    const l = new ShiftLedger();
    l.record(rec({ index: 0, reworkAttempted: true, reworkSucceeded: true }));
    l.record(rec({ index: 1, reworkAttempted: true, reworkSucceeded: false }));
    l.record(rec({ index: 2 }));
    expect(l.metrics().processCompliance).toBe(0.5);
  });

  it('zero denominators yield 1 (nothing to fail at)', () => {
    const l = new ShiftLedger();
    const m = l.metrics();
    expect(m.dispositionAccuracy).toBe(1);
    expect(m.processCompliance).toBe(1);
  });

  it('breaks latency into front-end and back-end layers (GDD §11)', () => {
    const l = new ShiftLedger();
    l.record(rec({ index: 0, routingStep: 'Substrate', durationSeconds: 40 }));
    l.record(rec({ index: 1, routingStep: 'CopperDamascene', durationSeconds: 60 }));
    const m = l.metrics();
    expect(m.latencyByLayer.frontEnd).toBe(40);
    expect(m.latencyByLayer.backEnd).toBe(60);
  });
});

describe('buildDebrief (GDD §11)', () => {
  it('names the dominant failure mode as the headline', () => {
    const l = new ShiftLedger();
    l.record({
      index: 0,
      routingStep: 'CopperDamascene',
      result: { outcome: 'FalseAccept', correctAction: 'Reject', playerAction: 'Accept', falseAcceptSeverity: 'killer', defectTypes: ['TungstenPlugVoid'], wasClean: false, complianceStrikes: [] },
      correctAction: 'Reject',
      defectClasses: ['Catastrophic'],
      durationSeconds: 30,
      salaryDelta: -500,
      competencyDelta: -15,
      complianceStrikes: 0,
      requiredChecks: 1,
      reworkAttempted: false,
      reworkSucceeded: null,
      // A killer false-accept is by definition a mode-classification miss.
      modeClassifiedCorrectly: false,
      diagnosticToolAppropriate: false,
    });
    const report = buildDebrief(l.metrics(), 500, 0.7);
    expect(report.headline).toMatch(/killer/i);
    expect(report.lines.length).toBeGreaterThanOrEqual(4);
  });

  it('reports every §3 competency with a target', () => {
    const report = buildDebrief(new ShiftLedger().metrics(), 500, 0.7);
    const names = report.lines.map((l) => l.competency);
    expect(names).toContain('Disposition Accuracy');
    expect(names).toContain('Failure-Mode Identification');
    expect(names).toContain('Killer False-Accept Rate');
    expect(names).toContain('Process Compliance');
  });
});
describe('mode classification vs disposition accuracy (GDD §3)', () => {
  const baseRec = (over: Partial<import('../src/assessment/metrics.js').WaferRecord>) => rec(over);

  it('accepting a catastrophic wafer is a mode miss even when the wafer is otherwise clean-ish', () => {
    const l = new ShiftLedger();
    l.record(
      baseRec({
        index: 0,
        result: {
          outcome: 'FalseAccept',
          correctAction: 'Reject',
          playerAction: 'Accept',
          falseAcceptSeverity: 'killer',
          defectTypes: ['TungstenPlugVoid'],
          wasClean: false,
          complianceStrikes: [],
        },
        correctAction: 'Reject',
        defectClasses: ['Catastrophic'],
        modeClassifiedCorrectly: false,
      }),
    );
    expect(l.metrics().parametricVsCatastrophic).toBe(0);
    // And it must NOT be identical to disposition accuracy by construction.
    expect(l.metrics().dispositionAccuracy).toBe(0);
  });

  it('clean wafers are excluded from the classification denominator', () => {
    const l = new ShiftLedger();
    // One clean wafer, one correctly-classified catastrophic.
    l.record(baseRec({ index: 0, defectClasses: [], modeClassifiedCorrectly: true }));
    l.record(
      baseRec({
        index: 1,
        defectClasses: ['Catastrophic'],
        result: {
          outcome: 'Correct',
          correctAction: 'Reject',
          playerAction: 'Reject',
          falseAcceptSeverity: 'none',
          defectTypes: ['STIVoid'],
          wasClean: false,
          complianceStrikes: [],
        },
        correctAction: 'Reject',
        modeClassifiedCorrectly: true,
      }),
    );
    // 1 of 1 defected wafers classified, not 2 of 2 total wafers.
    expect(l.metrics().parametricVsCatastrophic).toBe(1);
  });

  it('diagnostic tool recall is null-safe on clean wafers and credits clean tools', () => {
    const l = new ShiftLedger();
    l.record(baseRec({ index: 0, defectClasses: [], diagnosticToolAppropriate: null }));
    l.record(baseRec({ index: 1, defectClasses: ['Catastrophic'], diagnosticToolAppropriate: true }));
    l.record(baseRec({ index: 2, defectClasses: ['Parametric'], diagnosticToolAppropriate: false }));
    // 1 hit of 2 defected wafers; the clean wafer is not in the denominator.
    expect(l.metrics().diagnosticToolRecall).toBe(0.5);
  });

  it('modeClassifiedCorrectly: only accepting a catastrophic wafer is a miss', () => {
    expect(modeClassifiedCorrectly('Catastrophic', 'Accept')).toBe(false);
    expect(modeClassifiedCorrectly('Catastrophic', 'Reject')).toBe(true);
    expect(modeClassifiedCorrectly('Catastrophic', 'Rework')).toBe(true);
    // A parametric miss is a yield-margin call, not a mode-blindness failure.
    expect(modeClassifiedCorrectly('Parametric', 'Accept')).toBe(true);
    expect(modeClassifiedCorrectly('Parametric', 'Reject')).toBe(true);
    expect(modeClassifiedCorrectly('clean', 'Accept')).toBe(true);
  });

  it('classifyWaferMode: catastrophic dominates a mixed-defect wafer', () => {
    expect(classifyWaferMode(['Parametric', 'Catastrophic'])).toBe('Catastrophic');
    expect(classifyWaferMode(['Parametric'])).toBe('Parametric');
    expect(classifyWaferMode([])).toBe('clean');
  });
});

describe('toolCanResolve: an instrument cannot see what it cannot measure', () => {
  it('a surface stylus cannot see an STI void', () => {
    expect(toolCanResolve('StylusProfilometer', 'STIVoid')).toBe(false);
  });
  it('an electron microscope cannot see substrate bow', () => {
    expect(toolCanResolve('ElectronMicroscope', 'BowingWarping')).toBe(false);
  });
  it('each defect has at least one instrument that can resolve it', () => {
    const all: Array<[Parameters<typeof toolCanResolve>[0], string]> = [
      ['StylusProfilometer', 'BowingWarping'],
      ['FourPointProbe', 'SubstrateContamination'],
      ['XRayRefractometry', 'InterfaceRoughness'],
      ['SpectroscopicEllipsometry', 'STIVoid'],
      ['ElectronMicroscope', 'SilicideBridging'],
      ['ElectronMicroscope', 'TungstenPlugVoid'],
    ];
    for (const [tool, defect] of all) {
      expect(toolCanResolve(tool, defect), `${tool} / ${defect}`).toBe(true);
    }
  });
});

describe('normalizeCompetencyTarget: the gate must be winnable', () => {
  it('treats a percentage target as a fraction', () => {
    expect(normalizeCompetencyTarget(70)).toBeCloseTo(0.7);
    expect(normalizeCompetencyTarget(85)).toBeCloseTo(0.85);
  });
  it('passes through a fraction target unchanged', () => {
    expect(normalizeCompetencyTarget(0.7)).toBe(0.7);
    expect(normalizeCompetencyTarget(1)).toBe(1);
  });
  it('a score of 0.7 passes a 70% target (the bug this fixes)', () => {
    const g = evaluateGate(999, 0.7, 500, 70);
    expect(g.competencyPassed).toBe(true);
    expect(g.passed).toBe(true);
  });
  it('a low score still fails a 70% target', () => {
    const g = evaluateGate(999, 0.4, 500, 70);
    expect(g.competencyPassed).toBe(false);
  });
  it('reports the normalised target so the debrief prints what it compares', () => {
    expect(evaluateGate(0, 0, 0, 70).competencyTarget).toBeCloseTo(0.7);
  });
  it('buildDebrief accepts a percentage target too', () => {
    const l = new ShiftLedger();
    l.record(rec({ index: 0, defectClasses: [], modeClassifiedCorrectly: true }));
    const r = buildDebrief(l.metrics(), 0, 70);
    expect(r.passed).toBe(true);
  });
});

describe('the three days are winnable with competent play', () => {
  /**
   * Play each day with a perfect oracle: run every available tool, stamp the
   * rule-matrix action, succeed at every rework.
   *
   * The point is a balance check, not a gameplay test. GDD §4 promises three
   * days a competent operator can certify on. If a day's salary/competency
   * targets are unreachable even with perfect play, the day is mis-tuned rather
   * than the player being bad -- and the previous ungated competencyTarget=70
   * bug hid exactly that, because every day failed for the same wrong reason.
   */
  function playPerfectDay(dayNumber: number): ReturnType<typeof buildDebrief> {
    const day = DAYS.find((x) => x.dayNumber === dayNumber)!;
    const ruleMatrix = RULES.find((x) => x.id === `rule-matrix-day-${dayNumber}`)!;
    const lot = generateLot({ day, defects: DEFECTS, seed: seedForDay(dayNumber) });

    const d = new ShiftDirector({ day, defects: DEFECTS, ruleMatrix, scoring: SCORING, seed: seedForDay(dayNumber) });
    d.beginShift();
    let p = d.presentNextWafer();
    while (p) {
      // The oracle: project the same wafer and read the correct action off it.
      const wafer = lot.wafers[p.index]!;
      const action = correctActionFor(projectWafer(wafer, INITIAL_STATION_STATE), ruleMatrix) as 'Accept' | 'Reject' | 'Rework';
      const r = d.stampWafer(action, day.availableTools);
      if (r.needsRework) d.resolveRework(p.index, { success: true, quality: 0.9 });
      p = d.presentNextWafer();
    }
    return d.completeShift().debrief;
  }

  for (const dayNumber of [1, 2, 3]) {
    it(`Day ${dayNumber} passes both gates under perfect play`, () => {
      const r = playPerfectDay(dayNumber);
      expect(
        r.passed,
        `Day ${dayNumber}: salary=${r.salaryTotal} competency=${r.competencyScore.toFixed(3)} headline=${r.headline}`,
      ).toBe(true);
    });
  }
});

/** A day seed, stable per day so the balance check is reproducible. */
function seedForDay(dayNumber: number): number {
  return 4242 + dayNumber * 101;
}

