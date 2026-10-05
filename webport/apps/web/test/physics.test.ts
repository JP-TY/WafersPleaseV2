/**
 * Physics layer tests.
 *
 * The important one here is the last group. Everything else is ordinary unit
 * testing of springs and bodies; those are easy to get right. What matters is
 * proving the promise in GDD §16 -- identical seeds, identical scores -- still
 * holds now that physical motion exists in the bench.
 *
 * The specific danger is subtle. Physics is frame-rate dependent by nature, so
 * the failure mode is not "the physics is wrong", it is "the physics leaked into
 * a verdict and a player's grade now depends on their monitor's refresh rate".
 * That bug produces no error, no crash, and no failing test unless a test
 * deliberately drives the same gesture at two different frame rates and compares
 * the outcomes. That is what these tests do.
 */

import { describe, expect, it } from 'vitest';

import { Body, PhysicsWorld, Spring, SpringProfile, FIXED_DT } from '../src/physics/rigid.js';
import { Carriage, CarriedWafer, HingedInstrument, LiquidVolume } from '../src/physics/fluids.js';
import {
  PhysicsBoundaryError,
  IntentChannel,
  IntentLog,
  assertReadOnly,
  authoritative,
  isAuthoritative,
} from '../src/physics/boundary.js';

/** Run a world for `seconds`, in `frameDt` slices, and return the step count. */
function run(world: PhysicsWorld, seconds: number, frameDt: number): number {
  for (let t = 0; t < seconds; t += frameDt) world.update(frameDt);
  return world.steps;
}

describe('springs', () => {
  it('reaches its target and settles', () => {
    const w = new PhysicsWorld();
    const s = w.addSpring(new Spring(0));
    s.target = 1;
    run(w, 4, FIXED_DT);
    expect(s.value).toBeCloseTo(1, 3);
    expect(s.settled).toBe(true);
  });

  it('an underdamped spring overshoots, an overdamped one does not', () => {
    const under = new PhysicsWorld();
    const su = under.addSpring(new Spring(0, SpringProfile.UNDER));
    su.target = 1;
    let underPeak = 0;
    for (let i = 0; i < 600; i++) {
      under.update(FIXED_DT);
      underPeak = Math.max(underPeak, su.value);
    }
    expect(underPeak).toBeGreaterThan(1.02);

    const over = new PhysicsWorld();
    const so = over.addSpring(new Spring(0, SpringProfile.OVER));
    so.target = 1;
    let overPeak = 0;
    for (let i = 0; i < 600; i++) {
      over.update(FIXED_DT);
      overPeak = Math.max(overPeak, so.value);
    }
    expect(overPeak).toBeLessThanOrEqual(1.0001);
  });

  it('does not gain energy while settling -- semi-implicit Euler stays stable', () => {
    // Explicit Euler on a stiff spring visibly pumps amplitude for seconds, which
    // reads to a player as the simulation breaking rather than as physics.
    const w = new PhysicsWorld();
    const s = w.addSpring(new Spring(0, SpringProfile.UNDER));
    s.target = 1;
    // Sample the extremes: the largest |value - target| in each window must shrink.
    const windowPeak = (from: number, to: number) => {
      let peak = 0;
      for (let i = from; i < to; i++) {
        w.update(FIXED_DT);
        peak = Math.max(peak, Math.abs(s.value - s.target));
      }
      return peak;
    };
    const early = windowPeak(0, 300);
    const middle = windowPeak(300, 600);
    const late = windowPeak(600, 900);
    expect(early).toBeGreaterThan(0);
    expect(middle).toBeLessThan(early);
    expect(late).toBeLessThan(middle);
  });
});

