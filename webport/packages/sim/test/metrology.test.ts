/**
 * Metrology physics tests.
 *
 * The load-bearing claim of GDD §7 is that each defect has a signature that only
 * a specific technique can see. If that were not true, the optimal strategy
 * would be "run every instrument on every wafer" and the Metrology_Optimization
 * competency would measure nothing. These tests pin the blindness.
 */

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  TOOL_SPECS,
  ALL_TOOLS,
  measure,
  measureAll,
  addReading,
  EMPTY_EVIDENCE,
  detectDifficultyFor,
} from '../src/assessment/metrology.js';
import { toolCanResolve } from '../src/evaluation/disposition.js';
import type { EffectiveWafer } from '../src/generation/wafer.js';
import type { DefectType, ToolType } from '@wafers/data';

function wafer(
  defectType: DefectType,
  defectClass: 'Catastrophic' | 'Parametric',
  severity: number,
  overrides: Partial<EffectiveWafer> = {},
): EffectiveWafer {
  return {
    index: 0,
    routingStep: 'Substrate',
    defects: [
      { defectType, defectClass, severity, regionX: 0.5, regionY: 0.5, masked: false },
    ],
    requiredMetrology: [],
    activeDefectCount: 1,
    ...overrides,
  };
}

describe('instrument blindness (GDD §7 diagnostic signature)', () => {
  it('a surface stylus cannot see a sub-surface STI void', () => {
    const w = wafer('STIVoid', 'Catastrophic', 0.8);
    const r = measure(w, 'StylusProfilometer');
    expect(r.resolved).toHaveLength(0);
    expect(r.invisible).toContain('STIVoid');
  });

  it('an electron microscope cannot see substrate bow', () => {
    const w = wafer('BowingWarping', 'Catastrophic', 0.85);
    const r = measure(w, 'ElectronMicroscope');
    expect(r.resolved).toHaveLength(0);
    expect(r.invisible).toContain('BowingWarping');
  });

  it('four-point probe sees the contamination film it is specified for', () => {
    const w = wafer('SubstrateContamination', 'Parametric', 0.5);
    const r = measure(w, 'FourPointProbe');
    // Sheet resistance is the named GDD §7 signature for this defect.
    expect(r.signalLabel).toBe('Rs');
    expect(r.invisible).not.toContain('SubstrateContamination');
  });

  it('every defect is invisible to at least one instrument (no free recall)', () => {
    const defects: Array<[DefectType, 'Catastrophic' | 'Parametric']> = [
      ['BowingWarping', 'Catastrophic'],
      ['SubstrateContamination', 'Parametric'],
      ['STIVoid', 'Catastrophic'],
      ['InterfaceRoughness', 'Parametric'],
      ['SilicideBridging', 'Catastrophic'],
      ['TungstenPlugVoid', 'Catastrophic'],
    ];
    for (const [type, cls] of defects) {
      const w = wafer(type, cls, 0.9);
      const blind = ALL_TOOLS.filter((t) => !measure(w, t).resolved.length);
      expect(blind.length, `${type} is visible to every instrument`).toBeGreaterThan(0);
    }
  });

  it('no single instrument can resolve every defect (no dominant strategy)', () => {
    const types = [
      'BowingWarping',
      'SubstrateContamination',
      'STIVoid',
      'InterfaceRoughness',
      'SilicideBridging',
      'TungstenPlugVoid',
    ];
    for (const tool of ALL_TOOLS) {
      const visible = types.filter((t) => toolCanResolve(tool, t));
      expect(visible.length, `${tool} resolves every defect`).toBeLessThan(types.length);
    }
  });
});

describe('measurement is deterministic and idempotent (GDD §16)', () => {
  it('the same tool on the same wafer gives the same reading', () => {
    const w = wafer('STIVoid', 'Catastrophic', 0.8, { index: 3 });
    const a = measure(w, 'SpectroscopicEllipsometry');
    const b = measure(w, 'SpectroscopicEllipsometry');
    expect(a).toEqual(b);
  });

  it('re-measuring does not double-count a defect but does charge latency', () => {
    const w = wafer('SubstrateContamination', 'Parametric', 0.6);
    const r = measure(w, 'FourPointProbe');
    const once = addReading(EMPTY_EVIDENCE, r);
    const twice = addReading(once, r);
    expect(twice.revealed).toHaveLength(once.revealed.length);
    expect(twice.latencySeconds).toBe(once.latencySeconds * 2);
  });

  it('different wafers give independent readings (the hash is not degenerate)', () => {
    const vals = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const w = wafer('SilicideBridging', 'Catastrophic', 0.9, { index: i });
      vals.add(measure(w, 'ElectronMicroscope').value);
    }
    // Values vary with severity roll; the important property is that not every
    // wafer produces an identical reading, which would mean one hash for all.
    expect(vals.size).toBeGreaterThan(1);
  });
});

