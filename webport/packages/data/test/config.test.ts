import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConfigBundle,
  validateBundle,
  DEFECT_TYPES,
  TOOL_TYPES,
  type ConfigBundle as Bundle,
} from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(HERE, '../config');

function load(file: string): unknown {
  return JSON.parse(readFileSync(path.join(CONFIG_DIR, file), 'utf8'));
}

/** Indexed access that asserts existence — `noUncheckedIndexedAccess` is on. */
function at<T>(arr: readonly T[], i: number, what: string): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`expected ${what} at index ${i}, got ${arr.length} item(s)`);
  return v;
}

function bundleFromDisk(): Bundle {
  return ConfigBundle.parse({
    defects: (load('defects.json') as { defects: unknown[] }).defects,
    tools: (load('tools.json') as { tools: unknown[] }).tools,
    days: (load('days.json') as { days: unknown[] }).days,
    ruleMatrices: (load('rule-matrices.json') as { ruleMatrices: unknown[] }).ruleMatrices,
    rework: (load('rework.json') as { rework: unknown[] }).rework,
    scoring: (load('scoring.json') as { scoring: unknown }).scoring,
  });
}

describe('converted Unity config parses and validates', () => {
  const bundle = bundleFromDisk();
  const issues = validateBundle(bundle);

  it('has no validation errors', () => {
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors, JSON.stringify(errors, null, 2)).toHaveLength(0);
  });

  it('converted every asset that carried data', () => {
    expect(bundle.defects).toHaveLength(6);
    expect(bundle.tools).toHaveLength(5);
    expect(bundle.days).toHaveLength(3);
    expect(bundle.ruleMatrices).toHaveLength(3);
    expect(bundle.rework).toHaveLength(3);
    expect(bundle.scoring).not.toBeNull();
  });

  it('raises no warnings, because every asset is authored', () => {
    // The two empty Unity ReworkConfigSO assets used to warn on every run. They
    // are now authored (see scripts/authored-rework.mjs) and the silicide asset's
    // wrong `type` is corrected, so nothing is left unauthored to complain about.
    expect(issues.filter((i) => i.severity === 'warning')).toEqual([]);
  });
});

describe('enum ordinals were decoded to the right names', () => {
  const bundle = bundleFromDisk();

  // Guards the actual port risk: Unity serialized these positionally, so a
  // wrong table silently reassigns every defect to the wrong tool and action.
  // Expected values are cross-checked against the GDD disposition matrix
  // (section 7) and day progression (section 9).
  const EXPECTED: Record<string, { tool: string; action: string; cls: string }> = {
    'bowing-warping': { tool: 'StylusProfilometer', action: 'Reject', cls: 'Catastrophic' },
    'sti-void': { tool: 'SpectroscopicEllipsometry', action: 'Reject', cls: 'Catastrophic' },
    'interface-roughness': { tool: 'XRayRefractometry', action: 'Reject', cls: 'Parametric' },
    'silicide-bridging': { tool: 'ElectronMicroscope', action: 'Rework', cls: 'Catastrophic' },
    'tungsten-plug-void': { tool: 'ElectronMicroscope', action: 'Reject', cls: 'Catastrophic' },
    'substrate-contamination': { tool: 'FourPointProbe', action: 'Rework', cls: 'Parametric' },
  };

  for (const [id, want] of Object.entries(EXPECTED)) {
    it(`${id} -> ${want.tool} / ${want.action} / ${want.cls}`, () => {
      const d = bundle.defects.find((x) => x.id === id);
      expect(d, `missing defect ${id}`).toBeDefined();
      expect(d!.requiredTool).toBe(want.tool);
      expect(d!.defaultAction).toBe(want.action);
      expect(d!.defectClass).toBe(want.cls);
    });
  }

  it('covers every DefectType exactly once', () => {
    expect([...bundle.defects].map((d) => d.defectType).sort())
      .toEqual([...DEFECT_TYPES].sort());
  });

  it('covers every ToolType exactly once', () => {
    expect([...bundle.tools].map((t) => t.toolType).sort())
      .toEqual([...TOOL_TYPES].sort());
  });
});

