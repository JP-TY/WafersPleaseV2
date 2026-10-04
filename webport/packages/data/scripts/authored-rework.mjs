/**
 * Authored rework recipes.
 *
 * The Unity `ReworkConfigSO` assets were left half-unauthored: `instructionsText`
 * empty, `idealTimingSeconds` 0, `stepDescriptions` empty on the RCA and silicide
 * benches, and `rework-silicide-wet-etch` typed `RCAClean` so it routed to the
 * wrong bath entirely. The simulation therefore hardcoded its own copy of the
 * recipe, and the data asset and the running game could disagree with nothing to
 * detect it.
 *
 * This module is the authored source of truth that the converter overlays onto
 * the Unity YAML. It lives here rather than in the JSON because the JSON is a
 * build artifact: `pnpm data:convert` regenerates it, so anything authored
 * directly into the output would be destroyed on the next run.
 *
 * Every value here is a recipe, not a tuning knob. The physics constants —
 * Arrhenius activation energy, Avrami exponent, nitride erosion thresholds —
 * stay in `packages/sim/src/rework/process.ts`, where their literature sources
 * are cited. What belongs in data is the PROCEDURE: what the steps are, what
 * each one is for, and the windows a player is asked to hit.
 */

/** @typedef {import('../src/index.ts').ReworkConfig} ReworkConfig */

