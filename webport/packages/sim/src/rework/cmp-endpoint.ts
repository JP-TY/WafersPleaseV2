/**
 * Minigame 3 — CMP laser endpoint calibration.
 *
 * Replaces `ReworkCmpCalibration.cs`.
 *
 * The Unity version had a category error at its centre: `ComputeMatch` scored
 * the *distance in parameter space* between three sliders and a hidden
 * reference, while `DrawTrace` drew a *pixel-space* damped sinusoid. The two
 * were never reconciled, so the number on the meter and the picture on the
 * scope could disagree, and the drawn curve had no endpoint feature in it at
 * all — a decaying sine with no knee cannot represent endpoint detection.
 *
 * Here the physics is the interferometer, and the knobs are real instrument
 * errors:
 *
 *  - DETECTOR GAIN sets signal-to-noise. Too low and the endpoint knee cannot be
 *    located to better than the noise floor.
 *  - LASER WAVELENGTH sets the fringe period, and the thickness scale is derived
 *    from it. Calibrated on the wrong wavelength and every thickness reading is
 *    systematically scaled — a real metrology error.
 *  - PHASE sets the fringe origin, a pure offset error.
 *
 * The signal has a real knee: reflectance is that of the layer being polished
 * until the overburden clears, then jumps to the stop layer's reflectance
 * because Si3N4 has different optical constants (n, k) than SiO2. That
 * inflection IS the endpoint, and polishing past it erodes the nitride and
 * dishes the field oxide. Sources: Applied Materials US6537133; Micron
 * US5798422; ICPT22 (STI-CMP nitride erosion and dishing); CNF Cornell CMP
 * primer (SiN as the STI stop layer).
 */

import {
  PROCESS,
  clamp,
  clamp01,
  type ReworkMinigame,
  type ReworkResult,
} from './process.js';
import type { Rng } from '../rng.js';
import { CMP_BRAKE_WAFERS, type Recipe } from './recipes.js';

export interface CmpInstrumentCalibration {
  /** Detector gain, 0.1..1. Sets SNR. */
  readonly gain: number;
  /** Laser wavelength index, 1..9. Sets fringe period and thickness scale. */
  readonly wavelength: number;
  /** Fringe phase offset, radians 0..2pi. Pure offset error. */
  readonly phase: number;
}

/** The calibration the instrument is actually set to, revealed as the trace. */
export interface CmpTrueState {
  /** Remaining overburden at the current moment, nm. Mutated as polish proceeds. */
  remainingNm: number;
  /** Starting overburden for this wafer, nm. Fixed for the run. */
  readonly initialOverburdenNm: number;
  /** Removal rate used by the polish, nm per game second. */
  readonly removalRateNmPerSecond: number;
  /** True endpoint thickness, i.e. when remaining hits the exposure threshold. */
  readonly endpointNm: number;
  /** True endpoint time, game seconds — the answer the player must find. */
  readonly endpointSeconds: number;
  elapsedSeconds: number;
}

export interface CmpSample {
  /** What the operator believes the remaining thickness is, nm. */
  readonly apparentNm: number;
  /** True remaining thickness, nm. */
  readonly trueNm: number;
  /** Reflectance 0..1, as the sensor sees it. */
  readonly reflectance: number;
  /** Metrology noise amplitude at this sample. */
  readonly noiseNm: number;
}

export interface CmpState {
  calibration: CmpInstrumentCalibration;
  readonly true_: CmpTrueState;
  /** Seconds of polish consumed. */
  elapsedSeconds: number;
  /** Whether the operator has committed the endpoint. */
  committed: boolean;
  /** Apparent endpoint the operator locked, game seconds. Null until committed. */
  lockedEndpointSeconds: number | null;
  /** Seconds of polish beyond the true endpoint — the over-polish budget. */
  overPolishSeconds: number;
  /** Shift clock for this run, from the authored recipe when present. */
  readonly timeLimitSeconds: number;
  /** Wafers the safety brake covers on a clean lock. */
  readonly brakeWafers: number;
  /** Authored timing tolerance floor, game seconds (scaled into the lock check). */
  readonly toleranceSeconds: number;
  finished: boolean;
  result: ReworkResult | null;
}