describe('day progression matches the GDD', () => {
  const bundle = bundleFromDisk();
  const days = [...bundle.days].sort((a, b) => a.dayNumber - b.dayNumber);

  it('is Day 1 substrate, Day 2 gate stack, Day 3 interconnect', () => {
    expect(days.map((d) => d.id)).toEqual(['day-1-training', 'day-2-standard', 'day-3-certification']);
    expect([...at(days, 0, 'day 1').allowedDefects].sort()).toEqual(['bowing-warping', 'substrate-contamination']);
    expect([...at(days, 1, 'day 2').allowedDefects].sort()).toEqual(['interface-roughness', 'sti-void']);
    expect([...at(days, 2, 'day 3').allowedDefects].sort()).toEqual(['silicide-bridging', 'tungsten-plug-void']);
  });

  it('grants the tools the GDD lists per day', () => {
    expect([...at(days, 0, 'day 1').availableTools].sort()).toEqual(['FourPointProbe', 'StylusProfilometer']);
    expect([...at(days, 1, 'day 2').availableTools].sort()).toEqual(['SpectroscopicEllipsometry', 'XRayRefractometry']);
    expect(at(days, 2, 'day 3').availableTools).toEqual(['ElectronMicroscope']);
  });

  it('ramps difficulty down and volume up', () => {
    const [d1, d2, d3] = [at(days, 0, 'day 1'), at(days, 1, 'day 2'), at(days, 2, 'day 3')];
    expect(d1.defectDensity).toBeGreaterThan(d2.defectDensity);
    expect(d2.defectDensity).toBeGreaterThan(d3.defectDensity);
    expect(d1.wafersPerDay).toBeLessThan(d2.wafersPerDay);
    expect(d2.wafersPerDay).toBeLessThan(d3.wafersPerDay);
  });

  it('fades scaffolding per GDD §12, correcting the flat Unity boolean', () => {
    const [d1, d2, d3] = [at(days, 0, 'day 1'), at(days, 1, 'day 2'), at(days, 2, 'day 3')];
    expect(d1.calloutMode).toBe('Always');
    expect(d2.calloutMode).toBe('FirstOccurrencePerDefectClass');
    expect(d3.calloutMode).toBe('Disabled');
    // The raw Unity value is kept for provenance and is wrong on Day 3.
    expect(d3.showContextPrompts).toBe(true);
  });
});

describe('referential integrity', () => {
  const bundle = bundleFromDisk();

  it('every day defect is inspectable with a tool that day grants', () => {
    // validateBundle reports this, but assert directly so a regression names
    // the actual offending pair instead of a generic error count.
    for (const day of bundle.days) {
      for (const id of day.allowedDefects) {
        const profile = bundle.defects.find((d) => d.id === id)!;
        expect(day.availableTools, `${day.id} cannot inspect ${id}`).toContain(profile.requiredTool);
      }
    }
  });

  it('every rule-matrix entry resolves to a real defect', () => {
    const ids = new Set(bundle.defects.map((d) => d.id));
    for (const m of bundle.ruleMatrices) {
      for (const r of m.rules) expect(ids.has(r.defect), `${m.id} -> ${r.defect}`).toBe(true);
    }
  });

  it('rule-matrix actions agree with the defect default actions', () => {
    // A disagreement means the player is shown one correct answer by the
    // bulletin and another by the matrix.
    for (const m of bundle.ruleMatrices) {
      for (const r of m.rules) {
        const d = bundle.defects.find((x) => x.id === r.defect)!;
        expect(r.correctAction, `${m.id}/${r.defect}`).toBe(d.defaultAction);
      }
    }
  });

  it('has a rule for every defect each day allows', () => {
    const byId = new Map(bundle.ruleMatrices.map((m) => [m.id, m]));
    const matrixFor = ['rule-matrix-day-1', 'rule-matrix-day-2', 'rule-matrix-day-3'];
    [...bundle.days].sort((a, b) => a.dayNumber - b.dayNumber).forEach((day, i) => {
      const m = byId.get(matrixFor[i] ?? '');
      const ruled = new Set((m?.rules ?? []).map((r) => r.defect));
      for (const id of day.allowedDefects) {
        expect(ruled.has(id), `${day.id} allows ${id} but ${m?.id} has no rule`).toBe(true);
      }
    });
  });
});

