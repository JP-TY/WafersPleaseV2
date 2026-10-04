/**
 * Wafer domain types — the two-stage generation pipeline.
 *
 * The single most important invariant of the whole simulation (carried over
 * from the port plan):
 *
 *   1. `generateLot` -> `LatentLot`. ALL random draws happen here,
 *      unconditionally, every wafer, in a fixed channel order. Determinism and
 *      draw-count reproducibility both live or die here.
 *   2. `projectWafer` -> `EffectiveWafer`. ZERO draws. It projects the latent
 *      lot through station state (currently only the CMP safety brake). The
 *      STI-void mask applies ONLY when the latent defect class is `STIVoid`
 *      AND the brake counter is above zero.
 *
 * Every downstream reader — the disposition evaluator, the scoring engine, the
 * shift machine — reads the `EffectiveWafer`, never the latent entry. That is
 * what makes the CMP brake's "prevents STI voids for the next 5 wafers"
 * (GDD §8C) possible without re-seeding anything.
 */

import type { DefectClass, DefectType, ToolType } from '@wafers/data';

// ---------------------------------------------------------------------------
// Process layers (GDD §6 node areas)
// ---------------------------------------------------------------------------

export const PROCESS_LAYERS = [
  'Substrate',
  'ShallowTrenchIsolation',
  'HighKMetalGate',
  'CopperDamascene',
] as const;
export type ProcessLayer = (typeof PROCESS_LAYERS)[number];

/**
 * Defect type -> the routing step at which it can occur.
 *
 * This is a code table, not config, because the GDD §6/§7 tie each defect to a
 * node area as a matter of physics, not authoring choice:
 *
 *   Bowing & Warping        -> Substrate (geometric integrity)
 *   Substrate Contamination -> Substrate (pre-gate cleaning)
 *   STI Void                -> Shallow Trench Isolation
 *   Interface Roughness     -> High-K Metal Gate (gate stack)
 *   Silicide Bridging       -> Copper Damascene (backend / silicides)
 *   Tungsten Plug Void      -> Copper Damascene (plugs)
 */
export const DEFECT_ROUTING: Readonly<Record<DefectType, ProcessLayer>> = {
  BowingWarping: 'Substrate',
  SubstrateContamination: 'Substrate',
  STIVoid: 'ShallowTrenchIsolation',
  InterfaceRoughness: 'HighKMetalGate',
  SilicideBridging: 'CopperDamascene',
  TungstenPlugVoid: 'CopperDamascene',
};

/**
 * The metrology tools a wafer needs at a routing step.
 *
 * CRITICAL RULE (carried from the port plan): this derives from the routing
 * step ALONE, never from the defect class. A wafer masked from `STIVoid` by the
 * CMP brake STILL requires ellipsometry, because the traveler does not know the
 * polisher was recalibrated.
 */
export const ROUTING_METROLOGY: Readonly<Record<ProcessLayer, readonly ToolType[]>> = {
  Substrate: ['StylusProfilometer', 'FourPointProbe'],
  ShallowTrenchIsolation: ['SpectroscopicEllipsometry'],
  HighKMetalGate: ['XRayRefractometry'],
  CopperDamascene: ['ElectronMicroscope'],
};

// ---------------------------------------------------------------------------
// Latent lot (stage 1) — produced by draws, never inspected directly
// ---------------------------------------------------------------------------

export interface LatentDefect {
  readonly defectType: DefectType;
  readonly defectClass: DefectClass;
  /** 0..1. */
  readonly severity: number;
  /** Wafer-surface UV position, 0..1 each. */
  readonly regionX: number;
  readonly regionY: number;
}

export interface LatentWafer {
  readonly index: number;
  readonly routingStep: ProcessLayer;
  /**
   * Always populated by the generator, whether or not the wafer ends up using
   * every slot. Unconditional draws keep the stream's draw count fixed.
   */
  readonly latentDefects: readonly LatentDefect[];
  /** Draws consumed to make this wafer; golden tests pin this. */
  readonly drawCount: number;
}

export interface LatentLot {
  readonly seed: number;
  readonly substituted: boolean;
  readonly dayNumber: number;
  readonly wafers: readonly LatentWafer[];
}

// ---------------------------------------------------------------------------
// Effective wafer (stage 2) — what the player actually evaluates
// ---------------------------------------------------------------------------

export interface EffectiveDefect extends LatentDefect {
  /**
   * True when this latent defect was suppressed by the CMP safety brake
   * (GDD §8C). A masked defect contributes nothing to disposition or scoring,
   * but the wafer STILL requires the metrology set of its routing step.
   */
  readonly masked: boolean;
}

export interface EffectiveWafer {
  readonly index: number;
  readonly routingStep: ProcessLayer;
  readonly defects: readonly EffectiveDefect[];
  /**
   * The metrology tools the traveler requires for this wafer. Derived from
   * routing step alone.
   */
  readonly requiredMetrology: readonly ToolType[];
  /**
   * Count of defects that survived the CMP-brake mask. Disposition and scoring
   * read this, never `latentDefects.length`.
   */
  readonly activeDefectCount: number;
}

// ---------------------------------------------------------------------------
// Station state — the only thing projection depends on
// ---------------------------------------------------------------------------

/**
 * State that affects projection. Currently only the CMP safety brake, armed by
 * a successful CMP laser-endpoint calibration (GDD §8C) and ticking down per
 * wafer presented.
 */
export interface StationState {
  /** Wafers of STI-void protection remaining. 0 = brake disengaged. */
  readonly cmpBrakeWafersRemaining: number;
}

export const INITIAL_STATION_STATE: StationState = {
  cmpBrakeWafersRemaining: 0,
};

/** Arm the brake for N wafers after a successful CMP calibration. */
export const armCmpBrake = (state: StationState, wafers: number): StationState => ({
  ...state,
  cmpBrakeWafersRemaining: state.cmpBrakeWafersRemaining + Math.max(0, wafers),
});

/** Tick the brake down by one wafer. */
export const tickCmpBrake = (state: StationState): StationState => ({
  ...state,
  cmpBrakeWafersRemaining: Math.max(0, state.cmpBrakeWafersRemaining - 1),
});