/** @type {Record<string, Partial<ReworkConfig>>} */
export const AUTHORED_REWORK = {
  'rework-rcaclean': {
    type: 'RCAClean',
    instructionsText: [
      'RCA CLEAN — twin-tank wet bench.',
      'SC-1 is alkaline peroxide (NH4OH/H2O2) and lifts organic film and particles. SC-2 is acidic peroxide (HCl/H2O2) and lifts heavy-metal ions; it does NOT etch silicon. Both are needed, in that order, and SC-2 runs far cooler than SC-1.',
      'A megasonic DI rinse sits between every bath. Skipping it carries peroxide and alkali forward and poisons the next bath.',
      'Heat each tank to its own window BEFORE immersing, then hold the dwell. Under-soaking leaves active metal; over-soaking attacks the substrate boundary.',
    ].join('\n'),
    idealTimingSeconds: 30,
    toleranceWindowSeconds: 6,
    failurePenalty: 15,
    stepDescriptions: [
      'SC-1 — alkaline organic / particle clean at 70-80 C, 10 min soak',
      'QDR — megasonic DI rinse, ambient, 5 min',
      'SC-2 — acidic metal-ion clean at 30-40 C, 10 min soak',
      'QDR — final megasonic DI rinse, ambient, 5 min',
    ],
    bench: {
      key: 'A',
      title: 'RCA CLEAN — DUAL-TANK WET BENCH',
      instrument:
        'Two independently heated tanks with separate controllers, and a megasonic QDR between them.',
    },
    steps: [
      {
        key: 'SC1',
        label: 'SC-1 — ALKALINE ORGANIC / PARTICLE CLEAN',
        purpose: 'Lift organic film, particles, and native-oxide regrowth before the gate oxide grows.',
        chemistry: 'H2O : NH4OH : H2O2 = 5 : 1 : 1  (28% NH4OH, 30% H2O2)',
        removes: 'Organic film, particles, native oxide regrowth',
        targetC: { min: 70, nominal: 75, max: 80 },
        dwellSeconds: { min: 8, nominal: 10, max: 12 },
        realDwellMinutes: { min: 10, nominal: 10, max: 15 },
      },
      {
        key: 'QDR1',
        label: 'QDR — MEGASONIC DI RINSE',
        purpose: 'Stop alkaline and peroxide carryover from contaminating the acid bath.',
        chemistry: 'DI H2O, megasonic',
        removes: 'Carryover of alkaline and peroxide between baths',
        targetC: { min: 18, nominal: 22, max: 26 },
        dwellSeconds: { min: 3, nominal: 5, max: 7 },
        realDwellMinutes: { min: 2, nominal: 5, max: 5 },
      },
      {
        key: 'SC2',
        label: 'SC-2 — ACIDIC METAL-ION CLEAN',
        purpose: 'Oxidatively desorb and complex away metal ions that SC-1 cannot reach.',
        chemistry: 'H2O : HCl : H2O2 = 6 : 1 : 1  (30% HCl, 30% H2O2)',
        removes: 'Heavy-metal ions, alkali residue, metal hydroxides',
        targetC: { min: 30, nominal: 35, max: 40 },
        dwellSeconds: { min: 8, nominal: 10, max: 12 },
        realDwellMinutes: { min: 10, nominal: 10, max: 12 },
      },
      {
        key: 'QDR2',
        label: 'QDR — FINAL MEGASONIC RINSE',
        purpose: 'Leave the wafer clean and at ambient for transfer to the next tool.',
        chemistry: 'DI H2O, megasonic',
        removes: 'Final ionic and particulate carryover',
        targetC: { min: 18, nominal: 22, max: 26 },
        dwellSeconds: { min: 3, nominal: 5, max: 7 },
        realDwellMinutes: { min: 2, nominal: 5, max: 5 },
      },
    ],
  },

  'rework-silicide-wet-etch': {
    // Unity typed this asset RCAClean, so a silicide-bridging wafer opened the
    // twin-tank wet bench. That is a wrong-bench bug, not a cosmetic mismatch.
    type: 'SilicideWetEtch',
    instructionsText: [
      'SELECTIVE SILICIDE WET ETCH — ultrasonic strip station.',
      'The stringer is still strippable only while the film is high-resistance C49 titanium silicide. Watch the sheet resistance: C49 reads 60-90 uOhm.cm, C54 reads 12-15.',
      'Trigger the ultrasonic wash inside the C49 window, then STOP. The bath is selective for titanium against SiO2/SiN/Si, but it is NOT selective against the titanium contact it must preserve — over-washing thins the contact until its resistance climbs, and running past the window locks a permanent bridge into the circuit.',
      'At 45 nm the C49-to-C54 conversion is retarded, so the window is narrow. This is why silicide bridging is a crisis at this node and would be routine at 90 nm.',
    ].join('\n'),
    idealTimingSeconds: 29,
    toleranceWindowSeconds: 4,
    failurePenalty: 18,
    stepDescriptions: [
      'RAMP — bring the wafer up to the formation anneal and watch Rs fall',
      'WASH — fire the ultrasonic strip inside the C49 window',
      'CONVERSION — complete the anneal to C54 and verify the contact',
    ],
    bench: {
      key: 'B',
      title: 'SELECTIVE SILICIDE WET ETCH — ULTRASONIC STRIP STATION',
      instrument: 'A four-point sheet-resistance readout integrated with an ultrasonic bath timer.',
    },
    steps: [
      {
        key: 'RAMP',
        label: 'FORMATION ANNEAL — WATCH Rs FALL',
        purpose: 'Form the initial titanium silicide and watch it convert C49 to C54.',
        chemistry: 'Forming anneal, 450-650 C for C49, 850-900 C for C54',
        removes: 'n/a — this step forms the film that the wash strips',
        targetC: null,
        dwellSeconds: { min: 6, nominal: 14, max: 22 },
        realDwellMinutes: { min: 2, nominal: 7, max: 11 },
      },
      {
        key: 'WASH',
        label: 'ULTRASONIC STRIP WASH',
        purpose: 'Lift unreacted pathway titanium while the lattice is still C49 and strippable.',
        chemistry: 'NH4OH : H2O2 : H2O = 1 : 3 : 5 at room temperature',
        removes: 'Stray titanium stringers on the sidewall spacers',
        targetC: null,
        dwellSeconds: { min: 1, nominal: 3, max: 5 },
        realDwellMinutes: { min: 1, nominal: 3, max: 5 },
      },
      {
        key: 'CONVERSION',
        label: 'CONVERSION ANNEAL — VERIFY CONTACT',
        purpose: 'Complete C54 formation and confirm the preserved contact resistance is in spec.',
        chemistry: 'Conversion anneal, 850-900 C',
        removes: 'n/a — this step locks the contact',
        targetC: null,
        dwellSeconds: { min: 6, nominal: 12, max: 18 },
        realDwellMinutes: { min: 3, nominal: 6, max: 9 },
      },
    ],
  },

  'rework-cmpcalibration': {
    type: 'CMPCalibration',
    instructionsText: [
      'CMP LASER ENDPOINT RE-CALIBRATION.',
      'A silicon-nitride stop layer protects the active areas while the overlying oxide fill is polished away. The endpoint is the moment oxide clears and nitride is exposed — the optical signal changes because Si3N4 has a higher refractive index than SiO2.',
      'Calibrate the interferometer: set wavelength and gain so the fringe signal is legible, then match the phase so the measured curve lines up with the reference.',
      'Correct alignment locks the polisher automated safety braking for the next 5 wafers, which prevents the structural dishing an unbraked tool would cause.',
    ].join('\n'),
    idealTimingSeconds: 20,
    toleranceWindowSeconds: 5,
    failurePenalty: 12,
    stepDescriptions: [
      'CALIBRATE — set wavelength and gain until the fringe signal is legible',
      'ALIGN — match phase until the trace reproduces the reference',
      'LOCK — confirm the endpoint and engage the safety brake',
    ],
    bench: {
      key: 'C',
      title: 'CMP LASER ENDPOINT — INTERFEROMETER CALIBRATION',
      instrument: 'A laser interferometer viewing the pad through a window, with gain, wavelength and phase trims.',
    },
    steps: [
      {
        key: 'CALIBRATE',
        label: 'CALIBRATE — WAVELENGTH AND GAIN',
        purpose: 'Make the reflected fringe signal legible before trusting any endpoint.',
        chemistry: 'Laser interferometry through the pad window',
        removes: 'n/a — instrument calibration',
        targetC: null,
        dwellSeconds: { min: 3, nominal: 7, max: 12 },
        realDwellMinutes: { min: 1, nominal: 3, max: 6 },
      },
      {
        key: 'ALIGN',
        label: 'ALIGN — PHASE TO REFERENCE',
        purpose: 'Match the measured curve to the stored reference so the knee reads at the right thickness.',
        chemistry: 'Phase trim against the stored endpoint reference',
        removes: 'n/a — instrument calibration',
        targetC: null,
        dwellSeconds: { min: 3, nominal: 8, max: 14 },
        realDwellMinutes: { min: 1, nominal: 4, max: 7 },
      },
      {
        key: 'LOCK',
        label: 'LOCK — ENGAGE SAFETY BRAKE',
        purpose: 'Arm the polisher brake for the next 5 wafers and prevent structural dishing.',
        chemistry: 'Automated endpoint brake',
        removes: 'n/a — process protection',
        targetC: null,
        dwellSeconds: { min: 2, nominal: 5, max: 8 },
        realDwellMinutes: { min: 1, nominal: 2, max: 4 },
      },
    ],
  },
};

