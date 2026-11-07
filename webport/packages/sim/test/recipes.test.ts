/**
 * Rework recipe tests.
 *
 * The load-bearing claim: the authored config in `packages/data/config` is what
 * the simulation actually enforces. Before this, the Unity assets were empty, the
 * converter emitted placeholders, and each minigame hardcoded its own recipe —
 * two copies of the truth with nothing comparing them.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recipeFor, recipeForDefect, CMP_BRAKE_WAFERS, BUILTIN_RECIPES } from '../src/rework/recipes.js';
import { buildRcaSteps, createRcaClean, RCA_STEPS } from '../src/rework/rca-clean.js';
import { Rng } from '../src/rng.js';
import { validateBundle, type ConfigBundle, type ReworkConfig } from '@wafers/data';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const load = (f: string) => JSON.parse(readFileSync(path.join(CONFIG, f), 'utf8'));
const REWORK: ReworkConfig[] = load('rework.json').rework;

describe('authored config drives the recipe', () => {
  it('every rework kind resolves to a recipe with real steps', () => {
    for (const kind of ['RCAClean', 'SilicideWetEtch', 'CMPCalibration'] as const) {
      const r = recipeFor(kind, REWORK);
      expect(r.steps.length, kind).toBeGreaterThanOrEqual(3);
      expect(r.nominalSeconds).toBeGreaterThan(0);
      expect(r.toleranceSeconds).toBeGreaterThan(0);
      expect(r.failurePenalty).toBeGreaterThan(0);
    }
  });

  it('the config supplies the windows, so the sim and the data agree by construction', () => {
    const r = recipeFor('RCAClean', REWORK);
    const cfg = REWORK.find((c) => c.type === 'RCAClean')!;
    expect(r.steps.map((s) => s.key)).toEqual(cfg.steps.map((s) => s.key));
    expect(r.nominalSeconds).toBe(cfg.idealTimingSeconds);
    expect(r.toleranceSeconds).toBe(cfg.toleranceWindowSeconds);
    expect(r.failurePenalty).toBe(cfg.failurePenalty);
    // And the temperature window really is the authored one, not a default.
    expect(r.steps[0]!.targetC.nominal).toBe(cfg.steps[0]!.targetC!.nominal);
  });

  it('falls back to the documented defaults when no config is supplied', () => {
    for (const kind of ['RCAClean', 'SilicideWetEtch', 'CMPCalibration'] as const) {
      expect(recipeFor(kind)).toEqual(BUILTIN_RECIPES[kind]);
    }
  });

  it('falls back per-field, not all-or-nothing', () => {
    // A partial config (only steps) still overrides the step table while the
    // timings keep their defaults.
    const partial: ReworkConfig[] = [
      {
        ...REWORK.find((c) => c.type === 'RCAClean')!,
        idealTimingSeconds: 0,
        toleranceWindowSeconds: 0,
      },
    ];
    const r = recipeFor('RCAClean', partial);
    expect(r.steps.length).toBe(4);
    expect(r.nominalSeconds).toBe(BUILTIN_RECIPES.RCAClean.nominalSeconds);
  });

  it('a null targetC becomes the ambient band, so the heater still has a window', () => {
    // A megasonic rinse is not temperature-controlled. That is a real
    // distinction, but the sim still needs a band to check a heater against.
    const r = recipeFor('CMPCalibration', REWORK);
    for (const s of r.steps) {
      expect(s.targetC.nominal).toBeGreaterThan(0);
      expect(s.targetC.min).toBeLessThan(s.targetC.max);
    }
  });

  it('a changed config actually changes what the simulation enforces', () => {
    const cfg = REWORK.find((c) => c.type === 'RCAClean')!;
    const mutated: ReworkConfig[] = [
      {
        ...cfg,
        steps: cfg.steps.map((s, i) =>
          i === 0 ? { ...s, dwellSeconds: { min: 1, nominal: 2, max: 3 } } : s,
        ),
      },
    ];
    const a = buildRcaSteps(recipeFor('RCAClean', REWORK));
    const b = buildRcaSteps(recipeFor('RCAClean', mutated));
    expect(a[0]!.dwellSeconds).not.toBe(b[0]!.dwellSeconds);
    expect(b[0]!.dwellSeconds).toBe(2);
  });
});

describe('the RCA step table is built from config', () => {
  it('uses the authored keys and windows', () => {
    const steps = buildRcaSteps(recipeFor('RCAClean', REWORK));
    expect(steps.map((s) => s.kind)).toEqual(['SC1', 'QDR1', 'SC2', 'QDR2']);
    // SC-2 is the cooler bath. This is the fact the Unity version got wrong by
    // sharing one temperature across both tanks.
    expect(steps[2]!.targetC.nominal).toBeLessThan(steps[0]!.targetC.nominal);
  });

  it('defaults to the built-in table with no recipe', () => {
    expect(buildRcaSteps()).toBe(RCA_STEPS);
  });

  it('the minigame runs the configured steps, not the constant', () => {
    const recipe = recipeFor('RCAClean', REWORK);
    const sim = createRcaClean(new Rng(1), 0, recipe);
    // The first step must be the configured SC-1, with the configured window.
    expect(sim.state.step.kind).toBe('SC1');
    expect(sim.state.step.targetC.nominal).toBe(recipe.steps[0]!.targetC.nominal);
    expect(sim.state.step.dwellSeconds).toBe(recipe.steps[0]!.dwellSeconds);
  });

  it('a mutated config changes the minigame state', () => {
    const cfg = REWORK.find((c) => c.type === 'RCAClean')!;
    const hot: ReworkConfig[] = [
      { ...cfg, steps: cfg.steps.map((s, i) => (i === 0 ? { ...s, targetC: { min: 95, nominal: 99, max: 100 } } : s)) },
    ];
    const sim = createRcaClean(new Rng(1), 0, recipeFor('RCAClean', hot));
    expect(sim.state.step.targetC.nominal).toBe(99);
  });
});

describe('defect -> recipe routing (GDD §8)', () => {
  it('maps each reworkable defect to its bench', () => {
    expect(recipeForDefect('SubstrateContamination', REWORK)?.kind).toBe('RCAClean');
    expect(recipeForDefect('SilicideBridging', REWORK)?.kind).toBe('SilicideWetEtch');
    // §8C: the CMP calibration is what protects against STI voids.
    expect(recipeForDefect('STIVoid', REWORK)?.kind).toBe('CMPCalibration');
  });

  it('a non-reworkable defect has no recipe', () => {
    // Bowing and plug voids are Reject per the GDD §7 matrix.
    expect(recipeForDefect('BowingWarping', REWORK)).toBeNull();
    expect(recipeForDefect('TungstenPlugVoid', REWORK)).toBeNull();
    expect(recipeForDefect('InterfaceRoughness', REWORK)).toBeNull();
  });

  it('only the CMP recipe arms the safety brake (GDD §8C)', () => {
    expect(recipeFor('CMPCalibration', REWORK).brakeWafers).toBe(CMP_BRAKE_WAFERS);
    expect(recipeFor('RCAClean', REWORK).brakeWafers).toBe(0);
    expect(recipeFor('SilicideWetEtch', REWORK).brakeWafers).toBe(0);
  });
});

describe('the bundle validates as a whole', () => {
  it('no errors survive in the converted config', () => {
    const bundle: ConfigBundle = {
      defects: load('defects.json').defects,
      tools: load('tools.json').tools,
      days: load('days.json').days,
      ruleMatrices: load('rule-matrices.json').ruleMatrices,
      rework: REWORK,
      scoring: load('scoring.json').scoring,
    };
    const errors = validateBundle(bundle).filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.source}: ${e.message}`)).toEqual([]);
  });
});
