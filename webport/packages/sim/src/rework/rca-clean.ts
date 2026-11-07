/**
 * Minigame 1 — RCA clean (substrate contamination rework).
 *
 * Replaces `ReworkRcaClean.cs`. What the physics model actually contains, and
 * what the Unity version contained instead:
 *
 * | Aspect | Unity `ReworkRcaClean` | Here |
 * |---|---|---|
 * | Baths | ONE `bathTemp` shared by two physically separate tanks | per-tank state |
 * | Temperature | checked once, at the instant of RAISE | Arrhenius-weighted, integrated over the whole soak |
 * | Thermal model | `MoveTowards` at 45 °C/s, no mass, no cooling | finite slew with passive cooling toward ambient |
 * | Rinse steps | none | QDR between every bath, as every real RCA SOP specifies |
 * | SC-2 temperature | same 70-80 °C as SC-1 | 30-40 °C band, per Metrohm's inline spec |
 * | Time | ~6 s dwell | ~10 s game = 10 real minutes, via the named compression |
 * | Time integration | dwell starts during the 0.4 s dip animation | dwell starts at immersion |
 *
 * The load-bearing rule is unchanged and is the point of the exercise: SC-1
 * removes organics, SC-2 removes metal ions, and you need both, in order, each
 * at its own temperature and its own dwell.
 */

import {
  PROCESS,
  arrheniusRatio,
  clamp,
  clamp01,
  realMinutes,
  stepBathTemperature,
  type ReworkMinigame,
  type ReworkResult,
} from './process.js';
import type { Rng } from '../rng.js';
import type { Recipe } from './recipes.js';

export type RcaStepKind = 'SC1' | 'QDR1' | 'SC2' | 'QDR2';

export interface RcaStep {
  readonly kind: RcaStepKind;
  readonly label: string;
  readonly chemistry: string;
  readonly removes: string;
  readonly targetC: { min: number; nominal: number; max: number };
  /** Real minutes, for player-facing material. */
  readonly realDwellMinutes: { min: number; nominal: number; max: number };
  /** Game seconds. */
  readonly dwellSeconds: number;
}

export interface RcaBath {
  readonly label: string;
  readonly chemistry: string;
  /** Current bath temperature, degrees C. */
  temperatureC: number;
  /** Player's heater setpoint, degrees C. */
  setpointC: number;
}

export interface RcaCleanState {
  /** Current position in the fixed SC-1 -> QDR -> SC-2 -> QDR sequence. */
  stepIndex: number;
  step: RcaStep;
  readonly baths: { sc1: RcaBath; sc2: RcaBath };
  /** The tank the active step's wafer is in. */
  active: 'sc1' | 'sc2' | 'qdr';
  /** Is the wafer submerged right now? */
  immersed: boolean;
  /** Seconds spent immersed in the current step. */
  dwellSeconds: number;
  /** Arrhenius (or rinse) exposure accumulated while immersed this step. */
  exposure: number;
  /** Substrate damage accrued across chemical steps so far. */
  cumulativeDamage: number;
  /** True once the step's timer has run past any plausible recovery. */
  timedOut: boolean;
  finished: boolean;
  result: ReworkResult | null;
}

export type RcaAction =
  | { type: 'setHeater'; bath: 'sc1' | 'sc2'; setpointC: number }
  | { type: 'immerse' }
  | { type: 'withdraw' };