describe('validation catches injected faults', () => {
  const good = bundleFromDisk();

  it('flags a dangling day defect reference', () => {
    const bad = structuredClone(good) as Bundle;
    at(bad.days, 0, 'day 1').allowedDefects.push('does-not-exist');
    expect(validateBundle(bad).some((i) => i.severity === 'error' && /unknown defect/.test(i.message))).toBe(true);
  });

  it('flags a day granting no tool for an allowed defect', () => {
    const bad = structuredClone(good) as Bundle;
    at(bad.days, 0, 'day 1').availableTools = ['FourPointProbe'];
    expect(validateBundle(bad).some((i) => i.severity === 'error' && /does not grant/.test(i.message))).toBe(true);
  });

  it('flags duplicate ids', () => {
    const bad = structuredClone(good) as Bundle;
    bad.defects.push(structuredClone(at(bad.defects, 0, 'first defect')));
    expect(validateBundle(bad).some((i) => i.severity === 'error' && /duplicate id/.test(i.message))).toBe(true);
  });

  it('flags non-ascending grade thresholds', () => {
    const bad = structuredClone(good) as Bundle;
    const scoring = bad.scoring;
    if (!scoring) throw new Error('expected ScoringConfig to be present');
    scoring.salaryGradeThresholds = [0, 900, 300];
    expect(validateBundle(bad).some((i) => i.severity === 'error' && /ascending/.test(i.message))).toBe(true);
  });
});
describe('rework recipes are authored, not placeholders (GDD §8)', () => {
  const bundle = bundleFromDisk();
  const byId = new Map(bundle.rework.map((r) => [r.id, r]));

  it('every rework type has exactly one config', () => {
    for (const t of ['RCAClean', 'SilicideWetEtch', 'CMPCalibration']) {
      const matches = bundle.rework.filter((r) => r.type === t);
      expect(matches.length, `${t} configs`).toBe(1);
    }
  });

  it('the silicide etch is typed SilicideWetEtch, not RCAClean', () => {
    // Unity serialised this asset as RCAClean, so a silicide-bridging wafer
    // opened the twin-tank wet bench. That is a wrong-bench bug, not a label.
    expect(byId.get('rework-silicide-wet-etch')?.type).toBe('SilicideWetEtch');
  });

  it('every rework carries a real procedure, not an empty shell', () => {
    for (const r of bundle.rework) {
      expect(r.instructionsText.length, `${r.id} instructions`).toBeGreaterThan(120);
      expect(r.idealTimingSeconds, `${r.id} ideal`).toBeGreaterThan(0);
      expect(r.toleranceWindowSeconds, `${r.id} tolerance`).toBeGreaterThan(0);
      expect(r.failurePenalty, `${r.id} penalty`).toBeGreaterThan(0);
      expect(r.steps.length, `${r.id} steps`).toBeGreaterThanOrEqual(3);
      expect(r.bench.key, `${r.id} bench`).toMatch(/^[A-C]$/);
      expect(r.bench.instrument.length, `${r.id} instrument`).toBeGreaterThan(10);
    }
  });

  it('step keys are unique within a recipe, because the sim matches on them', () => {
    for (const r of bundle.rework) {
      const keys = r.steps.map((s) => s.key);
      expect(new Set(keys).size, `${r.id} step keys`).toBe(keys.length);
    }
  });

  it('every step nominal dwell sits inside its own window', () => {
    for (const r of bundle.rework) {
      for (const s of r.steps) {
        expect(s.dwellSeconds.nominal, `${r.id}/${s.key}`).toBeGreaterThanOrEqual(s.dwellSeconds.min);
        expect(s.dwellSeconds.nominal, `${r.id}/${s.key}`).toBeLessThanOrEqual(s.dwellSeconds.max);
      }
    }
  });

  it('the RCA recipe has two chemically different baths and a rinse between them', () => {
    // The load-bearing GDD §8A rule: SC-1 then SC-2, in order, each at its own
    // temperature, with a megasonic rinse between. A recipe that lost the rinse
    // is not an RCA clean.
    const rca = byId.get('rework-rcaclean')!;
    const keys = rca.steps.map((s) => s.key);
    expect(keys).toEqual(['SC1', 'QDR1', 'SC2', 'QDR2']);

    const sc1 = rca.steps[0]!.targetC!;
    const sc2 = rca.steps[2]!.targetC!;
    // SC-2 is deliberately the cooler bath. Unity used one shared temperature.
    expect(sc2.nominal).toBeLessThan(sc1.nominal);
    expect(sc1.nominal).toBeGreaterThan(60);
    expect(rca.steps[0]!.chemistry).toContain('NH4OH');
    expect(rca.steps[2]!.chemistry).toContain('HCl');
  });

  it('the silicide recipe separates the strip window from the conversion anneal', () => {
    const sil = byId.get('rework-silicide-wet-etch')!;
    expect(sil.steps.map((s) => s.key)).toEqual(['RAMP', 'WASH', 'CONVERSION']);
    // The wash must come after the ramp (the film must exist) and before the
    // conversion (once C54 nucleates it is no longer strippable).
    expect(sil.steps[1]!.purpose.toLowerCase()).toContain('c49');
    expect(sil.steps[1]!.chemistry).toContain('NH4OH');
  });

  it('the CMP recipe ends by engaging the safety brake', () => {
    // GDD §8C: a correct alignment arms the brake for the next 5 wafers.
    const cmp = byId.get('rework-cmpcalibration')!;
    expect(cmp.steps.map((s) => s.key)).toEqual(['CALIBRATE', 'ALIGN', 'LOCK']);
    expect(cmp.steps[2]!.purpose.toLowerCase()).toContain('brake');
  });

  it('every step states a purpose, so the player is told why the step exists', () => {
    for (const r of bundle.rework) {
      for (const s of r.steps) {
        expect(s.purpose.length, `${r.id}/${s.key}`).toBeGreaterThan(20);
      }
    }
  });

  it('validation rejects an unauthored rework rather than warning about it', () => {
    // The gap that started this: an empty procedure meant the player was asked to
    // fix a defect using instructions nobody wrote. That is an error, not a note.
    const broken = {
      ...bundle,
      rework: bundle.rework.map((r) =>
        r.id === 'rework-rcaclean'
          ? { ...r, instructionsText: '', idealTimingSeconds: 0, steps: [], stepDescriptions: [] }
          : r,
      ),
    };
    const found = validateBundle(broken);
    const rcaIssues = found.filter((i) => i.source === 'rework-rcaclean');
    expect(rcaIssues.length).toBeGreaterThan(0);
    expect(rcaIssues.every((i) => i.severity === 'error')).toBe(true);
  });

  it('validation rejects a step whose nominal dwell is outside its window', () => {
    const broken = {
      ...bundle,
      rework: bundle.rework.map((r) =>
        r.id === 'rework-rcaclean'
          ? {
              ...r,
              steps: r.steps.map((s, i) =>
                i === 0 ? { ...s, dwellSeconds: { ...s.dwellSeconds, nominal: 999 } } : s,
              ),
            }
          : r,
      ),
    };
    const found = validateBundle(broken);
    expect(found.some((i) => i.severity === 'error' && /nominal dwell/.test(i.message))).toBe(true);
  });

  it('validation rejects a recipe missing a GDD §8 bench', () => {
    const broken = {
      ...bundle,
      rework: bundle.rework.map((r) =>
        r.id === 'rework-cmpcalibration' ? { ...r, bench: { key: 'unknown', title: 'Unassigned', instrument: '' } } : r,
      ),
    };
    const found = validateBundle(broken);
    expect(found.some((i) => i.severity === 'error' && /bench/.test(i.message))).toBe(true);
  });
});