/**
 * Overlay authored recipes onto the converted assets.
 *
 * `converted` is the array of parsed `ReworkConfigSO` assets, matched by id — the
 * converter emits a list, so looking assets up by key silently found nothing.
 *
 * Unity still wins for anything the authored table does not mention, so a
 * designer editing the ScriptableObject is not fought by this file. What the
 * overlay owns is the fields Unity left empty and the `type` Unity got wrong.
 *
 * @param {Record<string, unknown>[]} converted
 * @param {string[]} warnings collected and surfaced in the manifest
 */
export function applyAuthoredRework(converted, warnings) {
  const byId = new Map();
  for (const asset of converted) {
    if (asset && typeof asset.id === 'string') byId.set(asset.id, asset);
  }

  for (const [id, authored] of Object.entries(AUTHORED_REWORK)) {
    const asset = byId.get(id);
    if (!asset) {
      warnings.push(`${id}: authored recipe has no matching Unity asset`);
      continue;
    }

    const before = {
      type: asset.type,
      timed: asset.idealTimingSeconds,
      steps: Array.isArray(asset.stepDescriptions) ? asset.stepDescriptions.length : 0,
    };

    Object.assign(asset, authored);

    if (before.type !== asset.type) {
      warnings.push(
        `${id}: Unity typed this "${before.type}" but it is a "${asset.type}" procedure — emitted "${asset.type}" so it opens the correct bench`,
      );
    }
    if (!before.timed) {
      warnings.push(`${id}: Unity left idealTimingSeconds 0 — emitted the authored ${asset.idealTimingSeconds}s`);
    }
    if (!before.steps) {
      warnings.push(
        `${id}: Unity left stepDescriptions empty — emitted the authored ${authored.steps?.length ?? 0}-step recipe`,
      );
    }
  }

  return converted;
}