export type CmpAction =
  | { type: 'setGain'; value: number }
  | { type: 'setWavelength'; value: number }
  | { type: 'setPhase'; value: number }
  | { type: 'lockEndpoint' };

export const CMP_GAIN_RANGE = { min: 0.1, max: 1.0 } as const;
export const CMP_WAVELENGTH_RANGE = { min: 1, max: 9 } as const;
export const CMP_PHASE_RANGE = { min: 0, max: Math.PI * 2 } as const;
/** Seconds of polish available before the shift clock wins. */
export const CMP_TIME_LIMIT_SECONDS = 40;

/**
 * Optical signal: reflectance of whatever is currently at the surface.
 *
 * Below the exposure threshold it is the layer being polished; above it, the
 * stop layer. The step between them is the endpoint feature the player is
 * hunting. A short blend stands in for the finite spot size.
 */
export const reflectanceAt = (remainingNm: number): number => {
  const { reflectanceOxide: oxide, reflectanceNitride: nitride, endpointRemainingNm: threshold } = PROCESS.cmp;
  // Exposed fraction: 0 while oxide remains, rising to 1 as the last ~1.5 nm
  // clears (comparable to the sampling resolution, hence a short blend).
  const exposed = 1 - clamp01((remainingNm - threshold) / 1.5);
  return oxide + (nitride - oxide) * exposed;
};

/**
 * Thickness scale factor implied by the wavelength index.
 *
 * Interferometric thickness is `d = lambda / (2 n cos(theta))`, so the fringe
 * period and therefore the thickness-per-fringe conversion both scale with the
 * wavelength. Unity's "wavelength" was a frequency proxy with no physical
 * meaning; here it carries the scale error it should.
 */
export const CMP_REFERENCE_WAVELENGTH = 5;

export const thicknessScaleFor = (wavelengthIndex: number): number =>
  // Normalised so the reference index reads exactly 1.0; 1..9 spans 0.6..1.4.
  0.5 + wavelengthIndex / 10;

/** Fringe noise amplitude: falls with detector gain. */
export const noiseAmplitude = (gain: number): number =>
  // High gain is clean; low gain buries the knee. Floor of ~2 nm.
  26 * (1 - clamp01(gain)) ** 2 + 2;

/**
 * Apparent remaining thickness under the current instrument errors.
 *
 * Exported so the scope draws the SAME transformation the lock grades —
 * otherwise knobs move a number the player never sees on the curve.
 */
export const apparentRemainingNm = (
  trueRemainingNm: number,
  calibration: CmpInstrumentCalibration,
  elapsedSeconds: number,
): number => {
  const scale = thicknessScaleFor(calibration.wavelength);
  const scaled = Math.max(0, trueRemainingNm) / scale;
  const offset = ((calibration.phase / (Math.PI * 2)) - 0.5) * 8 * scale;
  const noise = noiseAmplitude(calibration.gain);
  const jitter = Math.sin(elapsedSeconds * 7.3 + calibration.phase * 3.1) * noise;
  return Math.max(0, scaled + offset + jitter);
};

/**
 * True remaining thickness at polish time `t`.
 *
 * Linear removal from the wafer's initial overburden. Shared by sample() and the
 * scope so the reference knee and the live playhead cannot disagree.
 */
export const trueRemainingAt = (
  t: number,
  initialOverburdenNm: number,
  removalRateNmPerSecond: number,
): number => Math.max(0, initialOverburdenNm - removalRateNmPerSecond * Math.max(0, t));

/** A single reading from the instrument. */
export const sample = (s: CmpState): CmpSample => {
  const remaining = Math.max(0, s.true_.remainingNm);
  const noise = noiseAmplitude(s.calibration.gain);
  return {
    apparentNm: apparentRemainingNm(remaining, s.calibration, s.true_.elapsedSeconds),
    trueNm: remaining,
    reflectance: reflectanceAt(remaining),
    noiseNm: noise,
  };
};

