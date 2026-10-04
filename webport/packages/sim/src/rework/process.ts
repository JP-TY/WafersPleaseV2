/**
 * Shared types and physical constants for the three rework minigames.
 *
 * Every number in `PROCESS` is traceable to a real fab spec or literature value;
 * the sources are cited inline. Where the game must compress a multi-minute
 * process into a playable window, the compression is an explicit named
 * constant rather than a silently rescaled target, so player-facing material can
 * quote the real recipe and the simulation can still be tuned in game units.
 */

// ---------------------------------------------------------------------------
// Time compression
// ---------------------------------------------------------------------------

/**
 * Game seconds per real process minute.
 *
 * A real RCA soak is 10 minutes and a real CMP polish is minutes. At 1:1 no
 * minigame is playable within an 8-12 minute shift (GDD §4). At 60x, a 10-minute
 * bath becomes 10 seconds and a 2-minute polish becomes 2 seconds.
 *
 * The physics runs in *game* seconds; real-time equivalents are computed with
 * `realSeconds()` for anything shown to the player.
 */
export const GAME_SECONDS_PER_PROCESS_MINUTE = 60;

/** Real seconds represented by one game second. */
export const REAL_SECONDS_PER_GAME_SECOND = 60;

export const realSeconds = (gameSeconds: number): number => gameSeconds * REAL_SECONDS_PER_GAME_SECOND;
export const realMinutes = (gameSeconds: number): number => gameSeconds / GAME_SECONDS_PER_PROCESS_MINUTE;

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

