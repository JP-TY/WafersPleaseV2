import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng } from '../src/rng.js';
import {
  createSilicideEtch,
  c54FractionAt,
  sheetResistanceAt,
  phaseAt,
  rollSilicideRecipe,
  type SilicideEtchState,
} from '../src/rework/silicide-etch.js';
import { PROCESS } from '../src/rework/process.js';

const DT = 1 / 60;

function make(tau = 20) {
  return createSilicideEtch({ tauSeconds: tau, tauJitter: 1 });
}
const st = (g: ReturnType<typeof make>): SilicideEtchState => g.state;

/** Advance `seconds` of anneal. */
function anneal(g: ReturnType<typeof make>, seconds: number) {
  for (let t = 0; t < seconds; t += DT) g.tick(DT);
}

describe('C49 -> C54 kinetics', () => {
  it('starts unconverted', () => {
    expect(c54FractionAt(0, 20)).toBe(0);
  });

  it('is monotone increasing — conversion never reverses', () => {
    let prev = -1;
    for (let t = 0; t <= 120; t += 0.5) {
      const f = c54FractionAt(t, 20);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
  });

  it('is sigmoidal, not a smoothstep — a real conversion front', () => {
    // Unity used SmoothStep, which is symmetric with no incubation period.
    // Avrami n=3 has a slow start while nuclei form.
    const tau = 20;
    expect(c54FractionAt(tau * 0.25, tau)).toBeLessThan(0.05);
    expect(c54FractionAt(tau * 1.0, tau)).toBeGreaterThan(0.6);
    expect(c54FractionAt(tau * 1.5, tau)).toBeGreaterThan(0.9);
  });

  it('is scale-invariant in time constant', () => {
    fc.assert(fc.property(fc.double({ min: 0.001, max: 1e9, noNaN: true }), (f) => {
      expect(c54FractionAt(50 * f, 50)).toBeCloseTo(c54FractionAt(f, 1), 10);
    }));
  });

  it('saturates at exactly 1 and never exceeds it', () => {
    for (const t of [1e3, 1e6, 1e12]) {
      const f = c54FractionAt(t, 20);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});

describe('sheet resistance', () => {
  it('reports C49 and C54 at their literature values', () => {
    // OSTI 603492 / IBM J. Res. Develop. 44: C49 60-90, C54 12-15 uOhm.cm.
    expect(sheetResistanceAt(0, 20)).toBeCloseTo(PROCESS.silicide.resistivityC49MicroOhmCm, 6);
    expect(sheetResistanceAt(1e9, 20)).toBeCloseTo(PROCESS.silicide.resistivityC54MicroOhmCm, 6);
  });

  it('falls monotonically as C54 grows', () => {
    let prev = Infinity;
    for (let t = 0; t <= 200; t += 0.5) {
      const rs = sheetResistanceAt(t, 20);
      expect(rs).toBeLessThanOrEqual(prev);
      prev = rs;
    }
  });

  it('never reports below the C54 floor — the Unity weighted-average bug', () => {
    // A plain weighted average of 75 and 14 cannot go under 14, but a two-phase
    // parallel model must also respect the floor at both limits.
    for (let t = 0; t <= 400; t += 0.5) {
      const rs = sheetResistanceAt(t, 20);
      expect(rs).toBeGreaterThanOrEqual(PROCESS.silicide.resistivityC54MicroOhmCm - 1e-9);
      expect(rs).toBeLessThanOrEqual(PROCESS.silicide.resistivityC49MicroOhmCm + 1e-9);
    }
  });

  it('is NOT inverted — high Rs means C49, which is the Unity bug', () => {
    // Unity printed C49 (Rs 0.85) as ~5.7 ohm/sq and C54 (0.20) as ~15.2.
    // The physical assertion: unconverted film must read HIGH resistance.
    const early = sheetResistanceAt(0.5, 20);
    const late = sheetResistanceAt(1e6, 20);
    expect(early).toBeGreaterThan(late);
    expect(early).toBeGreaterThan(50); // C49 is the 60-90 uOhm.cm phase
    expect(late).toBeLessThan(20); // C54 is the 12-15 uOhm.cm phase
  });
});

describe('phase classification', () => {
  it('starts in C49 and ends in C54, passing through Transition', () => {
    // With n = 3 the conversion is front-like, so the phase boundaries land at
    // fractions of tau, not at tau itself: f=0.05 at 0.37*tau, f=0.55 at
    // 0.93*tau. Assert the progression rather than guessed times.
    expect(phaseAt(0, 20)).toBe('C49');
    expect(phaseAt(20 * 0.6, 20)).toBe('Transition');
    expect(phaseAt(1e6, 20)).toBe('C54');

    const order = ['C49', 'Transition', 'C54'];
    let last = 0;
    for (let t = 0; t <= 200; t += 0.25) {
      const idx = order.indexOf(phaseAt(t, 20));
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
    expect(last).toBe(2);
  });

  it('bounds the strippable window as a fraction of the time constant', () => {
    // C49 is strippable while the front has not yet consumed the stringer.
    expect(phaseAt(20 * 0.3, 20)).toBe('C49');
    expect(c54FractionAt(20 * 0.3, 20)).toBeLessThan(0.05);
  });

  it('C49 is strippable, C54 is not', () => {
    expect(c54FractionAt(0, 20)).toBeLessThan(0.05);
    expect(phaseAt(0, 20)).toBe('C49');
    expect(phaseAt(1e6, 20)).toBe('C54');
  });
});

describe('45nm narrow-line retardation', () => {
  it('lengthens the conversion window', () => {
    // Roy et al. (IBM) measured up to +180 C transition temperature as linewidth
    // fell from 1.0 um to 0.1 um; 45 nm sits past that, so the window is longer.
    expect(PROCESS.silicide.narrowLineRetardation).toBeGreaterThan(2);
  });

  it('bakes the retardation into the rolled recipe', () => {
    const recipe = rollSilicideRecipe(new Rng(1), 0);
    const nominal = 11.0 * PROCESS.silicide.narrowLineRetardation;
    expect(recipe.tauSeconds).toBeGreaterThan(nominal * 0.8);
    expect(recipe.tauSeconds).toBeLessThan(nominal * 1.3);
  });

  it('shortens the window as difficulty rises', () => {
    const easy = rollSilicideRecipe(new Rng(7), 0).tauSeconds;
    const hard = rollSilicideRecipe(new Rng(7), 2).tauSeconds;
    expect(hard).toBeLessThan(easy);
  });

  it('varies per wafer without changing the seed', () => {
    const a = rollSilicideRecipe(new Rng(1), 0).tauSeconds;
    const b = rollSilicideRecipe(new Rng(2), 0).tauSeconds;
    expect(a).not.toBe(b);
  });
});

describe('etch outcome', () => {
  it('succeeds when the wash lands inside C49 with a sensible duration', () => {
    const g = make(20);
    anneal(g, 1);
    g.act({ type: 'startWash' });
    anneal(g, 1.2);
    g.act({ type: 'stopWash' });
    g.act({ type: 'commit' });
    expect(g.result?.success).toBe(true);
    expect(g.result?.outcome).toBe('success');
    expect(g.result?.quality).toBeGreaterThan(0);
  });

  it('fails irrecoverably once C54 forms, even without touching the controls', () => {
    // Unity had this auto-fail; it is the reason the minigame exists.
    const g = make(6);
    anneal(g, 12);
    expect(g.finished).toBe(true);
    expect(g.result?.success).toBe(false);
    expect(g.result?.outcome).toBe('irreversible');
    expect(g.result?.detail).toMatch(/C54/);
  });

  it('fails when committed with no wash at all', () => {
    const g = make(20);
    anneal(g, 1);
    g.act({ type: 'commit' });
    expect(g.result?.success).toBe(false);
    expect(g.result?.detail).toMatch(/without running the ultrasonic wash/i);
  });

  it('fails on a wash too short to strip the stringer', () => {
    const g = make(20);
    anneal(g, 0.5);
    g.act({ type: 'startWash' });
    anneal(g, 0.1);
    g.act({ type: 'stopWash' });
    g.act({ type: 'commit' });
    expect(g.result?.success).toBe(false);
    expect(g.result?.outcome).toBe('outOfSpec');
    expect(g.result?.detail).toMatch(/partially stripped/i);
  });

  it('fails on an over-long wash — the etchant eats the contact', () => {
    // This failure mode did not exist in Unity; there was only one way to fail.
    const g = make(20);
    anneal(g, 0.5);
    g.act({ type: 'startWash' });
    anneal(g, 4);
    g.act({ type: 'stopWash' });
    g.act({ type: 'commit' });
    expect(g.result?.success).toBe(false);
    expect(g.result?.irreversible).toBe(true);
    expect(g.result?.detail).toMatch(/contact/i);
  });

  it('thins the contact only while washing', () => {
    const g = make(20);
    const before = st(g).contactNm;
    anneal(g, 3);
    expect(st(g).contactNm).toBe(before);
    g.act({ type: 'startWash' });
    anneal(g, 1);
    expect(st(g).contactNm).toBeLessThan(before);
  });

  it('rewards a centred wash over an edge one', () => {
    const run = (hold: number) => {
      const g = make(20);
      anneal(g, 0.5);
      g.act({ type: 'startWash' });
      anneal(g, hold);
      g.act({ type: 'stopWash' });
      g.act({ type: 'commit' });
      return g.result!;
    };
    expect(run(1.2).quality).toBeGreaterThan(run(2.0).quality);
  });

  it('reports Rs in micro-ohm-cm in the coaching text', () => {
    const g = make(20);
    anneal(g, 0.5);
    g.act({ type: 'startWash' });
    anneal(g, 1.2);
    g.act({ type: 'stopWash' });
    g.act({ type: 'commit' });
    expect(g.result?.detail).toMatch(/Rₛ \d+ µΩ·cm/);
  });
});

describe('determinism and invariants', () => {
  it('replays identically for the same seed', () => {
    const play = () => {
      const g = createSilicideEtch(rollSilicideRecipe(new Rng(31337), 0));
      anneal(g, 0.5);
      g.act({ type: 'startWash' });
      anneal(g, 1.2);
      g.act({ type: 'stopWash' });
      g.act({ type: 'commit' });
      return g.result;
    };
    expect(play()).toEqual(play());
  });

  it('always terminates — no input sequence can hang it', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const g = make(4);
      for (let i = 0; i < 3000 && !g.finished; i++) {
        if (i % 7 === 0) g.act({ type: 'startWash' });
        if (i % 11 === 0) g.act({ type: 'stopWash' });
        g.tick(DT);
      }
      expect(g.finished).toBe(true);
      expect(g.result).not.toBeNull();
    }));
  });

  it('keeps quality within [0,1] across the whole parameter space', () => {
    fc.assert(fc.property(fc.double({ min: 1, max: 200, noNaN: true }), fc.double({ min: 0, max: 8, noNaN: true }), (tau, hold) => {
      const g = make(tau);
      anneal(g, 0.2);
      g.act({ type: 'startWash' });
      for (let t = 0; t < hold && !g.finished; t += DT) g.tick(DT);
      if (!g.finished) g.act({ type: 'commit' });
      const q = g.result?.quality;
      if (q !== undefined) {
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
      }
    }));
  });

  it('contact thickness never goes negative', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 30, noNaN: true }), (hold) => {
      const g = make(1000);
      g.act({ type: 'startWash' });
      for (let t = 0; t < hold; t += DT) g.tick(DT);
      expect(st(g).contactNm).toBeGreaterThanOrEqual(0);
    }));
  });
});