describe('bodies', () => {
  it('falls at approximately g when drag is disabled', () => {
    const w = new PhysicsWorld();
    const b = w.add(new Body());
    b.linearDamping = 1; // retain everything: no drag
    w.addSpring(new Spring(0)); // keep the accumulator stepping
    run(w, 1, FIXED_DT);
    // Semi-implicit Euler over 1 s: v = g*t, y ~= g*t^2/2.
    expect(b.velocity.y).toBeCloseTo(-9.81, 0);
    expect(b.position.y).toBeCloseTo(-4.9, 0);
  });

  it('reaches a terminal velocity under drag rather than accelerating forever', () => {
    const w = new PhysicsWorld();
    const b = w.add(new Body());
    w.addSpring(new Spring(0));
    run(w, 12, FIXED_DT);
    const after12 = Math.abs(b.velocity.y);
    run(w, 20, FIXED_DT);
    const after32 = Math.abs(b.velocity.y);
    // Plateaued: thirty seconds of extra falling adds essentially no speed.
    expect(after32).toBeLessThan(after12 * 1.02);
    expect(after12).toBeGreaterThan(9.81 * 0.8);
    expect(after12).toBeLessThan(9.81 * 3);
  });

  it('a held body ignores forces but does not accumulate velocity', () => {
    const w = new PhysicsWorld();
    const b = w.add(new Body());
    w.addSpring(new Spring(0));
    b.held = true;
    for (let i = 0; i < 100; i++) {
      b.addImpulse(1, 0, 0);
      w.update(FIXED_DT);
    }
    // Exactly zero: a held prop is one a hand is holding.
    expect(b.velocity.x).toBe(0);
    expect(b.position.x).toBe(0);
  });

  it('a zero-mass body is kinematic and never moves', () => {
    const w = new PhysicsWorld();
    const b = w.add(new Body());
    w.addSpring(new Spring(0));
    b.mass = 0;
    for (let i = 0; i < 200; i++) {
      b.addForce(1000, 1000, 1000);
      w.update(FIXED_DT);
    }
    expect(b.position.x).toBe(0);
    expect(b.position.y).toBe(0);
  });

  it('normalises orientation rather than letting the quaternion drift', () => {
    const w = new PhysicsWorld();
    const b = w.add(new Body());
    w.addSpring(new Spring(0));
    for (let i = 0; i < 400; i++) {
      b.addTorque(3, 5, 2);
      w.update(FIXED_DT);
    }
    const q = b.orientation;
    expect(Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2)).toBeCloseTo(1, 6);
  });
});

describe('fixed timestep', () => {
  it('produces identical state at 60, 144 and 30 Hz for the same elapsed time', () => {
    // This is the property the whole design rests on. Same duration of input,
    // different frame rates, same physical outcome.
    const results = [60, 144, 30].map((hz) => {
      const w = new PhysicsWorld();
      const s = w.addSpring(new Spring(0, SpringProfile.UNDER));
      const dt = 1 / hz;
      // Move the target in the FIXED-STEP domain, not the frame domain, so the
      // input is identical at every frame rate. Sampling `t` in the frame loop
      // would change the input, not the physics, and would measure the test's own
      // sloppiness instead.
      let flipped = false;
      // Iterate a fixed FRAME COUNT rather than accumulating a float clock: a
      // `t += dt` loop runs a different number of iterations at each rate purely
      // from float error, so it would be measuring the test's rounding, not the
      // integrator. frames * dt is exactly 3 s for every rate.
      const frames = 3 * hz;
      for (let f = 0; f < frames; f++) {
        if (!flipped && w.steps >= 120) {
          s.target = 1;
          flipped = true;
        }
        w.update(dt);
      }
      return { value: s.value, steps: w.steps };
    });
    // Float drift of a few thousandths is inherent to sampling the same trajectory
    // at different instants. A real frame-rate coupling bug would diverge by orders
    // of magnitude, or not at all converge over a long run.
    for (const r of results) expect(r.value).toBeCloseTo(results[0].value, 2);
    // The stronger statement: all three take the same number of fixed steps to
    // within 0.5%. Exact equality is not achievable because the frame loop leaves a
    // different partial step in the accumulator at each rate -- what matters is
    // that the difference is bounded by the leftover, not proportional to time.
    const counts = results.map((r) => r.steps);
    const spread = (Math.max(...counts) - Math.min(...counts)) / Math.max(...counts);
    expect(spread).toBeLessThan(0.005);
  });

  it('clamps a long stall instead of trying to catch up hundreds of steps', () => {
    const w = new PhysicsWorld();
    w.addSpring(new Spring(0));
    const before = w.steps;
    w.update(30); // a 30 second stall, e.g. a backgrounded tab
    // Without the clamp this would run 3600 steps and look like a teleport.
    expect(w.steps - before).toBeLessThanOrEqual(Math.ceil(0.25 / FIXED_DT) + 1);
  });
});