describe('the signal is derived from the defects, not stored separately', () => {
  it('a resolved defect pushes the reading out of spec in the right direction', () => {
    const spec = TOOL_SPECS.StylusProfilometer.measurand;
    const clean = measure(wafer('BowingWarping', 'Catastrophic', 0, { defects: [] }), 'StylusProfilometer');
    const bowed = measure(wafer('BowingWarping', 'Catastrophic', 0.9), 'StylusProfilometer');
    expect(clean.value).toBeCloseTo(spec.nominal);
    expect(bowed.value).toBeGreaterThan(clean.value);
  });

  it('an STI void drives optical density DOWN (thin film, unfilled trench)', () => {
    const spec = TOOL_SPECS.SpectroscopicEllipsometry.measurand;
    const r = measure(wafer('STIVoid', 'Catastrophic', 0.8), 'SpectroscopicEllipsometry');
    expect(r.value).toBeLessThan(spec.nominal);
  });

  it('a contamination film drives sheet resistance UP', () => {
    const spec = TOOL_SPECS.FourPointProbe.measurand;
    const r = measure(wafer('SubstrateContamination', 'Parametric', 0.5), 'FourPointProbe');
    expect(r.value).toBeGreaterThan(spec.nominal);
  });

  it('a resolved defect always trips out-of-spec on its own tool', () => {
    const cases: Array<[DefectType, ToolType]> = [
      ['BowingWarping', 'StylusProfilometer'],
      ['STIVoid', 'SpectroscopicEllipsometry'],
      ['InterfaceRoughness', 'XRayRefractometry'],
    ];
    for (const [type, tool] of cases) {
      const r = measure(wafer(type, 'Parametric', 0.95), tool);
      if (r.resolved.length > 0) {
        expect(r.outOfSpec, `${type} on ${tool} resolved but read in spec`).toBe(true);
      }
    }
  });

  it('a high severity scales the excursion', () => {
    const low = measure(wafer('InterfaceRoughness', 'Parametric', 0.2), 'XRayRefractometry');
    const high = measure(wafer('InterfaceRoughness', 'Parametric', 0.95), 'XRayRefractometry');
    expect(high.value).toBeGreaterThan(low.value);
  });
});

describe('resolution floor: a Hard defect can hide from the right tool (GDD §14)', () => {
  it('a tiny silicide stringer can read clean on the electron microscope', () => {
    const spec = TOOL_SPECS.ElectronMicroscope;
    const tiny = measure(wafer('SilicideBridging', 'Catastrophic', spec.resolutionLimit * 0.5), 'ElectronMicroscope');
    expect(tiny.resolved).toHaveLength(0);
    expect(tiny.subResolution).toBe(true);
  });

  it('a large silicide stringer is caught by the electron microscope', () => {
    const big = measure(wafer('SilicideBridging', 'Catastrophic', 0.95), 'ElectronMicroscope');
    expect(big.resolved.length).toBeGreaterThan(0);
  });

  it('detection difficulty lowers confidence for the same defect', () => {
    // Easy and Hard defects of equal size: the roll ceiling differs, so over
    // many wafers the Easy one must be caught strictly more often.
    const easy = Array.from({ length: 60 }, (_, i) =>
      measure(wafer('BowingWarping', 'Catastrophic', 0.5, { index: i }), 'StylusProfilometer'),
    ).filter((r) => r.resolved.length > 0).length;
    const hard = Array.from({ length: 60 }, (_, i) =>
      measure(wafer('SilicideBridging', 'Catastrophic', 0.5, { index: i }), 'ElectronMicroscope'),
    ).filter((r) => r.resolved.length > 0).length;
    expect(easy).toBeGreaterThan(hard);
  });

  it('difficulty levels are ordered as the GDD intends', () => {
    expect(detectDifficultyFor('BowingWarping')).toBe('Easy');
    expect(detectDifficultyFor('STIVoid')).toBe('Medium');
    expect(detectDifficultyFor('SilicideBridging')).toBe('Hard');
  });
});

describe('evidence accumulation across a wafer (GDD §11)', () => {
  it('a killer finding is latched once revealed', () => {
    const w = wafer('STIVoid', 'Catastrophic', 0.9);
    const e = measureAll(w, ['StylusProfilometer', 'SpectroscopicEllipsometry']);
    // Stylus is blind; ellipsometry resolves it.
    expect(e.killerRevealed).toBe(true);
    expect(e.revealed.map((r) => r.defectType)).toContain('STIVoid');
    expect(e.anyOutOfSpec).toBe(true);
  });

  it('the blind spot is recorded when a tool could not see a present defect', () => {
    const w = wafer('SilicideBridging', 'Catastrophic', 0.9);
    const e = measureAll(w, ['StylusProfilometer']);
    expect(e.revealed).toHaveLength(0);
    expect(e.blindSpot).toBe(true);
    expect(e.anyOutOfSpec).toBe(false);
  });

  it('latency accumulates across every pass taken', () => {
    const w = wafer('BowingWarping', 'Catastrophic', 0.85);
    const one = measureAll(w, ['StylusProfilometer']);
    const two = measureAll(w, ['StylusProfilometer', 'FourPointProbe']);
    expect(one.latencySeconds).toBe(TOOL_SPECS.StylusProfilometer.latencySeconds);
    expect(two.latencySeconds).toBe(one.latencySeconds + TOOL_SPECS.FourPointProbe.latencySeconds);
  });

  it('no measurements at all means no evidence and no false confidence', () => {
    expect(EMPTY_EVIDENCE.revealed).toHaveLength(0);
    expect(EMPTY_EVIDENCE.anyOutOfSpec).toBe(false);
    expect(EMPTY_EVIDENCE.killerRevealed).toBe(false);
  });
});

