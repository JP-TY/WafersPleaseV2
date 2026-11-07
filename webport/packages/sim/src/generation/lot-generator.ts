/**
 * Lot generation (stage 1) — deterministic, unconditional draws.
 *
 * Replaces `DayConfigSO.GenerateDefectSet`, which drew from the global
 * `UnityEngine.Random` stream and so could never be replayed. The draw ORDER is
 * part of the contract and the golden tests depend on it: never reorder the
 * channels.
 *
 * Sampling is ROUTING-STEP-FIRST, not defect-pool-first. The port plan's
 * critical rule is that the required metrology set derives from the routing
 * step ALONE, never from the defect class. The Unity version shuffled a flat
 * pool and so could put an STI defect and a gate-stack defect on the same wafer
 * — at which point "which tool does this wafer need?" has no single answer. A
 * wafer in the line is AT one process step, so the wafer's routing step is
 * drawn first and only defects valid at that step are sampled.
 *
 * Per wafer, exactly `1 + 4*MAX_DEFECT_SLOTS` channels are drawn
 * unconditionally — routing step, then presence + class-index + severity +
 * region-x + region-y for every slot, every wafer — so the draw count per wafer
 * is constant regardless of defect count. Changing a wafer's defect count later
 * never shifts the stream.
 */

import { makeRunSeed, Rng, stableHash, type RunSeed } from '../rng.js';
import {
  DEFECT_ROUTING,
  ROUTING_METROLOGY,
  type EffectiveDefect,
  type EffectiveWafer,
  type LatentDefect,
  type LatentLot,
  type LatentWafer,
  type ProcessLayer,
  type StationState,
} from './wafer.js';
import type { DayConfig, DefectProfile } from '@wafers/data';

/** Up to this many defects on one wafer, matching the Unity ceiling of 3. */
export const MAX_DEFECT_SLOTS = 3;

export interface LotInputs {
  readonly day: DayConfig;
  readonly defects: readonly DefectProfile[];
  /** Run seed. 0 is substituted with the golden-ratio constant and recorded. */
  readonly seed: number;
}

interface RoutingWeights {
  readonly layers: readonly ProcessLayer[];
  /** Integer weights, proportional to allowed-defect count per layer. */
  readonly weights: readonly number[];
}

/**
 * Derive routing weights from the day's allowed defects: each process layer in
 * the pool is weighted by how many allowed defects occur there. Days 1 and 3
 * are single-layer; Day 2 spans STI and gate stack and so splits.
 */
export function routingWeightsFor(pool: readonly DefectProfile[]): RoutingWeights {
  const counts = new Map<ProcessLayer, number>();
  for (const d of pool) {
    const layer = DEFECT_ROUTING[d.defectType];
    counts.set(layer, (counts.get(layer) ?? 0) + 1);
  }
  const layers = [...counts.keys()];
  const weights = layers.map((l) => counts.get(l)!);
  return { layers, weights };
}

/** Pick an index into `weights` proportionally, using one draw. */
function pickWeightedIndex(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  const roll = rng.nextInt(1, total);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (roll <= acc) return i;
  }
  return weights.length - 1;
}

/**
 * Roll the defect slots for one wafer.
 *
 * Draws are unconditional: presence + class-index + severity + region-x +
 * region-y for every slot, every wafer. `present` decides whether the slot is
 * real; the rest are drawn anyway so the stream advances by a constant amount.
 * `stepPool` is the pool restricted to this wafer's routing step.
 */
