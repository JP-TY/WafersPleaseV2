/**
 * Metrology — what each instrument can physically see (GDD §7, §11, §13).
 *
 * The GDD's whole diagnostic loop rests on one physical fact: you cannot
 * diagnose what your instrument cannot measure. An STI void is sub-surface, so
 * a surface stylus walks straight over it; a 40 nm silicide stringer is below
 * the resolution of an optical probe; a bowed wafer is a geometry problem, and
 * scattering electrons off it tells you about surface composition instead.
 *
 * So this module is not a "reveal the defect" button. Each tool has:
 *
 *   - a physical measurand it reports (bow in nm, sheet resistance in ohm/sq,
 *     optical density, interface RMS roughness, stringer width),
 *   - spec limits that quantity is judged against,
 *   - the set of defect classes it can actually resolve,
 *   - a resolution ceiling, so a Hard defect may slip past even the right tool.
 *
 * Running the wrong tool is NOT a compliance strike. Compliance asks "did you
 * run what the traveler required"; this asks "could that tool see anything".
 * They are separate competencies in GDD §11 and the debrief reports both.
 */

import type { DetectionDifficulty, DefectClass, ToolType } from '@wafers/data';
import type { EffectiveWafer } from '../generation/wafer.js';
import { toolCanResolve } from '../evaluation/disposition.js';

// ---------------------------------------------------------------------------
// Instrument definitions
// ---------------------------------------------------------------------------

/**
 * The measurand a tool reports, with the spec limits a 45 nm wafer is held to.
 *
 * Limits are the process window, not decoration: a wafer inside them ships,
 * outside them does not. They are per-measurand rather than per-day because the
 * physics does not change between Days 1 and 3 — only which defects and which
 * instruments the player gets to work with.
 */
export interface MeasurandSpec {
  /** Short signal label as it would read on the instrument, e.g. "BOW". */
  readonly label: string;
  readonly unit: string;
  readonly lowerLimit: number;
  readonly upperLimit: number;
  /** Decimal places the instrument displays. */
  readonly precision: number;
  /**
   * Signal magnitude at severity 1.0 for a defect this tool can resolve.
   * The reading is `nominal + severity * span * sign`, so a defect pushes the
   * signal out of spec on the correct side rather than "flagging" abstractly.
   */
  readonly outOfSpecSpan: number;
  /** Which way out-of-spec reads: bow can go either way, density only low. */
  readonly direction: 1 | -1;
  /** Nominal in-spec reading, mid-window. */
  readonly nominal: number;
}

export interface ToolSpec {
  readonly tool: ToolType;
  readonly measurand: MeasurandSpec;
  /**
   * Detection ceiling in [0,1]: the probability that a resolvable defect is
   * actually caught, before difficulty is applied. Taken from the config's
   * per-tool `accuracy` (ElectronMicroscope 0.98, others 0.90-0.95) because
   * that is what the asset author entered as the instrument's competence.
   */
  readonly detectionCeiling: number;
  /** Seconds of latency charged to GDD §11 latency-by-layer. */
  readonly latencySeconds: number;
  /**
   * Smallest fraction of the spec window the instrument can resolve. Below this
   * the defect is physically too small for the technique and reads clean. This
   * is the mechanism behind GDD `detectionDifficulty: Hard`.
   */
  readonly resolutionLimit: number;
}

const DEG: Record<DetectionDifficulty, number> = {
  Easy: 1,
  Medium: 0.88,
  Hard: 0.74,
  Hidden: 0.6,
};

export const TOOL_SPECS: Readonly<Record<ToolType, ToolSpec>> = {
  StylusProfilometer: {
    tool: 'StylusProfilometer',
    // A diamond stylus traces the surface. Bow is a sagitta in nm; a bowed
    // wafer pushes the whole trace past the flatness window.
    measurand: { label: 'BOW', unit: 'nm', lowerLimit: -400, upperLimit: 400, precision: 0, outOfSpecSpan: 620, direction: 1, nominal: 0 },
    detectionCeiling: 0.95,
    latencySeconds: 18,
    // Bow is a gross geometric deviation; the stylus sees it easily.
    resolutionLimit: 0.05,
  },
  FourPointProbe: {
    tool: 'FourPointProbe',
    // Sheet resistance. A conductive organic/metal film on the surface shunts
    // the probe, so Rs rises. GDD §7 "spikes in local electrical resistance".
    measurand: { label: 'Rs', unit: 'ohm/sq', lowerLimit: 28, upperLimit: 42, precision: 2, outOfSpecSpan: 26, direction: 1, nominal: 35 },
    detectionCeiling: 0.9,
    latencySeconds: 14,
    resolutionLimit: 0.12,
  },
  SpectroscopicEllipsometry: {
    tool: 'SpectroscopicEllipsometry',
    // Optical density index from the Psi/Delta trace. An STI void is unfilled
    // trench, so the film is optically thin relative to a filled moat.
    measurand: { label: 'DENSITY', unit: 'rel', lowerLimit: 0.82, upperLimit: 1.04, precision: 3, outOfSpecSpan: 0.34, direction: -1, nominal: 0.93 },
    detectionCeiling: 0.9,
    latencySeconds: 16,
    // Sub-surface fill failure is subtle: the technique sees it, the geometry
    // has to be big enough to change the phase.
    resolutionLimit: 0.18,
  },
  XRayRefractometry: {
    tool: 'XRayRefractometry',
    // Interface RMS roughness in nm. Interface traps are a sub-nanometer
    // scattering signature, so the number is small but out of window.
    measurand: { label: 'RMS', unit: 'nm', lowerLimit: 0, upperLimit: 0.9, precision: 2, outOfSpecSpan: 1.5, direction: 1, nominal: 0.35 },
    detectionCeiling: 0.9,
    latencySeconds: 20,
    resolutionLimit: 0.2,
  },
  ElectronMicroscope: {
    tool: 'ElectronMicroscope',
    // The only technique with the resolution to see a 45 nm stringer or a
    // sub-micron plug keyhole. Measured as the width of the defect feature
    // itself: a plugged via is a narrow core, a void or a bridge is wide.
    measurand: { label: 'FEATURE', unit: 'nm', lowerLimit: 0, upperLimit: 60, precision: 1, outOfSpecSpan: 95, direction: 1, nominal: 18 },
    detectionCeiling: 0.98,
    latencySeconds: 26,
    // Highest resolution of the five — it is why Day 3 is a Hard day anyway.
    resolutionLimit: 0.06,
  },
};

