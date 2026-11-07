import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng } from '../src/rng.js';
import {
  createCmpEndpoint,
  reflectanceAt,
  thicknessScaleFor,
  apparentEndpointSeconds,
  apparentRemainingNm,
  trueRemainingAt,
  sample,
  rollCmpInstrument,
  CMP_GAIN_RANGE,
  CMP_WAVELENGTH_RANGE,
  CMP_PHASE_RANGE,
  CMP_TIME_LIMIT_SECONDS,
  CMP_REFERENCE_WAVELENGTH,
  type CmpState,
} from '../src/rework/cmp-endpoint.js';
import { PROCESS } from '../src/rework/process.js';

const DT = 1 / 60;

function make(seed = 1, difficulty = 0) {
  return createCmpEndpoint(new Rng(seed), difficulty);
}
const st = (g: ReturnType<typeof make>): CmpState => g.state;

/** Polish for `seconds`, then lock. */
function polishAndLock(g: ReturnType<typeof make>, seconds: number) {
  for (let t = 0; t < seconds && !g.finished; t += DT) g.tick(DT);
  if (!g.finished) g.act({ type: 'lockEndpoint' });
  return g.result;
}

/** Calibrate perfectly, then polish to the true endpoint and lock. */
function perfectlyCalibrated(seed = 1, difficulty = 0) {
  const g = make(seed, difficulty);
  g.act({ type: 'setWavelength', value: 5 });
  g.act({ type: 'setPhase', value: Math.PI });
  g.act({ type: 'setGain', value: 1.0 });
  return g;
}

describe('the endpoint signal has a real knee', () => {
  it('sits at the oxide reflectance until the stop layer is exposed', () => {
    expect(reflectanceAt(200)).toBeCloseTo(PROCESS.cmp.reflectanceOxide, 6);
  });

  it('jumps to the nitride reflectance once cleared', () => {
    expect(reflectanceAt(0)).toBeCloseTo(PROCESS.cmp.reflectanceNitride, 6);
  });

  it('has a genuine inflection — Unity drew a damped sine with no feature to find', () => {
    // The knee is a sharp step, so the second derivative is strongly negative
    // near the endpoint. This is what makes the endpoint detectable at all.
    const knee = PROCESS.cmp.endpointRemainingNm;
    const h = 0.5;
    // A rising step edge has a large NEGATIVE second derivative: the spike marks
    // the point of steepest slope, which is exactly what an endpoint detector
    // keys on and what a damped sinusoid can never provide.
    const d2 = reflectanceAt(knee + h) - 2 * reflectanceAt(knee) + reflectanceAt(knee - h);
    expect(d2).toBeLessThan(-1e-3);
    // The feature is local: flat well away from it on both sides.
    expect(reflectanceAt(knee - 200)).toBeCloseTo(PROCESS.cmp.reflectanceNitride, 6);
    expect(reflectanceAt(knee + 200)).toBeCloseTo(PROCESS.cmp.reflectanceOxide, 6);
    expect(Math.abs(reflectanceAt(knee + 100) - 2 * reflectanceAt(knee + 100.5) + reflectanceAt(knee + 101)))
      .toBeLessThan(1e-9);
  });

  it('rises monotonically as material is removed — oxide is dimmer than nitride', () => {
    let prev = -Infinity;
    for (let nm = 700; nm >= 0; nm -= 2) {
      const r = reflectanceAt(nm);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = r;
    }
  });

  it('uses real optical constants — Si3N4 reflects more than SiO2', () => {
    // SiO2 n ~ 1.46 (d = 0); Si3N4 n ~ 2.0, so nitride is the brighter surface.
    expect(PROCESS.cmp.reflectanceNitride).toBeGreaterThan(PROCESS.cmp.reflectanceOxide);
  });
});