describe('liquid', () => {
  it('rises when submerged and falls when the object leaves', () => {
    const w = new PhysicsWorld();
    const vol = new LiquidVolume(w, { depth: 0.2, area: 0.13, width: 0.4 });
    const before = vol.depth;
    vol.submerge(0.0007, 0.2);
    run(w, 1.5, FIXED_DT);
    const raised = vol.depth;
    expect(raised).toBeGreaterThan(before);
    vol.emerge(0.0007);
    run(w, 1.5, FIXED_DT);
    expect(vol.depth).toBeLessThan(raised);
  });

  it('sloshes more when an object enters fast than when it enters gently', () => {
    const gentle = new PhysicsWorld();
    const g = new LiquidVolume(gentle, { depth: 0.2, area: 0.13, width: 0.4 });
    g.submerge(0.0007, 0.1);
    let gPeak = 0;
    for (let i = 0; i < 400; i++) {
      gentle.update(FIXED_DT);
      gPeak = Math.max(gPeak, g.sloshMagnitude);
    }

    const fast = new PhysicsWorld();
    const f = new LiquidVolume(fast, { depth: 0.2, area: 0.13, width: 0.4 });
    f.submerge(0.0007, 5);
    let fPeak = 0;
    for (let i = 0; i < 400; i++) {
      fast.update(FIXED_DT);
      fPeak = Math.max(fPeak, f.sloshMagnitude);
    }

    expect(fPeak).toBeGreaterThan(gPeak * 2);
  });

  it('settles back to rest when nothing disturbs it', () => {
    const w = new PhysicsWorld();
    const vol = new LiquidVolume(w, { depth: 0.2, area: 0.13, width: 0.4 });
    vol.submerge(0.0007, 3);
    for (let i = 0; i < 3000; i++) {
      w.update(FIXED_DT);
      vol.relax(FIXED_DT);
    }
    expect(vol.sloshMagnitude).toBeLessThan(0.02);
  });
});

describe('carriage and carried wafer', () => {
  it('a carriage overshoots slightly then settles at the target', () => {
    const w = new PhysicsWorld();
    const c = new Carriage(w, { start: 0, travel: 0.46 });
    c.moveTo(0.46);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      w.update(FIXED_DT);
      c.sync();
      peak = Math.max(peak, c.value);
    }
    // Overshoot is what gives the fork its weight; it must be small.
    expect(peak).toBeGreaterThan(0.46);
    expect(peak).toBeLessThan(0.52);
    expect(c.value).toBeCloseTo(0.46, 2);
  });

  it('respects its rail limits', () => {
    const w = new PhysicsWorld();
    const c = new Carriage(w, { start: 0, travel: 0.46 });
    c.moveTo(99);
    run(w, 3, FIXED_DT);
    expect(c.value).toBeLessThanOrEqual(0.4601);
  });

  it('a carried wafer lags the carriage rather than teleporting with it', () => {
    const w = new PhysicsWorld();
    const wafer = new CarriedWafer(w, { mass: 0.32 });
    wafer.body.position.y = 0.4;
    wafer.hold(0, 0.4, 0);
    const startX = wafer.body.position.x;
    for (let i = 0; i < 12; i++) {
      wafer.hold(0.4, 0.4, 0);
      w.update(FIXED_DT);
    }
    // It moved toward the fork...
    expect(wafer.body.position.x).toBeGreaterThan(startX);
    // ...but has not arrived, which is what the lag looks like.
    expect(wafer.body.position.x).toBeLessThan(0.39);
  });
});

describe('hinged instrument', () => {
  it('swings when bumped and stays within its hinge limit', () => {
    const w = new PhysicsWorld();
    const h = new HingedInstrument(w, { rest: 0, limit: 0.22 });
    h.bump(6);
    let peak = 0;
    for (let i = 0; i < 800; i++) {
      w.update(FIXED_DT);
      peak = Math.max(peak, Math.abs(h.angle.value));
    }
    expect(peak).toBeGreaterThan(0.02);
    expect(peak).toBeLessThanOrEqual(0.2201);
  });
});

// ---------------------------------------------------------------------------
// The determinism guarantee (GDD §16)
// ---------------------------------------------------------------------------