export const ALL_TOOLS: readonly ToolType[] = [
  'StylusProfilometer',
  'SpectroscopicEllipsometry',
  'XRayRefractometry',
  'ElectronMicroscope',
  'FourPointProbe',
];

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/**
 * One instrument pass on one wafer.
 *
 * `outOfSpec` is what the player sees: the number versus the red line. It is
 * NOT the same question as `resolvedDefects` — an instrument can flag a drift
 * it cannot attribute, and it can stay in spec while missing a defect below its
 * resolution. The §11 debrief scores the attribution, the alarm is the alarm.
 */
export interface MetrologyReading {
  readonly waferIndex: number;
  readonly tool: ToolType;
  readonly signalLabel: string;
  readonly unit: string;
  readonly value: number;
  readonly precision: number;
  readonly lowerLimit: number;
  readonly upperLimit: number;
  readonly outOfSpec: boolean;
  /** Defect types this pass actually resolved, with severity. */
  readonly resolved: readonly ResolvedDefect[];
  /**
   * Defect types present on the wafer that this pass could NOT see. Used for
   * the player-facing "instrument blind to this failure mode" coaching, and
   * never shown before the player has committed, or it would give the answer.
   */
  readonly invisible: readonly string[];
  /** 0..1 confidence, from detection ceiling x difficulty. */
  readonly confidence: number;
  readonly latencySeconds: number;
  /**
   * Defect present but smaller than the instrument's resolution. Drives the
   * GDD callout: "deviation is at the edge of what this tool can see".
   */
  readonly subResolution: boolean;
}

export interface ResolvedDefect {
  readonly defectType: string;
  readonly defectClass: DefectClass;
  readonly severity: number;
  /** Where on the wafer, for the diegetic map. */
  readonly regionX: number;
  readonly regionY: number;
}

/**
 * Deterministic per-(wafer, tool) roll in [0,1).
 *
 * Hash-based rather than a stream draw so that running the SAME tool twice on
 * the same wafer gives the same answer. Re-measuring should not be a free
 * reroll, and GDD §16 requires the whole shift to replay identically.
 */