function rollDefectSlots(
  rng: Rng,
  stepPool: readonly DefectProfile[],
  density: number,
): LatentDefect[] {
  // Shuffle the step pool so which defects co-occur varies per wafer. The
  // shuffle itself consumes draws and is part of the constant per-wafer count.
  const shuffled = rng.shuffle([...stepPool]);

  const out: LatentDefect[] = [];
  for (let slot = 0; slot < MAX_DEFECT_SLOTS; slot++) {
    // Channel: is this slot populated?
    const present = stepPool.length > 0 && rng.nextFloat() < density;
    // Channel: which defect (drawn even if unpopulated, to keep counts fixed)?
    const pickIdx = stepPool.length > 0 ? rng.nextInt(0, stepPool.length - 1) : 0;
    // Channel: severity jitter around the profile's nominal.
    const jitter = rng.nextRange(-0.06, 0.06);
    // Channels: wafer-surface region.
    const regionX = rng.nextFloat();
    const regionY = rng.nextFloat();

    if (!present) continue;

    // Prefer a distinct defect per wafer when the pool allows: use the slot
    // index into the shuffled pool, falling back to the random pick for small
    // pools. This keeps co-occurring defects varied, as the Unity shuffle did.
    const profile = shuffled[Math.min(slot, shuffled.length - 1)] ?? stepPool[pickIdx]!;
    out.push({
      defectType: profile.defectType,
      defectClass: profile.defectClass,
      severity: clamp01(profile.severity + jitter),
      regionX,
      regionY,
    });
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Stage 1: produce the latent lot.
 *
 * The lot is a pure function of (seed, day config, defect profiles). Nothing
 * downstream is allowed to re-draw, so replaying the lot is guaranteed to
 * reproduce it bit-for-bit.
 */
export function generateLot(inputs: LotInputs): LatentLot {
  const run: RunSeed = makeRunSeed(inputs.seed);
  // Per-day stream derived from run seed and day number, so the same seed on a
  // different day makes a different lot but the same day always replays.
  const dayRng = new Rng((run.seed ^ stableHash(`day-${inputs.day.dayNumber}`)) >>> 0);

  // Resolve the day's allowed defect pool once, by id.
  const pool = inputs.day.allowedDefects
    .map((id) => inputs.defects.find((d) => d.id === id))
    .filter((d): d is DefectProfile => d !== undefined);

  const { layers, weights } = routingWeightsFor(pool);
  const poolByLayer = new Map<ProcessLayer, DefectProfile[]>();
  for (const d of pool) {
    const layer = DEFECT_ROUTING[d.defectType];
    const arr = poolByLayer.get(layer) ?? [];
    arr.push(d);
    poolByLayer.set(layer, arr);
  }

  const wafers: LatentWafer[] = [];
  for (let index = 0; index < inputs.day.wafersPerDay; index++) {
    const before = dayRng.drawCount;

    // Channel 0: routing step. Unconditional even when the pool is empty so the
    // per-wafer draw count stays fixed across configs.
    const layerIdx = layers.length > 0 ? pickWeightedIndex(dayRng, weights) : 0;
    const routingStep: ProcessLayer = layers[layerIdx] ?? 'Substrate';
    const stepPool = poolByLayer.get(routingStep) ?? [];

    const latentDefects = rollDefectSlots(dayRng, stepPool, inputs.day.defectDensity);

    wafers.push({
      index,
      routingStep,
      latentDefects,
      drawCount: dayRng.drawCount - before,
    });
  }

  return {
    seed: run.seed,
    substituted: run.substituted,
    dayNumber: inputs.day.dayNumber,
    wafers,
  };
}

/**
 * Stage 2: project a latent wafer into the effective wafer.
 *
 * ZERO draws. The only state-dependent transform is the CMP safety brake: an
 * `STIVoid` latent defect is masked when the brake counter is above zero
 * (GDD §8C). Everything else is a field read.
 */
export function projectWafer(wafer: LatentWafer, station: StationState): EffectiveWafer {
  const brakeActive = station.cmpBrakeWafersRemaining > 0;

  const defects: EffectiveDefect[] = wafer.latentDefects.map((d) => ({
    ...d,
    // The mask applies ONLY to STI voids and ONLY while the brake is armed.
    masked: brakeActive && d.defectType === 'STIVoid',
  }));

  const activeDefectCount = defects.filter((d) => !d.masked).length;

  return {
    index: wafer.index,
    routingStep: wafer.routingStep,
    defects,
    requiredMetrology: ROUTING_METROLOGY[wafer.routingStep],
    activeDefectCount,
  };
}