describe('instrument calibration produces real metrology error', () => {
  it('thickness scale spans roughly +-40% across the wavelength range', () => {
    const lo = thicknessScaleFor(CMP_WAVELENGTH_RANGE.min);
    const hi = thicknessScaleFor(CMP_WAVELENGTH_RANGE.max);
    expect(lo).toBeLessThan(1);
    expect(hi).toBeGreaterThan(1);
  });

  it('index 5 is the calibrated reference and reads exactly 1.0', () => {
    expect(CMP_REFERENCE_WAVELENGTH).toBe(5);
    expect(thicknessScaleFor(CMP_REFERENCE_WAVELENGTH)).toBeCloseTo(1.0, 12);
  });

  it('a miscalibrated wavelength biases every thickness reading', () => {
    const g = perfectlyCalibrated();
    // Push the wavelength off reference and the apparent reading shifts.
    g.act({ type: 'setWavelength', value: 9 });
    for (let t = 0; t < 1; t += DT) g.tick(DT);
    const biased = sample(st(g));
    expect(biased.apparentNm).not.toBeCloseTo(biased.trueNm, 1);
  });

  it('low gain buries the knee in noise', () => {
    const g = perfectlyCalibrated();
    g.act({ type: 'setWavelength', value: 5 });
    g.act({ type: 'setPhase', value: Math.PI });

    g.act({ type: 'setGain', value: 1.0 });
    for (let t = 0; t < 1; t += DT) g.tick(DT);
    const clean = sample(st(g));

    g.act({ type: 'setGain', value: 0.1 });
    const noisy = sample(st(g));

    expect(noisy.noiseNm).toBeGreaterThan(clean.noiseNm * 5);
  });

  it('high gain reduces noise monotonically', () => {
    const g = perfectlyCalibrated();
    g.act({ type: 'setWavelength', value: 5 });
    g.act({ type: 'setPhase', value: Math.PI });
    let prev = Infinity;
    for (const gain of [0.1, 0.3, 0.5, 0.7, 1.0]) {
      g.act({ type: 'setGain', value: gain });
      const n = sample(st(g)).noiseNm;
      expect(n).toBeLessThanOrEqual(prev + 1e-9);
      prev = n;
    }
  });

  it('apparent endpoint equals the truth when calibrated to reference', () => {
    const g = perfectlyCalibrated();
    expect(apparentEndpointSeconds(st(g))).toBeCloseTo(g.state.true_.endpointSeconds, 6);
  });

  it('trueRemainingAt reconstructs the polish from stored overburden and rate', () => {
    const g = make(3);
    const t = g.state.true_;
    expect(trueRemainingAt(0, t.initialOverburdenNm, t.removalRateNmPerSecond)).toBeCloseTo(
      t.initialOverburdenNm,
      6,
    );
    expect(trueRemainingAt(t.endpointSeconds, t.initialOverburdenNm, t.removalRateNmPerSecond)).toBeCloseTo(
      t.endpointNm,
      5,
    );
  });

  it('apparentRemainingNm matches sample() under the same calibration', () => {
    const g = perfectlyCalibrated();
    g.act({ type: 'setWavelength', value: 8 });
    for (let i = 0; i < 30; i++) g.tick(DT);
    const s = st(g);
    const fromSample = sample(s).apparentNm;
    const fromHelper = apparentRemainingNm(s.true_.remainingNm, s.calibration, s.true_.elapsedSeconds);
    expect(fromHelper).toBeCloseTo(fromSample, 10);
  });
});

describe('locking the endpoint', () => {
  it('succeeds with correct calibration at the true endpoint', () => {
    const g = perfectlyCalibrated();
    const result = polishAndLock(g, g.state.true_.endpointSeconds);
    expect(result?.success).toBe(true);
    expect(result?.outcome).toBe('success');
    expect(result?.quality).toBeGreaterThan(0.9);
  });

  it('reports the brake arming as the gameplay consequence', () => {
    const g = perfectlyCalibrated();
    const result = polishAndLock(g, g.state.true_.endpointSeconds);
    expect(result?.detail).toMatch(/brake armed/i);
  });

  it('scrapes the wafer when locked far too late', () => {
    const g = perfectlyCalibrated();
    // Hold the endpoint lock until well past the nitride limit.
    const result = polishAndLock(g, g.state.true_.endpointSeconds + 25);
    expect(result?.success).toBe(false);
    expect(result?.irreversible).toBe(true);
    expect(result?.detail).toMatch(/eroded|dishing/i);
  });

  it('cites real erosion and dishing figures in the failure text', () => {
    const g = perfectlyCalibrated();
    const result = polishAndLock(g, g.state.true_.endpointSeconds + 25);
    expect(result?.detail).toMatch(/Si₃N₄/);
    expect(result?.detail).toMatch(/\d+ nm/);
  });

  it('times out into an un-armed brake', () => {
    const g = perfectlyCalibrated();
    const result = polishAndLock(g, CMP_TIME_LIMIT_SECONDS + 1);
    expect(result?.outcome).toBe('timeout');
    expect(result?.success).toBe(false);
    expect(result?.detail).toMatch(/safety brake never armed/i);
  });

  it('fails a miscalibrated instrument that still looks plausible', () => {
    // The antagonist is bias, not gross error: a wrong wavelength shifts the
    // apparent endpoint without the trace looking obviously broken.
    const g = make(11, 0);
    g.act({ type: 'setGain', value: 1.0 });
    g.act({ type: 'setPhase', value: Math.PI });
    g.act({ type: 'setWavelength', value: 9 });
    const result = polishAndLock(g, g.state.true_.endpointSeconds);
    expect(result?.success).toBe(false);
  });
});

