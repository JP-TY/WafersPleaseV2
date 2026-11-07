/**
 * Minigame 2 — selective silicide wet etch (silicide bridging rework).
 *
 * Replaces `ReworkSilicideEtch.cs`. The rule the GDD cares about is unchanged:
 * C49 can be stripped, C54 cannot, and the phase is revealed only by the sheet
 * resistance the electron-microscope bench integrates.
 *
 * What changed, and why:
 *
 * 1. THE READOUT WAS INVERTED. Unity held `RsC49 = 0.85` (high) and
 *    `RsC54 = 0.20` (low) but printed the value through `1 - rs`, so C49
 *    displayed ~5.7 Ω/□ and C54 displayed ~15.2 Ω/□ — backwards relative to the
 *    physics, the variable names, and the file's own comment. Here Rs is
 *    reported directly in µΩ·cm against the literature values
 *    (C49 60–90, C54 12–15).
 *
 * 2. THE KINETICS WERE A SQUARE WAVE. Unity used `SmoothStep` between two flat
 *    plateaus. The real conversion is nucleation-and-growth: a C54 nucleus
 *    appears, then grows at constant front velocity consuming C49. That is
 *    Avrami behaviour, so this uses an Avrami law with the front advancing
 *    sigmoidally, and Rs falls as the parallel conduction of the two phases
 *    changes.
 *
 * 3. THE 45nm PROBLEM WAS ABSENT. Roy et al. (IBM, in-situ XRD of narrow-line
 *    arrays) measured the C49 -> C54 transition temperature rising by up to
 *    180 °C as linewidth fell from 1.0 µm to 0.1 µm, because C54 nucleation is
 *    suppressed in narrow lines. A 45 nm node is deep in that regime, so the
 *    conversion is modelled as retarded by `narrowLineRetardation`. This is why
 *    the defect is a crisis at 45 nm and would be routine at 90 nm.
 *
 * 4. OVER-WASHING WAS INERT. Unity had exactly one failure mode: firing outside
 *    the C49 window. In reality the etchant is not selective against the Ti
 *    contact it is meant to preserve, so an over-long wash thins the contact and
 *    raises its resistance. The player must both hit the window and stop.
 *
 * The etchant is NH4OH:H2O2:H2O = 1:3:5 at room temperature, selective for Ti
 * against SiO2/SiN/Si (IAEA INIS 49047202). HF is rejected there explicitly
 * because it undercuts the Si3N4 spacer.
 */

import {
  PROCESS,
  clamp01,
  realSeconds,
  type ReworkMinigame,
  type ReworkResult,
} from './process.js';
import type { Rng } from '../rng.js';
import type { Recipe } from './recipes.js';

export type SilicidePhase = 'C49' | 'Transition' | 'C54';

export interface SilicideReading {
  /** Sheet resistance in µΩ·cm. High when C49, low when C54. */
  readonly sheetResistanceMicroOhmCm: number;
  /** Fraction of the film converted to C54. */
  readonly c54Fraction: number;
  readonly phase: SilicidePhase;
  /**
   * Is the film still strippable? C49 is titanium-rich and unreacted enough for
   * the alkaline peroxide bath to lift it; once C54 nucleates the lattice is
   * stable and the stringer is part of the circuit.
   */
  readonly strippable: boolean;
}

export interface SilicideEtchState {
  /** Game seconds since the anneal started. */
  elapsedSeconds: number;
  /** Conversion time constant, game seconds. Retarded for 45 nm linewidth. */
  readonly tauSeconds: number;
  /** Player's total ultrasonic wash time, game seconds. */
  washSeconds: number;
  /** Inclusive wash window the commit grades against (from recipe). */
  readonly washMinSeconds: number;
  readonly washMaxSeconds: number;
  /** True while the ultrasonic transducer is running. */
  washing: boolean;
  /** Remaining Ti contact thickness, nm. */
  contactNm: number;
  reading: SilicideReading;
  finished: boolean;
  result: ReworkResult | null;
}

export type SilicideAction =
  | { type: 'startWash' }
  | { type: 'stopWash' }
  | { type: 'commit' };

/**
 * Avrami fraction converted to C54.
 *
 * `1 - exp(-(t/tau)^n)` is the standard nucleation-and-growth form; n = 3 gives
 * a sigmoidal front, matching the flat-then-sharp shape of a conversion anneal
 * observed by in-situ XRD rather than the smoothstep Unity used.
 */
export const c54FractionAt = (elapsedSeconds: number, tauSeconds: number): number => {
  if (elapsedSeconds <= 0 || tauSeconds <= 0) return 0;
  const x = elapsedSeconds / tauSeconds;
  return clamp01(1 - Math.exp(-Math.pow(x, PROCESS.silicide.avramiExponent)));
};

