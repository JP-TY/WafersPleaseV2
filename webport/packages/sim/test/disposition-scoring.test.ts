import { describe, expect, it } from 'vitest';
import { evaluateDisposition, correctActionFor } from '../src/evaluation/disposition.js';
import { scoreDisposition, competencyScore, evaluateGate, DEFAULT_SCORING, COMPETENCY_WEIGHTS } from '../src/evaluation/scoring.js';
import { ShiftLedger, buildDebrief } from '../src/assessment/metrics.js';
import type { EffectiveWafer } from '../src/generation/wafer.js';
import type { RuleMatrix } from '@wafers/data';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const RULES: RuleMatrix[] = JSON.parse(readFileSync(path.join(CONFIG, 'rule-matrices.json'), 'utf8')).ruleMatrices;
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

describe('ShiftLedger metrics (GDD §3 targets)', () => {
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
    ...over,
  });

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