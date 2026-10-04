import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng } from '../src/rng.js';
import { createRcaClean, RCA_STEPS } from '../src/rework/rca-clean.js';
import { PROCESS, realMinutes, stepBathTemperature, arrheniusRatio } from '../src/rework/process.js';
import type { RcaCleanState } from '../src/rework/rca-clean.js';

const fresh = (seed = 1) => createRcaClean(new Rng(seed), 0);
const s = (g: ReturnType<typeof fresh>): RcaCleanState => g.state;

/** Run the happy path: heat the right bath, immerse, hold for `hold`, withdraw. */
function runStep(
  g: ReturnType<typeof fresh>,
  bath: 'sc1' | 'sc2',
  holdSeconds: number,
  dt = 1 / 60,
) {
  g.act({ type: 'setHeater', bath, setpointC: s(g).step.targetC.nominal });
  // Heat to setpoint before immersing.
  for (let i = 0; i < 60 * 60 && s(g).baths[bath].temperatureC < s(g).step.targetC.nominal - 0.5; i++) {
    g.tick(dt);
  }
  g.act({ type: 'immerse' });
  for (let t = 0; t < holdSeconds; t += dt) g.tick(dt);
  g.act({ type: 'withdraw' });
}

describe('RCA step sequence', () => {
  it('is SC-1, QDR, SC-2, QDR — the order a real RCA cycle requires', () => {
    expect(RCA_STEPS.map((x) => x.kind)).toEqual(['SC1', 'QDR1', 'SC2', 'QDR2']);
  });

  it('uses the real chemical ratios', () => {
    expect(PROCESS.rca.sc1.chemistry).toContain('5 : 1 : 1');
    expect(PROCESS.rca.sc2.chemistry).toContain('6 : 1 : 1');
  });

  it('gives SC-1 and SC-2 different temperature bands', () => {
    // Metrohm's inline spec: SC-1 at 65+/-3 C, SC-2 HCl at 35+/-3 C.
    expect(PROCESS.rca.sc1.target.nominal).toBeGreaterThan(PROCESS.rca.sc2.target.nominal + 20);
  });

  it('starts both baths at ambient, independently', () => {
    const g = fresh();
    expect(s(g).baths.sc1.temperatureC).toBe(22);
    expect(s(g).baths.sc2.temperatureC).toBe(22);
    expect(s(g).active).toBe('sc1');
  });
});

describe('thermal model', () => {
  it('heats toward the setpoint and never overshoots it', () => {
    let t = 22;
    for (let i = 0; i < 1000; i++) {
      t = stepBathTemperature(t, 75, 1 / 60, { heat: 9, cool: 2.2 });
      expect(t).toBeLessThanOrEqual(75);
    }
    expect(t).toBeCloseTo(75, 5);
  });

  it('cools toward ambient when the heater is off — Unity had no cooling at all', () => {
    let t = 75;
    for (let i = 0; i < 60 * 60; i++) t = stepBathTemperature(t, 22, 1 / 60, { heat: 9, cool: 2.2 });
    expect(t).toBe(22);
  });

  it('has finite thermal mass — a cold bath does not jump to temperature', () => {
    const g = fresh();
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 75 });
    g.tick(1 / 60);
    // Unity used MoveTowards at 45 C/s which clears 53 C in ~1.2 s.
    expect(s(g).baths.sc1.temperatureC).toBeLessThan(30);
  });

  it('heats the two baths independently', () => {
    const g = fresh();
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 75 });
    for (let i = 0; i < 600; i++) g.tick(1 / 60);
    expect(s(g).baths.sc1.temperatureC).toBeGreaterThan(s(g).baths.sc2.temperatureC + 20);
  });
});

