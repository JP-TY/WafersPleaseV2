/**
 * Deterministic RNG — xoshiro128** with a counter-based derivation.
 *
 * Replaces `UnityEngine.Random`, which the port plan forbids for three reasons
 * found in the Unity source:
 *
 *  1. `Random.InitState(defect.displayName.GetHashCode())` — .NET randomises
 *     string hashing per process, so those seeds are not reproducible across
 *     runs at all. All three Unity minigames seeded this way.
 *  2. Every draw came from the one global stream, so a minigame perturbed
 *     unrelated systems (defect generation, measurement noise) that happened to
 *     draw later. `InstrumentPanel.cs` correctly bracket its own reseeding with
 *     `Random.state` save/restore; the minigames did not.
 *  3. There was no way to fork a stream, so a scenario could not be replayed
 *     in isolation.
 *
 * This is a *seedable stream*, not a global. Every consumer takes an explicit
 * `Rng`, so drawing in one system cannot perturb another.
 *
 * Why xoshiro128** and not SplitMix64: the port plan specified xoshiro128**
 * because there is no 64-bit integer arithmetic anywhere in this codebase to
 * preserve. SplitMix64 would force BigInt for every draw; xoshiro128** runs at
 * full speed on `Math.imul` and passes TestU01. Period 2^128-1.
 *
 * Draw order within a stream is part of the contract — the port's golden tests
 * depend on it. Never reorder draws in an existing function.
 */

export class Rng {
  /** Internal state: four 32-bit words. */
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;

  /** Number of draws taken. Useful for asserting draw counts in tests. */
  public drawCount = 0;

  constructor(seed: number) {
    // Expand a single 32-bit seed into 128 bits of state with splitmix32 so
    // that adjacent seeds (Day1=1, Day2=2, ...) do not produce correlated
    // streams. A zero seed is substituted rather than allowed, because the
    // fixed point of xoshiro's update is the all-zero state.
    let z = seed >>> 0;
    if (z === 0) z = 0x9e3779b9;

    const next = () => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
      return (t ^ (t >>> 15)) >>> 0;
    };

    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();

    // All-zero state is xoshiro's fixed point and would emit zeros forever.
    // Astronomically unlikely from splitmix32, but cheap to rule out.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 0x9e3779b9;
  }

  /** Raw 32-bit unsigned draw. */
  nextUint32(): number {
    // Canonical xoshiro128** update:
    //   result = rotl(s1 * 5, 7) * 9
    //   t = s1 << 9; s2 ^= s0; s3 ^= s1; s1 ^= s2; s0 ^= s3; s2 ^= t; s3 = rotl(s3, 11)
    const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0;

    const result = Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0;

    const t = (this.s1 << 9) >>> 0;
    const s2 = (this.s2 ^ this.s0) >>> 0;
    let s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ s2) >>> 0;
    this.s0 = (this.s0 ^ s3) >>> 0;
    this.s2 = (s2 ^ t) >>> 0;
    this.s3 = rotl(s3, 11);

    this.drawCount++;
    return result >>> 0;
  }

  /** Uniform in [0, 1). 32 bits of mantissa — exactly representable. */
  nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Uniform integer in [min, max] inclusive.
   *
   * Uses rejection sampling rather than modulo. Modulo bias is negligible for
   * the small ranges used here, but rejection costs nothing at these widths and
   * keeps the stream's quality uniform across every call site.
   */
  nextInt(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`nextInt requires integers, got ${min}..${max}`);
    }
    if (max < min) throw new RangeError(`nextInt: max (${max}) < min (${min})`);
    if (min === max) return min;

    const span = max - min + 1;
    // Largest multiple of span that fits in 32 bits; reject the remainder.
    const limit = Math.floor(4294967296 / span) * span;
    let v: number;
    do {
      v = this.nextUint32();
    } while (v >= limit);
    return min + (v % span);
  }

  /** Uniform float in [min, max). */
  nextRange(min: number, max: number): number {
    if (max <= min) throw new RangeError(`nextRange: max (${max}) <= min (${min})`);
    return min + this.nextFloat() * (max - min);
  }

  /**
   * Fisher-Yates shuffle, in place.
   *
   * Replaces `DayConfigSO.GenerateDefectSet`'s hand-rolled shuffle, which used
   * `Random.Range(0, i + 1)` — inclusive on both ends, so it was not the
   * textbook Durstenfeld step and biased the distribution.
   */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }

  /** Pick one element uniformly. Throws on an empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('pick from empty array');
    return items[this.nextInt(0, items.length - 1)]!;
  }

  /**
   * Derive an independent child stream.
   *
   * Lets a parent scenario fork per-wafer or per-day streams so that consuming
   * draws in one does not shift another. This is the property Unity's single
   * global stream lacked.
   */
  fork(salt: number): Rng {
    const mixed = new Rng((this.s0 ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0);
    // Mix in a draw so two forks of the same parent differ.
    mixed.nextUint32();
    return new Rng((mixed.nextUint32() ^ this.s1 ^ this.s2 ^ this.s3 ^ salt) >>> 0);
  }
}

/**
 * Deterministic 32-bit string hash (FNV-1a).
 *
 * Replaces `string.GetHashCode()` as a *seed derivation* input only. This is a
 * stable hash — same input, same seed on every process and platform — which is
 * exactly what the Unity version was not. It is not used for gameplay values.
 */
export function stableHash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Run configuration for a shift.
 *
 * `seed === 0` is substituted with the golden-ratio constant and reported, so a
 * caller can never silently get the degenerate stream. The port plan lists this
 * as a requirement of the generation pipeline.
 */
export interface RunSeed {
  readonly seed: number;
  readonly substituted: boolean;
}

export function makeRunSeed(seed: number): RunSeed {
  if (seed === 0) return { seed: 0x9e3779b9, substituted: true };
  return { seed: seed >>> 0, substituted: false };
}