/**
 * Sheet resistance of a two-phase film.
 *
 * C49 and C54 regions conduct in parallel across the film, so the measured
 * sheet resistance is `1 / (f49/Rs49 + f54/Rs54)`. Using a weighted average
 * instead would let Rs fall below the C54 floor, which is unphysical.
 */
export const sheetResistanceAt = (elapsedSeconds: number, tauSeconds: number): number => {
  const f54 = c54FractionAt(elapsedSeconds, tauSeconds);
  const f49 = 1 - f54;
  const rsC49 = PROCESS.silicide.resistivityC49MicroOhmCm;
  const rsC54 = PROCESS.silicide.resistivityC54MicroOhmCm;
  const conductance = f49 / rsC49 + f54 / rsC54;
  return 1 / conductance;
};

export const phaseAt = (elapsedSeconds: number, tauSeconds: number): SilicidePhase => {
  const f54 = c54FractionAt(elapsedSeconds, tauSeconds);
  if (f54 < 0.05) return 'C49';
  if (f54 < 0.55) return 'Transition';
  return 'C54';
};

/** C49 is strippable only while essentially unconverted. */
const isStrippable = (f54: number): boolean => f54 < 0.05;

export interface SilicideRecipe {
  /** Conversion time constant for this wafer, game seconds. */
  readonly tauSeconds: number;
  /** Randomised so two wafers do not present identical pressure. */
  readonly tauJitter: number;
  /** Inclusive ultrasonic wash window, game seconds. */
  readonly washMinSeconds: number;
  readonly washMaxSeconds: number;
  /** Authored procedure for SOP cards / failure penalty. */
  readonly procedure: Recipe | null;
}

/** Default wash window when no authored recipe is supplied. */
export const DEFAULT_WASH_WINDOW = { min: 0.35, max: 2.2 } as const;

/**
 * Roll the per-wafer recipe.
 *
 * Unity rolled only `c49Duration` in 10-14 s and left `transitionDuration`
 * fixed. Here a single time constant governs the whole curve, jittered per
 * wafer, with the 45 nm retardation baked into the nominal. When an authored
 * `Recipe` is supplied, the WASH dwell window and RAMP nominal drive the
 * simulation instead of the hardcoded constants.
 */
export const rollSilicideRecipe = (
  rng: Rng,
  difficulty: number,
  procedure?: Recipe,
): SilicideRecipe => {
  const wash = procedure?.steps.find((s) => s.key === 'WASH');
  const ramp = procedure?.steps.find((s) => s.key === 'RAMP');
  // Nominal conversion time constant, game seconds. Retarded by the narrow-line
  // factor because this node is 45 nm. Authored RAMP dwell replaces the 11 s base.
  const base = ramp?.dwellSeconds ?? 11.0;
  const nominalTau = base * PROCESS.silicide.narrowLineRetardation;
  // Higher difficulty shortens the window.
  const scaled = nominalTau / Math.max(0.5, 1 + difficulty * 0.35);
  const jitter = rng.nextRange(0.85, 1.2);
  return {
    tauSeconds: scaled * jitter,
    tauJitter: jitter,
    washMinSeconds: wash?.dwellMinSeconds ?? DEFAULT_WASH_WINDOW.min,
    washMaxSeconds: wash?.dwellMaxSeconds ?? DEFAULT_WASH_WINDOW.max,
    procedure: procedure ?? null,
  };
};