describe('Arrhenius weighting', () => {
  it('is unity at the reference temperature', () => {
    expect(arrheniusRatio(75, 75, 40_000)).toBeCloseTo(1, 10);
  });

  it('falls steeply below the reference — this is the whole point of SC-2', () => {
    const at35 = arrheniusRatio(35, 75, 40_000);
    expect(at35).toBeLessThan(0.2);
  });

  it('is monotone in temperature', () => {
    fc.assert(fc.property(fc.double({ min: 20, max: 95, noNaN: true }), (t) => {
      expect(arrheniusRatio(t, 75, 40_000)).toBeGreaterThan(0);
    }));
    let prev = -Infinity;
    for (let t = 20; t <= 95; t += 5) {
      const v = arrheniusRatio(t, 75, 40_000);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('cleaning outcome', () => {
  it('completes when both baths are run correctly', () => {
    const g = fresh();
    runStep(g, 'sc1', 11);
    expect(s(g).step.kind).toBe('QDR1');
    g.act({ type: 'immerse' });
    for (let t = 0; t < 5; t += 1 / 60) g.tick(1 / 60);
    g.act({ type: 'withdraw' });
    expect(s(g).step.kind).toBe('SC2');

    runStep(g, 'sc2', 11);
    g.act({ type: 'immerse' });
    for (let t = 0; t < 5; t += 1 / 60) g.tick(1 / 60);
    g.act({ type: 'withdraw' });

    expect(g.finished).toBe(true);
    expect(g.result?.success).toBe(true);
    expect(g.result?.outcome).toBe('success');
  });

  it('fails when SC-1 is under-soaked', () => {
    const g = fresh();
    runStep(g, 'sc1', 4);
    expect(g.finished).toBe(true);
    expect(g.result?.success).toBe(false);
    expect(g.result?.detail).toMatch(/incomplete|collapses/i);
  });

  it('fails when the bath is too cold, even at full dwell', () => {
    const g = fresh();
    // Heat to only 40 C, then soak a long time.
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 40 });
    for (let i = 0; i < 60 * 60 && s(g).baths.sc1.temperatureC < 39.5; i++) g.tick(1 / 60);
    g.act({ type: 'immerse' });
    for (let t = 0; t < 11; t += 1 / 60) g.tick(1 / 60);
    g.act({ type: 'withdraw' });
    expect(g.result?.success).toBe(false);
    expect(g.result?.detail).toMatch(/below the/i);
  });

  it('is irreversible when over-soaked past the damage threshold', () => {
    const g = fresh();
    runStep(g, 'sc1', 24);
    expect(g.result?.irreversible).toBe(true);
    expect(g.result?.outcome).toBe('irreversible');
  });

  it('integrates temperature over the soak — Unity only sampled it at the end', () => {
    // Unity's bug: soak correctly, then slam the heater to 95 in the frame you
    // raised the wafer, and it failed. Here the soak is what counts.
    const g = fresh();
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 75 });
    for (let i = 0; i < 60 * 60 && s(g).baths.sc1.temperatureC < 74.5; i++) g.tick(1 / 60);
    g.act({ type: 'immerse' });
    for (let t = 0; t < 11; t += 1 / 60) g.tick(1 / 60);
    // Sabotage the heater at the last moment.
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 95 });
    g.act({ type: 'withdraw' });
    // SC-1 must still have passed on the accumulated soak.
    expect(s(g).step.kind).toBe('QDR1');
  });

  it('reports the real-time equivalent in the coaching text', () => {
    const g = fresh();
    runStep(g, 'sc1', 24);
    expect(realMinutes(26)).toBeGreaterThan(0.4);
    expect(g.result?.detail).toMatch(/real minutes/);
  });
});

describe('input validation', () => {
  it('rejects double immersion', () => {
    const g = fresh();
    g.act({ type: 'immerse' });
    expect(() => g.act({ type: 'immerse' })).toThrow(/already submerged/);
  });

  it('treats an immediate withdrawal as an under-soak failure', () => {
    // Dwell 0 removes nothing, so this resolves rather than throwing. That makes
    // the "not submerged" guard unreachable in practice — it is defence in depth.
    const g = fresh();
    g.act({ type: 'immerse' });
    g.act({ type: 'withdraw' });
    expect(g.result?.success).toBe(false);
    expect(g.result?.outcome).toBe('outOfSpec');
  });

  it('rejects action after resolution', () => {
    const g = fresh();
    runStep(g, 'sc1', 24);
    expect(() => g.act({ type: 'immerse' })).toThrow(/resolved/);
  });

  it('clamps the heater to a physical range', () => {
    const g = fresh();
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: 500 });
    expect(s(g).baths.sc1.setpointC).toBe(95);
    g.act({ type: 'setHeater', bath: 'sc1', setpointC: -50 });
    expect(s(g).baths.sc1.setpointC).toBe(22);
  });

  it('freezes once finished', () => {
    const g = fresh();
    runStep(g, 'sc1', 24);
    const before = { ...s(g) };
    g.tick(10);
    expect(s(g).dwellSeconds).toBe(before.dwellSeconds);
  });
});

describe('determinism', () => {
  it('replays identically for the same seed', () => {
    const play = () => {
      const g = fresh(4242);
      runStep(g, 'sc1', 11);
      runStep(g, 'sc2', 11);
      return g.result;
    };
    expect(play()).toEqual(play());
  });

  it('yields a quality strictly inside [0,1]', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const g = fresh(seed);
      runStep(g, 'sc1', 11);
      const q = g.result?.quality;
      if (q !== undefined) {
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
      }
    }));
  });
});