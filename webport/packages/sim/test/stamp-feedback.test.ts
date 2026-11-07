import { describe, expect, it } from 'vitest';
import { buildStampFeedback } from '../src/assessment/stamp-feedback.js';
import { evaluateDisposition } from '../src/evaluation/disposition.js';
import { ShiftDirector } from '../src/shift/shift-director.js';
import { generateLot } from '../src/generation/lot-generator.js';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig } from '@wafers/data';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EffectiveWafer } from '../src/generation/wafer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const load = (f: string) => JSON.parse(readFileSync(path.join(CONFIG, f), 'utf8'));

const DEFECTS: DefectProfile[] = load('defects.json').defects;
const DAYS: DayConfig[] = load('days.json').days;
const RULES: RuleMatrix[] = load('rule-matrices.json').ruleMatrices;
const SCORING: ScoringConfig = load('scoring.json').scoring;
const DAY1 = DAYS.find((d) => d.dayNumber === 1)!;
const RULE_D1 = RULES.find((r) => r.id === 'rule-matrix-day-1')!;

function waferWith(defectType: string | null): EffectiveWafer {
  const defects =
    defectType === null
      ? []
      : [
          {
            defectType,
            defectClass: defectType === 'SubstrateContamination' ? ('Parametric' as const) : ('Catastrophic' as const),
            severity: 0.85,
            regionX: 0.5,
            regionY: 0.5,
            masked: false,
          },
        ];
  return {
    index: 0,
    routingStep: 'Substrate',
    defects,
    requiredMetrology: ['StylusProfilometer', 'FourPointProbe'],
    activeDefectCount: defects.length,
  };
}

describe('buildStampFeedback', () => {
  it('returns the authored ruleText verbatim for a known defect', () => {
    const result = evaluateDisposition({
      wafer: waferWith('BowingWarping'),
      ruleMatrix: RULE_D1,
      playerAction: 'Accept',
      toolsUsed: ['StylusProfilometer', 'FourPointProbe'],
      defectClasses: ['Catastrophic'],
    });
    const fb = buildStampFeedback(result, RULE_D1, -500);
    expect(fb.correct).toBe(false);
    expect(fb.ruleText).toBe(
      'Bow/warp beyond flatness spec pushes the surface outside high-NA depth-of-focus. Irreversible structural deformation: REJECT.',
    );
    expect(fb.reasoning).toContain(fb.ruleText!);
    expect(fb.penaltyApplied).toBe(-500);
  });

  it('a correct stamp is marked correct and still carries rule text for defects', () => {
    const result = evaluateDisposition({
      wafer: waferWith('SubstrateContamination'),
      ruleMatrix: RULE_D1,
      playerAction: 'Rework',
      toolsUsed: ['StylusProfilometer', 'FourPointProbe'],
      defectClasses: ['Parametric'],
    });
    const fb = buildStampFeedback(result, RULE_D1, 100);
    expect(fb.correct).toBe(true);
    expect(fb.ruleText).toContain('REWORK (RCA clean)');
  });

  it('identical seeded wrong stamps produce identical feedback', () => {
    const mk = () => {
      const d = new ShiftDirector({
        day: DAY1,
        defects: DEFECTS,
        ruleMatrix: RULE_D1,
        scoring: SCORING,
        seed: 7,
      });
      d.beginShift();
      d.presentNextWafer();
      return d.stampWafer('Accept', DAY1.availableTools).feedback;
    };
    expect(mk()).toEqual(mk());
  });
});

describe('rework reachability guarantee', () => {
  it('every Day 1 seed in 1..60 has at least one reworkable wafer', () => {
    const reworkTypes = new Set(
      DEFECTS.filter((d) => DAY1.allowedDefects.includes(d.id) && d.defaultAction === 'Rework').map(
        (d) => d.defectType,
      ),
    );
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lot = generateLot({ day: DAY1, defects: DEFECTS, seed });
      const ok = lot.wafers.some((w) => w.latentDefects.some((d) => reworkTypes.has(d.defectType)));
      if (ok) hits++;
    }
    expect(hits).toBe(60);
  });

  it('Day 2 lots include at least one reworkable wafer across 60 seeds', () => {
    const day2 = DAYS.find((d) => d.dayNumber === 2)!;
    const reworkTypes = new Set(
      DEFECTS.filter((d) => day2.allowedDefects.includes(d.id) && d.defaultAction === 'Rework').map(
        (d) => d.defectType,
      ),
    );
    expect(reworkTypes.size, 'Day 2 must author a Rework-class defect').toBeGreaterThan(0);
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lot = generateLot({ day: day2, defects: DEFECTS, seed });
      if (lot.wafers.some((w) => w.latentDefects.some((d) => reworkTypes.has(d.defectType)))) hits++;
    }
    expect(hits).toBe(60);
  });

  it('Day 3 lots include at least one reworkable wafer across 60 seeds', () => {
    const day3 = DAYS.find((d) => d.dayNumber === 3)!;
    const reworkTypes = new Set(
      DEFECTS.filter((d) => day3.allowedDefects.includes(d.id) && d.defaultAction === 'Rework').map(
        (d) => d.defectType,
      ),
    );
    expect(reworkTypes.size, 'Day 3 must author a Rework-class defect (silicide)').toBeGreaterThan(0);
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const lot = generateLot({ day: day3, defects: DEFECTS, seed });
      if (lot.wafers.some((w) => w.latentDefects.some((d) => reworkTypes.has(d.defectType)))) hits++;
    }
    expect(hits).toBe(60);
  });
});
