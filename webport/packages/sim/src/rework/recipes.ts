/**
 * Rework recipes: the bridge from authored data to the minigames.
 *
 * The physics constants stay in `process.ts`, where their literature sources are
 * cited. What moves into data is the PROCEDURE — which steps exist, what each is
 * for, and the windows a player is asked to hit — because that is content, and
 * content belongs in content.
 *
 * The reason this matters is that the two copies used to disagree silently. The
 * Unity `ReworkConfigSO` assets were empty, the converter emitted placeholders,
 * and each minigame hardcoded its own recipe. Nothing compared them. Now
 * `recipeFor` builds the minigame's step table from the config, so editing a
 * temperature window in `packages/data/config/rework.json` changes what the
 * simulation enforces.
 */

import type { ReworkConfig, ReworkStepConfig } from '@wafers/data';
import { PROCESS } from './process.js';

export type ReworkKind = 'RCAClean' | 'SilicideWetEtch' | 'CMPCalibration';

/** A step as the minigames want it: flat numbers, no nulls. */
export interface RecipeStep {
  readonly key: string;
  readonly label: string;
  readonly chemistry: string;
  readonly removes: string;
  readonly purpose: string;
  readonly targetC: { min: number; nominal: number; max: number };
  readonly realDwellMinutes: { min: number; nominal: number; max: number };
  readonly dwellSeconds: number;
}

export interface Recipe {
  readonly kind: ReworkKind;
  readonly title: string;
  readonly instructions: string;
  readonly steps: readonly RecipeStep[];
  readonly nominalSeconds: number;
  readonly toleranceSeconds: number;
  readonly failurePenalty: number;
  /** Wafers of CMP safety brake a successful run arms, per GDD §8C. */
  readonly brakeWafers: number;
}

/** The built-in recipes, used when no config is supplied. */
const BUILTIN_RCA: RecipeStep[] = [
  {
    key: 'SC1',
    label: 'SC-1 — ALKALINE ORGANIC / PARTICLE CLEAN',
    purpose: 'Lift organic film, particles and native-oxide regrowth before the gate oxide grows.',
    chemistry: PROCESS.rca.sc1.chemistry,
    removes: PROCESS.rca.sc1.removes,
    targetC: { ...PROCESS.rca.sc1.target },
    realDwellMinutes: { min: 10, nominal: 10, max: 15 },
    dwellSeconds: PROCESS.rca.sc1.dwellSeconds.nominal,
  },
  {
    key: 'QDR1',
    label: 'QDR — MEGASONIC DI RINSE',
    purpose: 'Stop alkaline and peroxide carryover from contaminating the acid bath.',
    chemistry: PROCESS.rca.qdr.chemistry,
    removes: 'Carryover of alkaline and peroxide between baths',
    targetC: { ...PROCESS.rca.qdr.target },
    realDwellMinutes: { min: 2, nominal: 5, max: 5 },
    dwellSeconds: PROCESS.rca.qdr.dwellSeconds.nominal,
  },
  {
    key: 'SC2',
    label: 'SC-2 — ACIDIC METAL-ION CLEAN',
    purpose: 'Oxidatively desorb and complex away metal ions that SC-1 cannot reach.',
    chemistry: PROCESS.rca.sc2.chemistry,
    removes: PROCESS.rca.sc2.removes,
    targetC: { ...PROCESS.rca.sc2.target },
    realDwellMinutes: { min: 10, nominal: 10, max: 12 },
    dwellSeconds: PROCESS.rca.sc2.dwellSeconds.nominal,
  },
  {
    key: 'QDR2',
    label: 'QDR — FINAL MEGASONIC RINSE',
    purpose: 'Leave the wafer clean and at ambient for transfer to the next tool.',
    chemistry: PROCESS.rca.qdr.chemistry,
    removes: 'Final ionic and particulate carryover',
    targetC: { ...PROCESS.rca.qdr.target },
    realDwellMinutes: { min: 2, nominal: 5, max: 5 },
    dwellSeconds: PROCESS.rca.qdr.dwellSeconds.nominal,
  },
];

const BUILTIN_SILICIDE: RecipeStep[] = [
  {
    key: 'RAMP',
    label: 'FORMATION ANNEAL — WATCH Rs FALL',
    purpose: 'Form the initial titanium silicide and watch it convert C49 to C54.',
    chemistry: `Forming anneal, ${PROCESS.silicide.c49FormationC[0]}-${PROCESS.silicide.c49FormationC[1]} C for C49, ${PROCESS.silicide.c54ConversionC[0]}-${PROCESS.silicide.c54ConversionC[1]} C for C54`,
    removes: 'n/a — this step forms the film that the wash strips',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 2, nominal: 7, max: 11 },
    dwellSeconds: 14,
  },
  {
    key: 'WASH',
    label: 'ULTRASONIC STRIP WASH',
    purpose: 'Lift unreacted pathway titanium while the lattice is still C49 and strippable.',
    chemistry: PROCESS.silicide.etchant,
    removes: 'Stray titanium stringers on the sidewall spacers',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 1, nominal: 3, max: 5 },
    dwellSeconds: 3,
  },
  {
    key: 'CONVERSION',
    label: 'CONVERSION ANNEAL — VERIFY CONTACT',
    purpose: 'Complete C54 formation and confirm the preserved contact resistance is in spec.',
    chemistry: `Conversion anneal, ${PROCESS.silicide.c54ConversionC[0]}-${PROCESS.silicide.c54ConversionC[1]} C`,
    removes: 'n/a — this step locks the contact',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 3, nominal: 6, max: 9 },
    dwellSeconds: 12,
  },
];