export const PROCESS = {
  rca: {
    /**
     * SC-1 (Standard Clean 1, "APM" ammonia-peroxide mix).
     * Ratio is H2O:NH4OH:H2O2 = 5:1:1 using 28% NH4OH and 30% H2O2.
     * Sources: TU Delft Kavli Nanolab RCA-1 SOP; Univ. of Rochester RCA clean
     * bench SOP; RENA cleaning process technology.
     */
    sc1: {
      name: 'SC-1',
      chemistry: 'H₂O : NH₄OH : H₂O₂ = 5 : 1 : 1',
      abbreviation: 'APM',
      target: { min: 70, nominal: 75, max: 80 } as const,
      dwellSeconds: { min: 8, nominal: 10, max: 12 } as const,
      ambientC: 22,
      /** Removal target for organic film and particles. */
      removes: 'Organic film, particles, native oxide regrowth' as const,
    },
    /**
     * SC-2 (Standard Clean 2, "HPM" hydrochloric-peroxide mix).
     * Ratio is H2O:HCl:H2O2 = 6:1:1 with 30% HCl and 30% H2O2.
     * Sources: TU Delft RCA-2 SOP; Univ. of Rochester; UTEP cleaning process.
     *
     * SC-2 does NOT etch Si or SiO2 (RENA). Its job is oxidative desorption of
     * metal ions plus complexation by chloride.
     */
    sc2: {
      name: 'SC-2',
      chemistry: 'H₂O : HCl : H₂O₂ = 6 : 1 : 1',
      abbreviation: 'HPM',
      /**
       * Deliberately cooler than SC-1. Metrohm's inline-monitoring application
       * note specifies SC-1 at 65±3 °C and SC-2 HCl at 35±3 °C; several fab SOPs
       * run both at 75 °C. The recipe is drawn from the cooler band because the
       * difference between the two baths is itself a teachable fact, and the
       * Unity version wrongly used one shared bath temperature for both.
       */
      target: { min: 30, nominal: 35, max: 40 } as const,
      dwellSeconds: { min: 8, nominal: 10, max: 12 } as const,
      ambientC: 22,
      removes: 'Heavy-metal ions, alkali residue, metal hydroxides' as const,
    },
    /**
     * Quick-dump rinse: megasonic DI water at ambient, between every bath.
     * Sources: Univ. of Rochester (QDR 5 min), ECE Illinois (cascade rinse
     * >= 2 min), TU Delft (3x DI rinse).
     *
     * The Unity version had no rinse step at all, which is not a real RCA clean.
     */
    qdr: {
      name: 'QDR',
      chemistry: 'DI H₂O, megasonic',
      target: { min: 18, nominal: 22, max: 26 } as const,
      dwellSeconds: { min: 3, nominal: 5, max: 7 } as const,
    },
    /**
     * Activation energy for the cleaning reaction, J/mol.
     *
     * 40 kJ/mol is a standard Arrhenius Ea for a room-to-bath-temperature
     * heterogeneous surface reaction in wet clean. It sets how sharply the rate
     * responds to temperature: at 35 °C vs 75 °C the rate differs by ~9x, which
     * is what makes the temperature band a real skill rather than decoration.
     */
    activationEnergyJPerMol: 40_000,
    /**
     * Pre-exponential scale, per game second at the step's nominal temperature.
     *
     * Calibrated so a nominal recipe just completes: exposure at 10 s nominal is
     * 4.60, giving removal = 1 - exp(-4.60) = 0.990.
     */
    preExponential: 0.46,
    /** Below this removal fraction the bath has not done its job. */
    removalTarget: 0.98,
    /**
     * Exposure at which the target species is `removalTarget` gone, i.e.
     * -ln(1 - 0.98) = 3.912. Exposure beyond this point is no longer removing
     * contaminant — it is attacking the substrate.
     *
     * `removal = 1 - exp(-exposure)` is bounded by 1 and can never exceed it, so
     * over-soaking cannot be modelled as a removal threshold. Damage is tracked
     * as surplus exposure past completion, which is also what physically
     * happens: once the surface is clean, continued hot SC-1/SC-2 exposure
     * attacks the substrate and the gate interface.
     */
    completionExposure: 3.912,
    /** Surplus exposure the surface tolerates before it is damaged. */
    damageLimit: 2.0,
    /** Multiplier from surplus exposure to reported damage. */
    damageCoeff: 1.0,
    /** Heater slew, °C per game second. A 300 mm bath has real thermal mass. */
    heatRateCPerSecond: 9.0,
    /** Passive cooling toward ambient with the heater off, °C per game second. */
    coolRateCPerSecond: 2.2,
  },

  silicide: {
    /**
     * TiSi2 sheet resistivity by phase, µΩ·cm.
     *
     * C49 is the metastable, titanium-rich, HIGH-resistivity phase; C54 is the
     * stable, LOW-resistivity target. Sources: OSTI 603492 (C49 60-90 µΩ·cm,
     * C54 12-15 µΩ·cm); Ross et al., IBM J. Res. Develop. 44 (2000); IUPAC /
     * Hou et al. (C54 13-20 µΩ·cm).
     *
     * The Unity implementation had this pair right in its constants but then
     * printed the readout through an inverted mapping, so C49 displayed as
     * ~5.7 Ω/□ and C54 as ~15.2 Ω/□ — backwards relative to the physics and to
     * its own variable names.
     */
    resistivityC49MicroOhmCm: 75,
    resistivityC54MicroOhmCm: 14,
    /**
     * Formation temperatures. C49 forms in the low-temperature formation anneal,
     * C54 requires the high-temperature conversion anneal.
     * Sources: Hou et al. (C49 450-650 °C, C54 >650-700 °C); IBM (C49 at
     * 600-700 °C, C54 at 850-900 °C).
     */
    c49FormationC: [450, 650] as const,
    c54ConversionC: [850, 900] as const,
    /**
     * Avrami exponent for the C49 -> C54 conversion. Values of 2-4 are typical
     * for nucleation-and-growth transformations; 3 gives a sigmoidal front,
     * which is what the flat-topped-then-sharp transition of a conversion
     * anneal actually looks like.
     */
    avramiExponent: 3,
    /**
     * 45 nm linewidth retardation factor.
     *
     * In-situ XRD of narrow-line TiSi2 (Roy et al., IBM) measured a monotonic
     * increase of up to 180 °C in the C49 -> C54 transition temperature as line
     * width fell from 1.0 µm to 0.1 µm, because C54 nucleation sites are
     * suppressed in narrow lines. This is precisely why a 45 nm node makes
     * silicide bridging a crisis rather than an inconvenience, and it is modelled
     * here as a multiplier on the conversion time constant.
     */
    narrowLineRetardation: 2.6,
    /**
     * Etchant. NH4OH : H2O2 : H2O = 1 : 3 : 5 at room temperature, widely used
     * for selective wet etch of Ti toward SiO2, SiN, Si and titanium silicide
     * (IAEA INIS 49047202). HF is explicitly rejected in that work: it shows
     * poor selectivity toward SiO2, which would undercut the sidewall spacer.
     */
    etchant: 'NH₄OH : H₂O₂ : H₂O = 1 : 3 : 5',
    /**
     * Selectivity of the etchant against the Si3N4 sidewall spacer. High by
     * design — that is what makes the process work at all.
     */
    spacerSelectivity: 40,
    /**
     * Contact thinning budget. The wash strips Ti indiscriminately, so an
     * over-long wash thins the real contact and raises its contact resistance.
     * This is the failure mode that gives the minigame a second dimension
     * beyond "fire during C49".
     */
    contactThicknessNm: 12,
    contactEtchRateNmPerSecond: 0.55,
    contactResistancePctPerNm: 6.5,
  },

  cmp: {
    /**
     * STI CMP. A Si3N4 stop layer protects the active areas while the
     * overlying SiO2 fill is polished away. Sources: CNF Cornell CMP primer;
     * ICPT22 Guhl (STI-CMP dishing and nitride erosion).
     *
     * The endpoint is the moment oxide clears and nitride is exposed. The
     * optical signal changes because Si3N4 has different optical constants
     * (n, k) than SiO2 — see the endpoint-detection literature, where this
     * produces "obvious inflection points".
     */
    stopLayer: 'Si₃N₄',
    layerPolished: 'SiO₂',
    /**
     * Relative optical reflectance of the stop layer versus the layer being
     * removed. SiO2 n≈1.46 d=0; Si3N4 n≈2.0, so nitride reflects noticeably
     * more. Expressed as a signal ratio, not an absolute.
     */
    reflectanceOxide: 0.042,
    reflectanceNitride: 0.118,
    /** Initial oxide overburden removed by the polish, nm. */
    initialOverburdenNm: 620,
    /** Removal rate once planarised, nm per game second. */
    removalRateNmPerSecond: 145,
    /** Below this remaining oxide the nitride is exposed: endpoint. */
    endpointRemainingNm: 6,
    /**
     * Below this, the nitride itself is being cut. Eroded nitride exposes Si to
     * the slurry and is unrecoverable — this is the over-polish failure.
     */
    nitrideErosionThresholdNm: 18,
    /** Dishing depth accumulated per second of over-polish, nm. */
    dishingRateNmPerSecond: 2.4,
    /** Dishing that starts to affect the field oxide, nm. */
    dishingLimitNm: 30,
    /**
     * Laser interferometry. The beam is sent through a window in the polishing
     * pad; reflected intensity reports the surface, and fringe counting gives
     * thickness. Sources: Applied Materials US6537133; Micron US5798422.
     */
    method: 'Laser interferometry through pad window',
  },
} as const;