/** What the operator would infer the endpoint time is from the current trace. */
export const apparentEndpointSeconds = (s: CmpState): number => {
  const scale = thicknessScaleFor(s.calibration.wavelength);
  // Time to endpoint as the operator computes it from a mis-scaled trace.
  return s.true_.endpointSeconds * scale;
};

export const rollCmpInstrument = (rng: Rng, difficulty: number): CmpInstrumentCalibration => {
  // The instrument arrives miscalibrated; the player must find the correction.
  const slop = 1 + difficulty * 0.25;
  return {
    gain: clamp(rng.nextRange(0.15, 0.55) * slop, CMP_GAIN_RANGE.min, CMP_GAIN_RANGE.max),
    wavelength: Math.round(rng.nextRange(2, 8)),
    phase: rng.nextRange(0, Math.PI * 2),
  };
};

export const createCmpEndpoint = (
  rng: Rng,
  difficulty: number,
  recipe?: Recipe,
): ReworkMinigame<CmpState, CmpAction> => {
  const overburden = PROCESS.cmp.initialOverburdenNm * (1 + rng.nextRange(-0.08, 0.08));
  const rate = PROCESS.cmp.removalRateNmPerSecond * (1 + rng.nextRange(-0.06, 0.06));
  const endpointNm = PROCESS.cmp.endpointRemainingNm;
  const endpointSeconds = Math.max(1, (overburden - endpointNm) / rate);
  void difficulty;

  // Authored ideal timing is the polish window; the shift clock is twice that so
  // a late lock is still possible. Without a recipe we keep the documented 40 s.
  const timeLimitSeconds =
    recipe && recipe.nominalSeconds > 0 ? Math.max(recipe.nominalSeconds * 2, 20) : CMP_TIME_LIMIT_SECONDS;
  const toleranceSeconds = recipe && recipe.toleranceSeconds > 0 ? recipe.toleranceSeconds : 5;
  const brakeWafers = recipe?.brakeWafers ?? CMP_BRAKE_WAFERS;
  // Map authored tolerance (seconds of procedure slop) onto the instrument lock
  // floor so editing rework.json changes what the sim enforces.
  const toleranceFloor = Math.max(0.08, toleranceSeconds * 0.024);

  const state: CmpState = {
    calibration: rollCmpInstrument(rng, difficulty),
    true_: {
      remainingNm: overburden,
      initialOverburdenNm: overburden,
      removalRateNmPerSecond: rate,
      endpointNm,
      endpointSeconds,
      elapsedSeconds: 0,
    },
    elapsedSeconds: 0,
    committed: false,
    lockedEndpointSeconds: null,
    overPolishSeconds: 0,
    timeLimitSeconds,
    brakeWafers,
    toleranceSeconds,
    finished: false,
    result: null,
  };

  const resolve = (result: ReworkResult): void => {
    state.finished = true;
    state.result = result;
  };

  const tick = (dt: number): void => {
    if (state.finished) return;
    state.elapsedSeconds += dt;
    state.true_.elapsedSeconds = state.elapsedSeconds;
    state.true_.remainingNm = Math.max(0, state.true_.remainingNm - rate * dt);

    // Over-polish accrues from the moment the stop layer is exposed, whether or
    // not the model has finished counting the last nanometre.
    state.overPolishSeconds = Math.max(0, state.elapsedSeconds - endpointSeconds);

    if (state.elapsedSeconds >= timeLimitSeconds) {
      resolve({
        outcome: 'timeout',
        success: false,
        quality: 0,
        detail:
          `The polish ran past the shift clock with the endpoint uncommitted. The safety brake never armed, so the next ${brakeWafers} wafers polish into nitride erosion and field-oxide dishing with nothing to stop them.`,
        irreversible: true,
      });
    }
  };

  const act = (action: CmpAction): void => {
    if (state.finished) throw new Error('calibration already resolved');

    switch (action.type) {
      case 'setGain':
        state.calibration = { ...state.calibration, gain: clamp(action.value, CMP_GAIN_RANGE.min, CMP_GAIN_RANGE.max) };
        return;
      case 'setWavelength':
        state.calibration = {
          ...state.calibration,
          wavelength: Math.round(clamp(action.value, CMP_WAVELENGTH_RANGE.min, CMP_WAVELENGTH_RANGE.max)),
        };
        return;
      case 'setPhase':
        state.calibration = { ...state.calibration, phase: clamp(action.value, CMP_PHASE_RANGE.min, CMP_PHASE_RANGE.max) };
        return;

      case 'lockEndpoint': {
        state.committed = true;

        // Two independent errors, and conflating them was the Unity bug:
        //
        //  - READING error: what the operator infers from their trace. Biased by
        //    wavelength and phase, blurred by gain-dependent noise.
        //  - TIMING error: how long the pad actually kept moving before they
        //    committed. This is wall-clock and accrues damage whether or not the
        //    reading was right.
        //
        // Unity scored only the first and drew a curve with no knee in it.
        const apparent = apparentEndpointSeconds(state);
        state.lockedEndpointSeconds = apparent;

        const uncertainty = noiseAmplitude(state.calibration.gain) / rate;
        const readingError = Math.abs(apparent - endpointSeconds);
        const tolerance = Math.max(uncertainty * 1.5, toleranceFloor);

        const overPolish = Math.max(0, state.elapsedSeconds - endpointSeconds);
        const early = state.elapsedSeconds < endpointSeconds;
        const nitrideLoss = overPolish * rate;
        const dishing = overPolish * PROCESS.cmp.dishingRateNmPerSecond;
        const scrapped =
          nitrideLoss > PROCESS.cmp.nitrideErosionThresholdNm ||
          dishing > PROCESS.cmp.dishingLimitNm;

        if (scrapped) {
          resolve({
            outcome: 'irreversible',
            success: false,
            quality: 0,
            detail: `Endpoint committed ${overPolish.toFixed(2)} s after the stop layer was exposed: ${nitrideLoss.toFixed(0)} nm of Si₃N₄ eroded (limit ${PROCESS.cmp.nitrideErosionThresholdNm} nm) and ${dishing.toFixed(0)} nm of field-oxide dishing (limit ${PROCESS.cmp.dishingLimitNm} nm). The active areas are exposed to slurry. Unrecoverable.`,
            irreversible: true,
          });
          return;
        }

        if (readingError <= tolerance) {
          resolve({
            outcome: 'success',
            success: true,
            quality: clamp01(1 - (readingError / Math.max(tolerance, 1e-6) + overPolish / Math.max(timeLimitSeconds, 1e-6)) / 2),
            detail: `Endpoint read at ${apparent.toFixed(2)} s against a true ${endpointSeconds.toFixed(2)} s — inside the ${uncertainty.toFixed(2)} s noise floor at gain ${state.calibration.gain.toFixed(2)}${overPolish > 0 ? `, with ${overPolish.toFixed(2)} s of over-polish already taken` : ', with the pad stopped clean'}. Safety brake armed for the next ${brakeWafers} wafers.`,
            irreversible: false,
          });
          return;
        }

        resolve({
          outcome: 'outOfSpec',
          success: false,
          quality: clamp01(1 - readingError / (tolerance * 6)),
          detail: early
            ? `Endpoint committed ${(endpointSeconds - state.elapsedSeconds).toFixed(2)} s before the knee was in the data — you locked a guess. The reading is off by ${readingError.toFixed(2)} s against a ${tolerance.toFixed(2)} s limit.`
            : `Endpoint read ${readingError.toFixed(2)} s ${apparent > endpointSeconds ? 'long' : 'short'} — ${readingError > tolerance * 3 ? 'far outside' : 'outside'} the ${tolerance.toFixed(2)} s resolvable at gain ${state.calibration.gain.toFixed(2)}. ${nitrideLoss.toFixed(0)} nm of nitride eroded and ${dishing.toFixed(0)} nm of dishing: inside the scrap limits, but the brake did not arm cleanly.`,
          irreversible: false,
        });
        return;
      }
    }
  };

  return {
    get state() {
      return state;
    },
    tick,
    act,
    get finished() {
      return state.finished;
    },
    get result() {
      return state.result;
    },
  };
};