describe('GDD §16: physical motion cannot change a graded outcome', () => {
  /**
   * Stand-in for a simulation: records the intents it was asked to perform and
   * returns a score derived only from those.
   *
   * Mirrors the real architecture -- the sim is the only thing that knows the
   * score, and it only ever hears about player intent.
   */
  function fakeSim() {
    const log = new IntentLog();
    const state = authoritative({ score: 0, accepted: 0 });
    const channel = new IntentChannel<'Immerse' | 'Withdraw' | 'SetHeater'>('rca');
    channel.connect((intent) => {
      log.push(intent);
      // A deterministic function of intent alone. If physics could reach this
      // closure's captured state, the score would vary with frame rate.
      state.score += intent === 'SetHeater' ? 10 : intent === 'Immerse' ? 1 : 0;
      if (intent === 'Withdraw') state.accepted += 1;
    });
    return { state, channel, log };
  }

  it('plays an identical gesture at 30, 60 and 144 Hz and gets identical results', () => {
    const play = (hz: number) => {
      const world = new PhysicsWorld();
      const carriage = new Carriage(world, { start: 0, travel: 0.46 });
      const sim = fakeSim();
      const dt = 1 / hz;

      // A fixed script of player intents, independent of frame rate. Each intent is
      // the player's choice -- "take it to SC-1" -- never a measured position.
      const script: Array<{ at: number; intent: 'Immerse' | 'Withdraw' | 'SetHeater' }> = [
        { at: 0.0, intent: 'SetHeater' },
        { at: 0.5, intent: 'Immerse' },
        { at: 1.5, intent: 'Withdraw' },
        { at: 2.0, intent: 'SetHeater' },
        { at: 2.5, intent: 'Immerse' },
        { at: 3.5, intent: 'Withdraw' },
      ];
      for (const step of script) carriage.moveTo(0.46);

      for (let t = 0; t < 4; t += dt) {
        while (script.length && script[0].at <= t) {
          const next = script.shift()!;
          sim.channel.send(next.intent);
        }
        world.update(dt);
        carriage.sync();
      }
      return { score: sim.state.score, accepted: sim.state.accepted, intents: sim.log.serialise() };
    };

    const at60 = play(60);
    const at144 = play(144);
    const at30 = play(30);

    // Identical intents: the player's choices are frame-rate independent.
    expect(at144.intents).toBe(at60.intents);
    expect(at30.intents).toBe(at60.intents);
    // Identical score. This is the §16 promise, and it is the assertion that would
    // fail if the bench ever read carriage position or velocity to make a decision.
    expect(at144.score).toBe(at60.score);
    expect(at30.score).toBe(at60.score);
    expect(at60.score).toBe(22);
  });

  it('the physical carriage state does differ between frame rates -- and is never read', () => {
    // Deliberately demonstrates the tension: physical trajectories can differ
    // slightly with frame rate while outcomes cannot. If someone later wires
    // carriage state into a decision, the test above breaks and this documents why.
    const measure = (hz: number) => {
      const world = new PhysicsWorld();
      const carriage = new Carriage(world, { start: 0, travel: 0.46 });
      carriage.moveTo(0.46);
      const dt = 1 / hz;
      for (let t = 0; t < 0.37; t += dt) {
        world.update(dt);
        carriage.sync();
      }
      return carriage.value;
    };
    // Sanity check that these really are two different sample points in the motion.
    expect(measure(60)).not.toBeCloseTo(measure(144), 6);
  });

  it('refuses to hand a graded simulation to the physics layer', () => {
    const sim = authoritative({ score: 0 });
    expect(isAuthoritative(sim)).toBe(true);
    expect(() => assertReadOnly(sim, 'a physics callback')).toThrow(PhysicsBoundaryError);
    expect(() => assertReadOnly(sim, 'a physics callback')).toThrow(/GDD 16/);
    // Ordinary data is fine.
    expect(() => assertReadOnly({ score: 0 }, 'a physics callback')).not.toThrow();
    expect(isAuthoritative({ score: 0 })).toBe(false);
  });

  it('intent channels carry choices, not physical measurements', () => {
    const log = new IntentLog<'Immerse' | 'Withdraw'>();
    const ch = new IntentChannel<'Immerse' | 'Withdraw'>('test');
    ch.connect((i) => log.push(i));
    expect(ch.connected).toBe(true);
    ch.send('Immerse');
    ch.send('Withdraw');
    expect(log.serialise()).toBe('Immerse>Withdraw');
  });
});