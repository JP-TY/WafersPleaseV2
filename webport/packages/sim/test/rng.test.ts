import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Rng, stableHash, makeRunSeed } from '../src/rng.js';

describe('Rng determinism', () => {
  it('produces identical streams for identical seeds', () => {
    const a = new Rng(12345);
    const b = new Rng(12345);
    const sa = Array.from({ length: 64 }, () => a.nextUint32());
    const sb = Array.from({ length: 64 }, () => b.nextUint32());
    expect(sa).toEqual(sb);
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from({ length: 32 }, ((r) => () => r.nextUint32())(new Rng(1)));
    const b = Array.from({ length: 32 }, ((r) => () => r.nextUint32())(new Rng(2)));
    expect(a).not.toEqual(b);
  });

  it('is stable across independent instances (no hidden state)', () => {
    const first = new Rng(999).nextUint32();
    const second = new Rng(999).nextUint32();
    expect(first).toBe(second);
  });
});

describe('Rng distribution', () => {
  it('nextFloat stays in [0, 1)', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const r = new Rng(seed);
      for (let i = 0; i < 512; i++) {
        const v = r.nextFloat();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }));
  });

  it('nextInt is inclusive on both ends and hits them', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 4000; i++) seen.add(r.nextInt(3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
  });

  it('nextInt rejects inverted or fractional bounds', () => {
    const r = new Rng(1);
    expect(() => r.nextInt(5, 1)).toThrow(RangeError);
    expect(() => r.nextInt(1.5, 4)).toThrow(RangeError);
    expect(r.nextInt(3, 3)).toBe(3);
  });

  it('nextInt is roughly uniform', () => {
    const r = new Rng(4242);
    const counts = [0, 0, 0, 0];
    const N = 40000;
    for (let i = 0; i < N; i++) counts[r.nextInt(0, 3)]!++;
    for (const c of counts) {
      expect(Math.abs(c - N / 4) / (N / 4)).toBeLessThan(0.05);
    }
  });

  it('nextFloat is roughly uniform', () => {
    const r = new Rng(31337);
    const buckets = new Array(10).fill(0);
    const N = 100000;
    for (let i = 0; i < N; i++) buckets[Math.floor(r.nextFloat() * 10)]!++;
    for (const b of buckets) {
      expect(Math.abs(b - N / 10) / (N / 10)).toBeLessThan(0.05);
    }
  });
});

describe('Rng zero-seed handling', () => {
  it('never degenerates to a constant stream', () => {
    const z = makeRunSeed(0);
    expect(z.substituted).toBe(true);
    const r = new Rng(0);
    const draws = new Set(Array.from({ length: 32 }, () => r.nextUint32()));
    expect(draws.size).toBeGreaterThan(16);
  });

  it('makeRunSeed passes non-zero seeds through unchanged', () => {
    expect(makeRunSeed(77)).toEqual({ seed: 77, substituted: false });
  });
});

describe('shuffle', () => {
  it('is a permutation — same multiset out as in', () => {
    fc.assert(fc.property(fc.integer(), fc.array(fc.integer()), (seed, arr) => {
      const out = new Rng(seed).shuffle([...arr]);
      expect(out).toHaveLength(arr.length);
      expect([...out].sort((a, b) => a - b)).toEqual([...arr].sort((a, b) => a - b));
    }));
  });

  it('actually reorders (does not silently no-op)', () => {
    // 30 elements makes an identity shuffle overwhelmingly unlikely by chance.
    let moved = false;
    fc.assert(fc.property(fc.integer(), (seed) => {
      const input = Array.from({ length: 30 }, (_, i) => i);
      const out = new Rng(seed).shuffle([...input]);
      if (out.some((v, i) => v !== i)) moved = true;
    }), { numRuns: 40 });
    expect(moved).toBe(true);
  });

  it('leaves sub-arrays of length <= 1 untouched', () => {
    expect(new Rng(1).shuffle([])).toEqual([]);
    expect(new Rng(1).shuffle([7])).toEqual([7]);
  });
});

describe('fork', () => {
  it('produces a stream independent of the parent', () => {
    const parent = new Rng(555);
    const a = parent.fork(0);
    const b = parent.fork(0);
    // Same salt from the same parent state gives the same child...
    expect(a.nextUint32()).toBe(b.nextUint32());
    // ...but different salts do not.
    expect(parent.fork(1).nextUint32()).not.toBe(a.nextUint32());
  });

  it('consuming draws in a child does not shift the parent', () => {
    const control = new Rng(777);
    const expected = [control.nextUint32(), control.nextUint32()];

    const parent = new Rng(777);
    const child = parent.fork(3);
    for (let i = 0; i < 50; i++) child.nextUint32();

    expect([parent.nextUint32(), parent.nextUint32()]).toEqual(expected);
  });

  it('forked children of one parent are mutually distinct', () => {
    const parent = new Rng(2024);
    const seen = new Set<number>();
    for (let i = 0; i < 16; i++) seen.add(parent.fork(i).nextUint32());
    expect(seen.size).toBeGreaterThan(12);
  });
});

describe('stableHash', () => {
  it('is deterministic — unlike .NET string.GetHashCode', () => {
    expect(stableHash('Silicide Bridging')).toBe(stableHash('Silicide Bridging'));
  });

  it('is known-answer stable across runs', () => {
    // Pins the value so a refactor cannot silently reseed every scenario.
    expect(stableHash('')).toBe(0x811c9dc5);
    expect(stableHash('a')).toBe(0xe40c292c);
  });

  it('separates similar inputs', () => {
    expect(stableHash('sti-void')).not.toBe(stableHash('silicide-bridging'));
  });
});

describe('draw accounting', () => {
  it('counts every draw, which is what golden tests pin', () => {
    const r = new Rng(1);
    expect(r.drawCount).toBe(0);
    r.nextUint32();
    r.nextInt(0, 5);
    r.nextFloat();
    expect(r.drawCount).toBe(3);
  });
});