// ---------------------------------------------------------------------------
// Shared minigame contract
// ---------------------------------------------------------------------------

/** Why a rework attempt ended. Drives the coaching text and the debrief. */
export type ReworkOutcome =
  /** Completed within every process window. */
  | 'success'
  /** Ran out of clock without committing. */
  | 'timeout'
  /** Committed, but outside a process window. `detail` says which and why. */
  | 'outOfSpec'
  /** Committed too late; the failure is now permanent. */
  | 'irreversible';

export interface ReworkResult {
  readonly outcome: ReworkOutcome;
  readonly success: boolean;
  /** 0..1. 1 is a textbook execution. The Unity minigames had no such channel
   *  — `ReworkResult.qualityRestored` existed but nothing ever produced it, so
   *  the only continuous quality signal in the whole rework system was thrown
   *  away at the boundary. */
  readonly quality: number;
  /** Player-facing explanation. Specific about which window was missed. */
  readonly detail: string;
  /** True once the failure can no longer be walked back. */
  readonly irreversible: boolean;
}

/** Every minigame is a pure state machine advanced by explicit ticks. */
export interface ReworkMinigame<S, E> {
  readonly state: Readonly<S>;
  /** Advance the simulation. `dt` in game seconds. */
  tick(dt: number): void;
  /** Player input. Returns a new state; throws on an illegal action. */
  act(action: E): void;
  readonly finished: boolean;
  readonly result: ReworkResult | null;
}

/** Deterministic bath-temperature lag toward a heater setpoint. */
export const stepBathTemperature = (
  currentC: number,
  setpointC: number,
  dt: number,
  rates: { heat: number; cool: number },
): number => {
  const ambient = PROCESS.rca.sc1.ambientC;
  if (setpointC > ambient) {
    // Heating: first-order approach to the setpoint at a finite slew rate.
    return Math.min(setpointC, currentC + rates.heat * dt);
  }
  // Heater off or set below ambient: the bath loses heat toward ambient.
  const target = Math.max(ambient, setpointC);
  if (currentC <= target) return ambient;
  return Math.max(target, currentC - rates.cool * dt);
};

/**
 * Arrhenius rate ratio relative to a reference temperature.
 *
 * Returns 1 at `referenceC`, rising above it and falling below it. Used by the
 * RCA clean so that bath temperature has real, quantified authority over the
 * removal rate instead of being a pass/fail comparison at a single instant.
 */
export const arrheniusRatio = (tempC: number, referenceC: number, eaJPerMol: number): number => {
  const k = tempC + 273.15;
  const kRef = referenceC + 273.15;
  return Math.exp((-eaJPerMol / 8.314462618) * (1 / k - 1 / kRef));
};

/** Clamp helper shared across the minigames. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => clamp(v, 0, 1);

/** Map a value from one range to another, clamped. */
export const remap = (v: number, inLo: number, inHi: number, outLo: number, outHi: number): number => {
  if (inHi === inLo) return outLo;
  const t = clamp01((v - inLo) / (inHi - inLo));
  return outLo + t * (outHi - outLo);
};