/** The built-in step table, kept for reference and as the no-config default. */
const BUILTIN_STEPS: readonly RcaStep[] = [
  {
    kind: 'SC1',
    label: 'SC-1 — ALKALINE ORGANIC / PARTICLE CLEAN',
    chemistry: PROCESS.rca.sc1.chemistry,
    removes: PROCESS.rca.sc1.removes,
    targetC: PROCESS.rca.sc1.target,
    realDwellMinutes: { min: 10, nominal: 10, max: 15 },
    dwellSeconds: PROCESS.rca.sc1.dwellSeconds.nominal,
  },
  {
    kind: 'QDR1',
    label: 'QDR — MEGASONIC DI RINSE',
    chemistry: PROCESS.rca.qdr.chemistry,
    removes: 'Carryover of alkaline and peroxide between baths',
    targetC: PROCESS.rca.qdr.target,
    realDwellMinutes: { min: 2, nominal: 5, max: 5 },
    dwellSeconds: PROCESS.rca.qdr.dwellSeconds.nominal,
  },
  {
    kind: 'SC2',
    label: 'SC-2 — ACIDIC METAL-ION CLEAN',
    chemistry: PROCESS.rca.sc2.chemistry,
    removes: PROCESS.rca.sc2.removes,
    targetC: PROCESS.rca.sc2.target,
    realDwellMinutes: { min: 10, nominal: 10, max: 12 },
    dwellSeconds: PROCESS.rca.sc2.dwellSeconds.nominal,
  },
  {
    kind: 'QDR2',
    label: 'QDR — FINAL MEGASONIC RINSE',
    chemistry: PROCESS.rca.qdr.chemistry,
    removes: 'Final ionic and particulate carryover',
    targetC: PROCESS.rca.qdr.target,
    realDwellMinutes: { min: 2, nominal: 5, max: 5 },
    dwellSeconds: PROCESS.rca.qdr.dwellSeconds.nominal,
  },
];

/**
 * Build the step table, optionally from an authored recipe.
 *
 * The config supplies the WINDOWS the player is graded against. That is the
 * point of routing it through here rather than leaving STEPS as a constant: edit
 * a temperature window in `packages/data/config/rework.json` and the simulation
 * changes what it enforces, instead of the data asset and the running game
 * disagreeing with nothing to detect it.
 */
export function buildRcaSteps(recipe?: Recipe): readonly RcaStep[] {
  if (!recipe) return BUILTIN_STEPS;
  return recipe.steps.map((s) => ({
    kind: s.key as RcaStepKind,
    label: s.label,
    chemistry: s.chemistry,
    removes: s.removes,
    targetC: s.targetC,
    realDwellMinutes: s.realDwellMinutes,
    dwellSeconds: s.dwellSeconds,
  }));
}

/**
 * Integrated chemical exposure for the current step.
 *
 * Exported because a view has to draw the removal curve, and a view that
 * recomputes it from `PROCESS` is a second implementation that will eventually
 * disagree with the simulation it is supposed to be reporting. One function, one
 * answer.
 */
export const rcaExposure = (s: RcaCleanState): number => s.exposure;

/** Instantaneous exposure rate for the active step at the current bath temp. */
export const rcaExposureRate = (s: RcaCleanState): number => {
  if (s.step.kind === 'QDR1' || s.step.kind === 'QDR2') {
    return PROCESS.rca.completionExposure / Math.max(s.step.dwellSeconds, 1e-6);
  }
  const bath = s.step.kind === 'SC2' ? s.baths.sc2 : s.baths.sc1;
  return (
    PROCESS.rca.preExponential *
    arrheniusRatio(bath.temperatureC, s.step.targetC.nominal, PROCESS.rca.activationEnergyJPerMol)
  );
};

/** Fraction of the target film removed. Bounded by 1 by construction. */
export const rcaRemovalFraction = (s: RcaCleanState): number => 1 - Math.exp(-rcaExposure(s));

/** Surplus exposure past completion, which is substrate attack. */
export const rcaSubstrateDamage = (s: RcaCleanState): number => {
  if (s.step.kind === 'QDR1' || s.step.kind === 'QDR2') return 0;
  return Math.max(0, rcaExposure(s) - PROCESS.rca.completionExposure) * PROCESS.rca.damageCoeff;
};

/** How many times the whole step sequence may be attempted. */
export const RCA_MAX_ATTEMPTS = 1;