const BUILTIN_CMP: RecipeStep[] = [
  {
    key: 'CALIBRATE',
    label: 'CALIBRATE — WAVELENGTH AND GAIN',
    purpose: 'Make the reflected fringe signal legible before trusting any endpoint.',
    chemistry: PROCESS.cmp.method,
    removes: 'n/a — instrument calibration',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 1, nominal: 3, max: 6 },
    dwellSeconds: 7,
  },
  {
    key: 'ALIGN',
    label: 'ALIGN — PHASE TO REFERENCE',
    purpose: 'Match the measured curve to the stored reference so the knee reads at the right thickness.',
    chemistry: 'Phase trim against the stored endpoint reference',
    removes: 'n/a — instrument calibration',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 1, nominal: 4, max: 7 },
    dwellSeconds: 8,
  },
  {
    key: 'LOCK',
    label: 'LOCK — ENGAGE SAFETY BRAKE',
    purpose: 'Arm the polisher brake for the next 5 wafers and prevent structural dishing.',
    chemistry: 'Automated endpoint brake',
    removes: 'n/a — process protection',
    targetC: { min: 18, nominal: 22, max: 26 },
    realDwellMinutes: { min: 1, nominal: 2, max: 4 },
    dwellSeconds: 5,
  },
];

/** GDD §8C: a correct CMP calibration arms the brake for five wafers. */
export const CMP_BRAKE_WAFERS = 5;

const BUILTIN: Record<ReworkKind, Recipe> = {
  RCAClean: {
    kind: 'RCAClean',
    title: 'RCA CLEAN — DUAL-TANK WET BENCH',
    instructions:
      'SC-1 is alkaline peroxide and lifts organics; SC-2 is acidic peroxide and lifts metal ions. Both, in order, each at its own temperature, with a megasonic rinse between.',
    steps: BUILTIN_RCA,
    nominalSeconds: 30,
    toleranceSeconds: 6,
    failurePenalty: 15,
    brakeWafers: 0,
  },
  SilicideWetEtch: {
    kind: 'SilicideWetEtch',
    title: 'SELECTIVE SILICIDE WET ETCH — ULTRASONIC STRIP STATION',
    instructions:
      'The stringer is strippable only while the film is high-resistance C49. Fire the wash inside that window, then stop before the contact is thinned.',
    steps: BUILTIN_SILICIDE,
    nominalSeconds: 29,
    toleranceSeconds: 4,
    failurePenalty: 18,
    brakeWafers: 0,
  },
  CMPCalibration: {
    kind: 'CMPCalibration',
    title: 'CMP LASER ENDPOINT — INTERFEROMETER CALIBRATION',
    instructions:
      'Match gain, wavelength and phase so the oxide-to-nitride knee reads at the right thickness, then lock the safety brake.',
    steps: BUILTIN_CMP,
    nominalSeconds: 20,
    toleranceSeconds: 5,
    failurePenalty: 12,
    brakeWafers: CMP_BRAKE_WAFERS,
  },
};

/** Convert an authored step, substituting the built-in temperature if null. */
function toRecipeStep(s: ReworkStepConfig, fallbackC: number): RecipeStep {
  return {
    key: s.key,
    label: s.label,
    chemistry: s.chemistry,
    removes: s.removes,
    purpose: s.purpose,
    // A null targetC means the step is not temperature-controlled, which is a
    // real distinction (a megasonic rinse runs at ambient). It still needs a
    // window the simulation can check a heater against, so it gets the ambient
    // band rather than being exempt.
    targetC: s.targetC ? { ...s.targetC } : { min: fallbackC - 4, nominal: fallbackC, max: fallbackC + 4 },
    realDwellMinutes: { ...s.realDwellMinutes },
    dwellSeconds: s.dwellSeconds.nominal,
  };
}

/**
 * Build a recipe for a rework kind, preferring authored config.
 *
 * Falls back per-field rather than all-or-nothing: a config that supplies only
 * `steps` still overrides the step table, while timings and penalties stay at
 * their documented defaults.
 */
export function recipeFor(kind: ReworkKind, configs?: readonly ReworkConfig[]): Recipe {
  const base = BUILTIN[kind];
  const cfg = configs?.find((c) => c.type === kind);
  if (!cfg) return base;

  const steps = cfg.steps.length > 0 ? cfg.steps.map((s) => toRecipeStep(s, 22)) : base.steps;

  return {
    kind,
    title: cfg.bench.key === 'unknown' ? base.title : cfg.bench.title,
    instructions: cfg.instructionsText || base.instructions,
    steps,
    nominalSeconds: cfg.idealTimingSeconds > 0 ? cfg.idealTimingSeconds : base.nominalSeconds,
    toleranceSeconds: cfg.toleranceWindowSeconds > 0 ? cfg.toleranceWindowSeconds : base.toleranceSeconds,
    failurePenalty: cfg.failurePenalty > 0 ? cfg.failurePenalty : base.failurePenalty,
    brakeWafers: base.brakeWafers,
  };
}

/** The authored recipe for a defect type's rework, if the day grants it. */
export function recipeForDefect(
  defectType: string,
  configs?: readonly ReworkConfig[],
): Recipe | null {
  const kind: ReworkKind | null =
    defectType === 'SubstrateContamination'
      ? 'RCAClean'
      : defectType === 'SilicideBridging'
        ? 'SilicideWetEtch'
        : defectType === 'STIVoid'
          ? 'CMPCalibration'
          : null;
  return kind ? recipeFor(kind, configs) : null;
}

export { BUILTIN as BUILTIN_RECIPES };