export const createSilicideEtch = (
  recipe: SilicideRecipe,
): ReworkMinigame<SilicideEtchState, SilicideAction> => {
  const washMin = recipe.washMinSeconds ?? DEFAULT_WASH_WINDOW.min;
  const washMax = recipe.washMaxSeconds ?? DEFAULT_WASH_WINDOW.max;

  const state: SilicideEtchState = {
    elapsedSeconds: 0,
    tauSeconds: recipe.tauSeconds,
    washSeconds: 0,
    washMinSeconds: washMin,
    washMaxSeconds: washMax,
    washing: false,
    contactNm: PROCESS.silicide.contactThicknessNm,
    reading: {
      sheetResistanceMicroOhmCm: PROCESS.silicide.resistivityC49MicroOhmCm,
      c54Fraction: 0,
      phase: 'C49',
      strippable: true,
    },
    finished: false,
    result: null,
  };

  const refreshReading = (): void => {
    const f54 = c54FractionAt(state.elapsedSeconds, state.tauSeconds);
    state.reading = {
      sheetResistanceMicroOhmCm: sheetResistanceAt(state.elapsedSeconds, state.tauSeconds),
      c54Fraction: f54,
      phase: phaseAt(state.elapsedSeconds, state.tauSeconds),
      strippable: isStrippable(f54),
    };
  };

  const resolve = (result: ReworkResult): void => {
    state.finished = true;
    state.washing = false;
    state.result = result;
  };

  const contactResistancePenalty = (): number =>
    (PROCESS.silicide.contactThicknessNm - state.contactNm) * PROCESS.silicide.contactResistancePctPerNm;

  const tick = (dt: number): void => {
    if (state.finished) return;

    state.elapsedSeconds += dt;
    if (state.washing) {
      state.washSeconds += dt;
      // The bath strips Ti indiscriminately, including the contact it must keep.
      state.contactNm = Math.max(0, state.contactNm - PROCESS.silicide.contactEtchRateNmPerSecond * dt);
    }
    refreshReading();

    // Past full conversion the bridge is permanent. The player still gets to
    // commit, but the outcome is already decided.
    if (state.reading.phase === 'C54' && !state.finished) {
      const penalty = contactResistancePenalty();
      resolve({
        outcome: 'irreversible',
        success: false,
        quality: 0,
        detail: penalty > 5
          ? `No wash fired. C54 nucleated and grew across the stringer at ${realSeconds(state.elapsedSeconds).toFixed(0)} s of anneal — the bridge is now part of the circuit. The contact also thinned to ${state.contactNm.toFixed(1)} nm. Scrap.`
          : `No wash fired. C54 nucleated and grew across the stringer at ${realSeconds(state.elapsedSeconds).toFixed(0)} s of anneal. Once C54 forms the lattice is stable and the alkaline peroxide bath cannot lift it. Scrap.`,
        irreversible: true,
      });
    }
  };

  const act = (action: SilicideAction): void => {
    if (state.finished) {
      // Still allow a commit after the irreversible auto-resolve so the UI can
      // capture the player's intent, but the outcome cannot change.
      if (action.type === 'commit') return;
      throw new Error('etch already resolved');
    }

    switch (action.type) {
      case 'startWash':
        if (state.washing) return;
        state.washing = true;
        return;

      case 'stopWash':
        state.washing = false;
        return;

      case 'commit': {
        state.washing = false;
        const penalty = contactResistancePenalty();

        if (!state.reading.strippable) {
          resolve({
            outcome: 'irreversible',
            success: false,
            quality: 0,
            detail: `Committed at ${(state.reading.c54Fraction * 100).toFixed(0)}% C54. The conversion front has already consumed the stringer. Scrap.`,
            irreversible: true,
          });
          return;
        }

        // A wash must actually have happened to remove anything.
        if (state.washSeconds <= 0) {
          resolve({
            outcome: 'outOfSpec',
            success: false,
            quality: 0,
            detail: 'Committed without running the ultrasonic wash. The transducer was never energised, so the stringer is still on the sidewall spacer.',
            irreversible: false,
          });
          return;
        }

        // Enough time in C49 to strip the stringer, but not so much that the
        // contact is eaten. Both bounds come from the authored recipe window.
        const minWash = washMin;
        const maxWash = washMax;

        if (state.washSeconds < minWash) {
          resolve({
            outcome: 'outOfSpec',
            success: false,
            quality: clamp01(state.washSeconds / minWash) * 0.5,
            detail: `Only ${realSeconds(state.washSeconds).toFixed(1)} s of ultrasonic agitation — the stringer is only partially stripped and a residual bridge remains. Extend the wash.`,
            irreversible: false,
          });
          return;
        }

        if (state.washSeconds > maxWash) {
          resolve({
            outcome: 'irreversible',
            success: false,
            quality: 0,
            detail: `Washed for ${realSeconds(state.washSeconds).toFixed(1)} s. The etchant is not selective against the titanium contact, which is down to ${state.contactNm.toFixed(1)} nm of ${PROCESS.silicide.contactThicknessNm} nm — contact resistance up ${penalty.toFixed(0)}%. The wafer is now worse than the bridge it replaced.`,
            irreversible: true,
          });
          return;
        }

        // Success. Quality rewards a window centred between the two bounds.
        const centre = (minWash + maxWash) / 2;
        const halfSpan = (maxWash - minWash) / 2;
        const timing = 1 - Math.abs(state.washSeconds - centre) / halfSpan;
        const contactScore = 1 - clamp01(penalty / 60);
        resolve({
          outcome: 'success',
          success: true,
          quality: clamp01(0.5 + 0.5 * (0.5 * timing + 0.5 * contactScore)),
          detail: `Stringer stripped in ${realSeconds(state.washSeconds).toFixed(1)} s while the film was still C49 (Rₛ ${state.reading.sheetResistanceMicroOhmCm.toFixed(0)} µΩ·cm). Contact held at ${state.contactNm.toFixed(1)} nm, resistance penalty ${penalty.toFixed(0)}%.`,
          irreversible: false,
        });
        return;
      }
    }
  };

  refreshReading();
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