/**
 * Build the clean.
 *
 * Both attempts run the identical step sequence; the only difference between a
 * fresh attempt and a retry is that the player now knows the recipe, which is
 * exactly the competence the training is meant to build.
 */
export const createRcaClean = (
  rng: Rng,
  difficulty: number,
  recipe?: Recipe,
): ReworkMinigame<RcaCleanState, RcaAction> => {
  void rng;
  void difficulty;

  const steps = buildRcaSteps(recipe);

  const state: RcaCleanState = {
    stepIndex: 0,
    step: steps[0]!,
    baths: {
      sc1: {
        label: PROCESS.rca.sc1.name,
        chemistry: PROCESS.rca.sc1.chemistry,
        temperatureC: PROCESS.rca.sc1.ambientC,
        setpointC: PROCESS.rca.sc1.ambientC,
      },
      sc2: {
        label: PROCESS.rca.sc2.name,
        chemistry: PROCESS.rca.sc2.chemistry,
        temperatureC: PROCESS.rca.sc2.ambientC,
        setpointC: PROCESS.rca.sc2.ambientC,
      },
    },
    active: 'sc1',
    immersed: false,
    dwellSeconds: 0,
    exposure: 0,
    cumulativeDamage: 0,
    timedOut: false,
    finished: false,
    result: null,
  };

  const bathFor = (s: RcaCleanState): RcaBath =>
    s.step.kind === 'SC1' ? s.baths.sc1 : s.step.kind === 'SC2' ? s.baths.sc2 : s.baths.sc1;

  /**
   * Cumulative Arrhenius exposure of the soak so far, dimensionless.
   *
   * Integrates the Arrhenius-scaled rate over the whole soak rather than
   * comparing a single temperature reading at the end, which is how the Unity
   * version decided it: a player could soak correctly and then slam the heater
   * to 95 in the frame they raised the wafer, and fail.
   */
  // Delegate to the exported functions so the view and the verdict can never
  // disagree about how far along the clean is.
  const removalFraction = rcaRemovalFraction;
  /**
   * Surplus exposure past completion, which is substrate attack.
   *
   * Separate from removal because removal saturates: once the contaminant is
   * gone, more time in the bath does not remove more, it damages.
   */
  const damageOf = rcaSubstrateDamage;

  const resolve = (result: ReworkResult): void => {
    state.finished = true;
    state.immersed = false;
    state.result = result;
  };

  const advanceStep = (): void => {
    state.stepIndex++;
    state.step = steps[state.stepIndex] ?? steps[steps.length - 1]!;
    state.dwellSeconds = 0;
    state.exposure = 0;
    state.immersed = false;
    state.active = state.step.kind === 'SC2' ? 'sc2' : state.step.kind === 'QDR1' || state.step.kind === 'QDR2' ? 'qdr' : 'sc1';
  };

  const tick = (dt: number): void => {
    if (state.finished) return;

    // Both tanks have independent thermal state. SC-2 sits at ambient until the
    // player heats it, which is the mechanic the Unity version could not express.
    state.baths.sc1.temperatureC = stepBathTemperature(
      state.baths.sc1.temperatureC,
      state.baths.sc1.setpointC,
      dt,
      { heat: PROCESS.rca.heatRateCPerSecond, cool: PROCESS.rca.coolRateCPerSecond },
    );
    state.baths.sc2.temperatureC = stepBathTemperature(
      state.baths.sc2.temperatureC,
      state.baths.sc2.setpointC,
      dt,
      { heat: PROCESS.rca.heatRateCPerSecond, cool: PROCESS.rca.coolRateCPerSecond },
    );

    if (!state.immersed) return;
    state.dwellSeconds += dt;
    state.exposure += rcaExposureRate(state) * dt;

    // Hard ceiling: far past any recovery, and for SC-2 it is destructive.
    const ceiling = state.step.dwellSeconds * 3;
    if (state.dwellSeconds > ceiling) {
      state.timedOut = true;
      resolve({
        outcome: 'irreversible',
        success: false,
        quality: 0,
        detail:
          state.step.kind === 'QDR1' || state.step.kind === 'QDR2'
            ? 'Over-rinsed. The megasonic bath has been running long past the carrier cycle — you have lost the shift clock.'
            : `Soaked ${realMinutes(state.dwellSeconds).toFixed(1)} real minutes in ${state.step.label.split('—')[0]!.trim()}. The substrate boundary is degraded and the wafer is scrap.`,
        irreversible: true,
      });
    }
  };

  const act = (action: RcaAction): void => {
    if (state.finished) throw new Error('clean already resolved');

    switch (action.type) {
      case 'setHeater': {
        const bath = action.bath === 'sc1' ? state.baths.sc1 : state.baths.sc2;
        bath.setpointC = clamp(action.setpointC, PROCESS.rca.sc1.ambientC, 95);
        return;
      }

      case 'immerse': {
        if (state.immersed) throw new Error('wafer is already submerged');
        state.immersed = true;
        // Dwell starts at immersion, not during a descent animation. The Unity
        // version charged its 0.4 s dip to the soak.
        state.dwellSeconds = 0;
        state.exposure = 0;
        return;
      }

      case 'withdraw': {
        if (!state.immersed) throw new Error('wafer is not submerged');
        state.immersed = false;
        evaluate();
        return;
      }
    }
  };

  const evaluate = (): void => {
    const fraction = removalFraction(state);
    const damage = damageOf(state);
    const isRinse = state.step.kind === 'QDR1' || state.step.kind === 'QDR2';
    const spec = state.step;

    if (fraction < PROCESS.rca.removalTarget) {
      const bath = bathFor(state);
      const tooCold = bath.temperatureC < spec.targetC.min;
      resolve({
        outcome: 'outOfSpec',
        success: false,
        quality: fraction,
        detail: isRinse
          ? 'Pulled before the megasonic rinse cycle completed. Carryover stays on the wafer and the next bath is contaminated.'
          : tooCold
            ? `Bath at ${bath.temperatureC.toFixed(0)} °C, below the ${spec.targetC.min}–${spec.targetC.max} °C window for ${spec.label.split('—')[0]!.trim()}. At this temperature the reaction rate collapses and ${spec.removes.toLowerCase()} never completes.`
            : `Dwell of ${realMinutes(state.dwellSeconds).toFixed(1)} real minutes at ${bath.temperatureC.toFixed(0)} °C removed only ${(fraction * 100).toFixed(0)}% of the target species. ${spec.removes} is incomplete.`,
        irreversible: false,
      });
      return;
    }

    if (damage > PROCESS.rca.damageLimit && !isRinse) {
      resolve({
        outcome: 'irreversible',
        success: false,
        quality: clamp01(1 - damage / (PROCESS.rca.damageLimit * 2)),
        detail: `Dwell of ${realMinutes(state.dwellSeconds).toFixed(1)} real minutes finished the clean early and then held the wafer in the bath for the surplus. Surface damage ${damage.toFixed(2)} against a ${PROCESS.rca.damageLimit.toFixed(2)} limit — the substrate boundary and gate interface are degraded. Scrap.`,
        irreversible: true,
      });
      return;
    }

    // Bank chemical damage so the final rinse cannot erase earlier surplus.
    if (!isRinse) state.cumulativeDamage += damage;

    if (state.stepIndex >= steps.length - 1) {
      const quality = clamp01(1 - state.cumulativeDamage / Math.max(PROCESS.rca.damageLimit * 2, 1e-6));
      resolve({
        outcome: 'success',
        success: true,
        quality,
        detail: 'Full RCA cycle complete. Organics lifted in SC-1, metal ions complexed in SC-2, both rinses clean. Threshold-voltage shift eliminated.',
        irreversible: false,
      });
      return;
    }

    advanceStep();
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

/** Exposed for the tutorial panel and the debrief copy. */
export const RCA_STEPS = BUILTIN_STEPS;