describe('input handling', () => {
  it('clamps every knob to its physical range', () => {
    const g = make();
    g.act({ type: 'setGain', value: 99 });
    expect(st(g).calibration.gain).toBe(CMP_GAIN_RANGE.max);
    g.act({ type: 'setGain', value: -5 });
    expect(st(g).calibration.gain).toBe(CMP_GAIN_RANGE.min);

    g.act({ type: 'setWavelength', value: 100 });
    expect(st(g).calibration.wavelength).toBe(CMP_WAVELENGTH_RANGE.max);

    g.act({ type: 'setPhase', value: 99 });
    expect(st(g).calibration.phase).toBeCloseTo(CMP_PHASE_RANGE.max, 6);
  });

  it('rounds the wavelength index to a whole setting', () => {
    const g = make();
    g.act({ type: 'setWavelength', value: 4.6 });
    expect(Number.isInteger(st(g).calibration.wavelength)).toBe(true);
  });

  it('rejects action after resolution', () => {
    const g = perfectlyCalibrated();
    polishAndLock(g, g.state.true_.endpointSeconds);
    expect(() => g.act({ type: 'setGain', value: 0.5 })).toThrow(/resolved/);
  });

  it('records the locked endpoint only once', () => {
    const g = perfectlyCalibrated();
    polishAndLock(g, g.state.true_.endpointSeconds);
    const locked = st(g).lockedEndpointSeconds;
    expect(locked).not.toBeNull();
    expect(() => g.act({ type: 'lockEndpoint' })).toThrow();
    expect(st(g).lockedEndpointSeconds).toBe(locked);
  });
});

describe('determinism and invariants', () => {
  it('replays identically for the same seed', () => {
    const play = () => {
      const g = make(2024, 0);
      g.act({ type: 'setWavelength', value: 5 });
      g.act({ type: 'setPhase', value: Math.PI });
      g.act({ type: 'setGain', value: 1 });
      return polishAndLock(g, g.state.true_.endpointSeconds);
    };
    expect(play()).toEqual(play());
  });

  it('always terminates', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const g = make(seed, 1);
      for (let i = 0; i < 4000 && !g.finished; i++) g.tick(DT);
      expect(g.finished).toBe(true);
    }));
  });

  it('never lets remaining thickness go negative', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const g = make(seed, 0);
      for (let i = 0; i < 4000 && !g.finished; i++) g.tick(DT);
      expect(g.state.true_.remainingNm).toBeGreaterThanOrEqual(0);
    }));
  });

  it('keeps reflectance inside [0,1] for every remaining thickness', () => {
    fc.assert(fc.property(fc.double({ min: 0, max: 5000, noNaN: true }), (nm) => {
      const r = reflectanceAt(nm);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }));
  });

  it('rolls a plausible miscalibrated instrument at any difficulty', () => {
    fc.assert(fc.property(fc.integer(), fc.double({ min: 0, max: 3, noNaN: true }), (seed, d) => {
      const c = rollCmpInstrument(new Rng(seed), d);
      expect(c.gain).toBeGreaterThanOrEqual(CMP_GAIN_RANGE.min);
      expect(c.gain).toBeLessThanOrEqual(CMP_GAIN_RANGE.max);
      expect(c.wavelength).toBeGreaterThanOrEqual(CMP_WAVELENGTH_RANGE.min);
      expect(c.wavelength).toBeLessThanOrEqual(CMP_WAVELENGTH_RANGE.max);
      expect(c.phase).toBeGreaterThanOrEqual(0);
      expect(c.phase).toBeLessThanOrEqual(CMP_PHASE_RANGE.max);
    }));
  });
});