describe('property: readings are finite, in-range-typed, and never NaN', () => {
  const toolArb = fc.constantFrom(...ALL_TOOLS);
  const sevArb = fc.double({ min: 0, max: 1, noNaN: true });

  it('value is always a finite number for any severity', () => {
    fc.assert(
      fc.property(toolArb, sevArb, fc.integer({ min: 0, max: 999 }), (tool, sev, idx) => {
        const r = measure(wafer('SilicideBridging', 'Catastrophic', sev, { index: idx }), tool);
        expect(Number.isFinite(r.value)).toBe(true);
        expect(Number.isFinite(r.confidence)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it('outOfSpec agrees with the stated limits', () => {
    fc.assert(
      fc.property(toolArb, sevArb, fc.integer({ min: 0, max: 999 }), (tool, sev, idx) => {
        const r = measure(wafer('InterfaceRoughness', 'Parametric', sev, { index: idx }), tool);
        const expected = r.value < r.lowerLimit || r.value > r.upperLimit;
        expect(r.outOfSpec).toBe(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('a masked defect is never resolved by anything', () => {
    const w: EffectiveWafer = {
      index: 0,
      routingStep: 'ShallowTrenchIsolation',
      defects: [
        { defectType: 'STIVoid', defectClass: 'Catastrophic', severity: 0.9, regionX: 0.5, regionY: 0.5, masked: true },
      ],
      requiredMetrology: ['SpectroscopicEllipsometry'],
      activeDefectCount: 0,
    };
    for (const tool of ALL_TOOLS) {
      const r = measure(w, tool);
      expect(r.resolved).toHaveLength(0);
      expect(r.invisible).toHaveLength(0);
      expect(r.value).toBeCloseTo(TOOL_SPECS[tool].measurand.nominal);
    }
  });
});
describe('a clean reading says WHICH kind of clean (GDD §11 coaching)', () => {
  /**
   * The two "found nothing" cases are physically different and the player has to
   * act differently:
   *
   *   subResolution — the defect is smaller than the technique can ever resolve.
   *                  The only fix is a different instrument.
   *   marginal      — the defect was inside this technique's reach and the
   *                  per-wafer detection roll missed it. Re-measuring, or a
   *                  second instrument, can find it.
   *
   * Collapsing these into one flag (as an earlier version did) told a player to
   * swap instruments when the right move was to look again.
   */
  it('a defect under the resolution floor reports subResolution, not marginal', () => {
    const spec = TOOL_SPECS.ElectronMicroscope;
    const r = measure(wafer('SilicideBridging', 'Catastrophic', spec.resolutionLimit * 0.4), 'ElectronMicroscope');
    expect(r.resolved).toHaveLength(0);
    expect(r.subResolution).toBe(true);
    // A feature this small is invisible to the technique, not merely missed.
    expect(r.marginal).toBe(false);
  });

  it('a rolled miss reports marginal, not subResolution', () => {
    // Walk wafers until one produces a roll miss (in reach but not caught).
    let sawMarginal = false;
    for (let i = 0; i < 200 && !sawMarginal; i++) {
      const r = measure(wafer('SilicideBridging', 'Catastrophic', 0.95, { index: i }), 'ElectronMicroscope');
      if (r.resolved.length === 0) {
        expect(r.subResolution).toBe(false);
        expect(r.marginal).toBe(true);
        sawMarginal = true;
      }
    }
    expect(sawMarginal).toBe(true);
  });

  it('a clean wafer is neither', () => {
    const r = measure(wafer('SilicideBridging', 'Catastrophic', 0.9, { defects: [] }), 'ElectronMicroscope');
    expect(r.subResolution).toBe(false);
    expect(r.marginal).toBe(false);
    expect(r.resolved).toHaveLength(0);
  });

  it('confidence reports the technique competence, not a per-pass score', () => {
    // A hard defect this instrument is the right tool for: the ceiling is 0.98 x
    // 0.74 = 0.7252, reported whether or not this particular pass caught it.
    const caught = measure(wafer('SilicideBridging', 'Catastrophic', 0.95), 'ElectronMicroscope');
    const missed = measure(wafer('SilicideBridging', 'Catastrophic', 0.95, { index: 3 }), 'ElectronMicroscope');
    expect(caught.confidence).toBeCloseTo(0.7252, 3);
    // Reporting 0 for a missed pass would make a good measurement look failed.
    expect(missed.confidence).toBeCloseTo(0.7252, 3);
  });

  it('confidence is 0 only when there was nothing to look for', () => {
    const r = measure(wafer('SilicideBridging', 'Catastrophic', 0.9, { defects: [] }), 'ElectronMicroscope');
    expect(r.confidence).toBe(0);
  });
});