function detectionRoll(waferIndex: number, tool: ToolType, defectType: string): number {
  // FNV-1a over a fixed key. Kept local and dependency-free: the sim package
  // must stay engine-free and this needs no entropy source.
  const key = `${tool}:${waferIndex}:${defectType}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Second mix, so nearby keys do not produce correlated rolls.
  let g = h;
  g = Math.imul(g ^ (g >>> 16), 0x45d9f3b) >>> 0;
  g = Math.imul(g ^ (g >>> 16), 0x45d9f3b) >>> 0;
  g = (g ^ (g >>> 16)) >>> 0;
  return g / 0x100000000;
}

/**
 * Take one measurement with a tool.
 *
 * The signal is derived, not stored: every defect the tool can resolve
 * contributes `severity * outOfSpecSpan * direction` to the reading, so the
 * number the player sees and the defects that caused it are guaranteed to be
 * the same fact. An earlier design kept a separate "alert" boolean, and the
 * picture and the verdict could disagree.
 */
export function measure(wafer: EffectiveWafer, tool: ToolType): MetrologyReading {
  const spec = TOOL_SPECS[tool];
  const active = wafer.defects.filter((d) => !d.masked);

  const resolvable = active.filter((d) => toolCanResolve(tool, d.defectType));
  const invisible = active.filter((d) => !toolCanResolve(tool, d.defectType)).map((d) => d.defectType);

  const resolved: ResolvedDefect[] = [];
  let subResolution = false;
  let worstConfidence = 0;

  for (const d of resolvable) {
    // A defect smaller than the instrument's resolution floor reads clean. This
    // is the physical reason a Hard silicide stringer can survive a pass.
    const geometricVisibility = d.severity / Math.max(spec.resolutionLimit, 1e-6);
    if (geometricVisibility < 1) {
      subResolution = true;
      continue;
    }

    const ceiling = spec.detectionCeiling * DEG[detectDifficultyFor(d.defectType)]!;
    const roll = detectionRoll(wafer.index, tool, d.defectType);
    if (roll > ceiling) {
      // Within this technique's ability but not caught on this pass. Not
      // silently dropped: it lowers the reported confidence so a marginal
      // reading reads as marginal rather than as a clean bill of health.
      subResolution = true;
      continue;
    }

    resolved.push({
      defectType: d.defectType,
      defectClass: d.defectClass,
      severity: d.severity,
      regionX: d.regionX,
      regionY: d.regionY,
    });
    worstConfidence = Math.max(worstConfidence, ceiling);
  }

  // Derive the signal from the resolved set. Multiple defects on one wafer add
  // their contributions, which is why a wafer with both a bowed edge and a
  // contaminated patch reads worse on the stylus than either alone.
  const contribution = resolved.reduce(
    (sum, r) => sum + r.severity * spec.measurand.outOfSpecSpan * spec.measurand.direction,
    0,
  );
  const value = spec.measurand.nominal + contribution;
  const outOfSpec = value < spec.measurand.lowerLimit || value > spec.measurand.upperLimit;

  return {
    waferIndex: wafer.index,
    tool,
    signalLabel: spec.measurand.label,
    unit: spec.measurand.unit,
    value,
    precision: spec.measurand.precision,
    lowerLimit: spec.measurand.lowerLimit,
    upperLimit: spec.measurand.upperLimit,
    outOfSpec,
    resolved,
    invisible,
    confidence: worstConfidence,
    latencySeconds: spec.latencySeconds,
    subResolution,
  };
}

/**
 * `detectionDifficulty` lives on the DefectProfile config, but a measurement
 * only has the wafer in hand. The mapping is a code table because the GDD §7
 * table pairs each defect with its technique and difficulty as a matter of
 * physics — the same reasoning as `DEFECT_ROUTING`.
 */
const DEFECT_DIFFICULTY: Readonly<Record<string, DetectionDifficulty>> = {
  BowingWarping: 'Easy',
  SubstrateContamination: 'Easy',
  STIVoid: 'Medium',
  InterfaceRoughness: 'Medium',
  SilicideBridging: 'Hard',
  TungstenPlugVoid: 'Hard',
};

export function detectDifficultyFor(defectType: string): DetectionDifficulty {
  return DEFECT_DIFFICULTY[defectType] ?? 'Medium';
}

// ---------------------------------------------------------------------------
// Session — per-wafer evidence
// ---------------------------------------------------------------------------

/**
 * What the player has actually established about the wafer in front of them.
 *
 * The disposition decision is made against this, not against ground truth. That
 * separation is the whole game: stamp Accept on a wafer you have not properly
 * measured and you have committed a false accept, whether or not a defect was
 * really there.
 */
export interface WaferEvidence {
  readonly readings: readonly MetrologyReading[];
  /** Union of everything resolved so far. */
  readonly revealed: readonly ResolvedDefect[];
  /** True if any reading went out of spec. */
  readonly anyOutOfSpec: boolean;
  /** True if any resolved defect is catastrophic. */
  readonly killerRevealed: boolean;
  /** Total latency charged so far, for §11 latency-by-layer. */
  readonly latencySeconds: number;
  /** True once a reading could not see a defect that is present. */
  readonly blindSpot: boolean;
}

export const EMPTY_EVIDENCE: WaferEvidence = {
  readings: [],
  revealed: [],
  anyOutOfSpec: false,
  killerRevealed: false,
  latencySeconds: 0,
  blindSpot: false,
};

/** Fold a reading into the accumulated evidence for a wafer. */
export function addReading(prev: WaferEvidence, r: MetrologyReading): WaferEvidence {
  // Idempotent per (tool, defectType): re-running an instrument does not
  // double-count a defect, but it DOES charge latency again, because re-running
  // a slow scan really did take the time.
  const revealed: ResolvedDefect[] = [...prev.revealed];
  for (const d of r.resolved) {
    if (!revealed.some((x) => x.defectType === d.defectType)) revealed.push(d);
  }
  return {
    readings: [...prev.readings, r],
    revealed,
    anyOutOfSpec: prev.anyOutOfSpec || r.outOfSpec,
    killerRevealed: prev.killerRevealed || r.resolved.some((d) => d.defectClass === 'Catastrophic'),
    latencySeconds: prev.latencySeconds + r.latencySeconds,
    blindSpot: prev.blindSpot || r.invisible.length > 0,
  };
}

/** Roll several tools into one evidence record. */
export function measureAll(wafer: EffectiveWafer, tools: readonly ToolType[]): WaferEvidence {
  return tools.reduce((acc, t) => addReading(acc, measure(wafer, t)), EMPTY_EVIDENCE);
}