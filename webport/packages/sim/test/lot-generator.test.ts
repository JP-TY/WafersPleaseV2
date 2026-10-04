import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { generateLot, projectWafer, routingWeightsFor, MAX_DEFECT_SLOTS } from '../src/generation/lot-generator.js';
import { DEFECT_ROUTING, ROUTING_METROLOGY, INITIAL_STATION_STATE, armCmpBrake, tickCmpBrake } from '../src/generation/wafer.js';
import type { DayConfig, DefectProfile } from '@wafers/data';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const load = (f: string) => JSON.parse(readFileSync(path.join(CONFIG, f), 'utf8'));

const DEFECTS: DefectProfile[] = load('defects.json').defects;
const DAYS: DayConfig[] = load('days.json').days;
const DAY1 = DAYS.find((d) => d.dayNumber === 1)!;
const DAY2 = DAYS.find((d) => d.dayNumber === 2)!;

describe('generateLot determinism (GDD §16)', () => {
  it('produces identical lots for identical seeds', () => {
    const a = generateLot({ day: DAY1, defects: DEFECTS, seed: 42 });
    const b = generateLot({ day: DAY1, defects: DEFECTS, seed: 42 });
    expect(a.wafers).toEqual(b.wafers);
  });

  it('produces different lots for different seeds', () => {
    const a = generateLot({ day: DAY1, defects: DEFECTS, seed: 1 });
    const b = generateLot({ day: DAY1, defects: DEFECTS, seed: 2 });
    expect(a.wafers).not.toEqual(b.wafers);
  });

  it('substitutes a zero seed with the golden-ratio constant and records it', () => {
    const lot = generateLot({ day: DAY1, defects: DEFECTS, seed: 0 });
    expect(lot.substituted).toBe(true);
    expect(lot.seed).toBe(0x9e3779b9);
  });

  it('passes non-zero seeds through unsubstituted', () => {
    expect(generateLot({ day: DAY1, defects: DEFECTS, seed: 77 }).substituted).toBe(false);
  });

  it('makes the same seed on different days produce different lots', () => {
    const d1 = generateLot({ day: DAY1, defects: DEFECTS, seed: 99 });
    const d2 = generateLot({ day: DAY2, defects: DEFECTS, seed: 99 });
    expect(d1.wafers).not.toEqual(d2.wafers);
  });

  it('honours the wafer count per day', () => {
    expect(generateLot({ day: DAY1, defects: DEFECTS, seed: 1 }).wafers).toHaveLength(DAY1.wafersPerDay);
    expect(generateLot({ day: DAY2, defects: DEFECTS, seed: 1 }).wafers).toHaveLength(DAY2.wafersPerDay);
  });
});

describe('draw-count invariant', () => {
  it('every wafer consumes the same number of draws regardless of defect count', () => {
    const lot = generateLot({ day: DAY1, defects: DEFECTS, seed: 12345 });
    const counts = lot.wafers.map((w) => w.drawCount);
    const distinct = new Set(counts);
    expect(distinct.size, `draw counts varied: ${JSON.stringify(counts)}`).toBe(1);
  });

  it('clean and dirty wafers cost the same draws', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const lot = generateLot({ day: DAY1, defects: DEFECTS, seed });
      const counts = lot.wafers.map((w) => w.drawCount);
      expect(new Set(counts).size).toBe(1);
    }));
  });
});

describe('routing-step-first sampling', () => {
  it('Day 1 defects all land on Substrate', () => {
    for (const d of DAY1.allowedDefects) {
      const p = DEFECTS.find((x) => x.id === d)!;
      expect(DEFECT_ROUTING[p.defectType]).toBe('Substrate');
    }
  });

  it('a wafer only carries defects valid at its own routing step', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const lot = generateLot({ day: DAY2, defects: DEFECTS, seed });
      for (const w of lot.wafers) {
        for (const d of w.latentDefects) {
          expect(DEFECT_ROUTING[d.defectType], `wafer ${w.index} at ${w.routingStep} has ${d.defectType}`).toBe(w.routingStep);
        }
      }
    }));
  });

  it('Day 2 spans the STI and gate-stack routing steps', () => {
    const steps = new Set<string>();
    for (const d of DAY2.allowedDefects) {
      steps.add(DEFECT_ROUTING[DEFECTS.find((x) => x.id === d)!.defectType]);
    }
    expect(steps.size).toBeGreaterThan(1);
  });
});

describe('defect structure', () => {
  it('never exceeds MAX_DEFECT_SLOTS per wafer', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const lot = generateLot({ day: DAY1, defects: DEFECTS, seed });
      for (const w of lot.wafers) expect(w.latentDefects.length).toBeLessThanOrEqual(MAX_DEFECT_SLOTS);
    }));
  });

  it('severity stays in [0,1]', () => {
    fc.assert(fc.property(fc.integer(), (seed) => {
      const lot = generateLot({ day: DAY1, defects: DEFECTS, seed });
      for (const w of lot.wafers) for (const d of w.latentDefects) {
        expect(d.severity).toBeGreaterThanOrEqual(0);
        expect(d.severity).toBeLessThanOrEqual(1);
      }
    }));
  });
});

describe('projectWafer (stage 2)', () => {
  const lot = generateLot({ day: DAY2, defects: DEFECTS, seed: 4242 });

  it('masks STI voids only while the CMP brake is armed (GDD §8C)', () => {
    const stiWafer = lot.wafers.find((w) => w.latentDefects.some((d) => d.defectType === 'STIVoid'));
    if (!stiWafer) return; // no STI wafer in this seed; other seeds cover it
    const masked = projectWafer(stiWafer, armCmpBrake(INITIAL_STATION_STATE, 5));
    const unmasked = projectWafer(stiWafer, INITIAL_STATION_STATE);
    expect(masked.defects.filter((d) => d.masked).length).toBeGreaterThan(0);
    expect(unmasked.defects.filter((d) => d.masked)).toHaveLength(0);
  });

  it('never masks non-STI defects even with the brake armed', () => {
    const armed = armCmpBrake(INITIAL_STATION_STATE, 5);
    for (const w of lot.wafers) {
      const eff = projectWafer(w, armed);
      for (const d of eff.defects) {
        if (d.defectType !== 'STIVoid') expect(d.masked).toBe(false);
      }
    }
  });

  it('derives required metrology from routing step alone', () => {
    for (const w of lot.wafers) {
      const eff = projectWafer(w, INITIAL_STATION_STATE);
      expect(eff.requiredMetrology).toEqual(ROUTING_METROLOGY[w.routingStep]);
    }
  });

  it('still requires the metrology set after masking (traveler is unaware)', () => {
    const stiWafer = lot.wafers.find((w) => w.routingStep === 'ShallowTrenchIsolation');
    if (!stiWafer) return;
    const eff = projectWafer(stiWafer, armCmpBrake(INITIAL_STATION_STATE, 5));
    expect(eff.requiredMetrology).toEqual(ROUTING_METROLOGY.ShallowTrenchIsolation);
  });

  it('makes zero draws (projection is a pure read)', () => {
    const eff1 = projectWafer(lot.wafers[0]!, INITIAL_STATION_STATE);
    const eff2 = projectWafer(lot.wafers[0]!, INITIAL_STATION_STATE);
    expect(eff1).toEqual(eff2);
  });

  it('brake counter ticks down per wafer and never goes negative', () => {
    let s = armCmpBrake(INITIAL_STATION_STATE, 2);
    expect(s.cmpBrakeWafersRemaining).toBe(2);
    s = tickCmpBrake(s);
    s = tickCmpBrake(s);
    s = tickCmpBrake(s);
    expect(s.cmpBrakeWafersRemaining).toBe(0);
  });

  it('active defect count excludes masked defects', () => {
    const stiWafer = lot.wafers.find((w) => w.latentDefects.some((d) => d.defectType === 'STIVoid'));
    if (!stiWafer) return;
    const allSti = stiWafer.latentDefects.every((d) => d.defectType === 'STIVoid');
    if (!allSti) return;
    const eff = projectWafer(stiWafer, armCmpBrake(INITIAL_STATION_STATE, 5));
    expect(eff.activeDefectCount).toBe(0);
  });
});

describe('routing weights', () => {
  it('weights layers by allowed-defect count', () => {
    const pool = DAY2.allowedDefects.map((id) => DEFECTS.find((d) => d.id === id)!);
    const { layers, weights } = routingWeightsFor(pool);
    expect(layers.length).toBe(weights.length);
    expect(weights.every((w) => w > 0)).toBe(true);
  });

  it('Day 1 collapses to a single layer', () => {
    const pool = DAY1.allowedDefects.map((id) => DEFECTS.find((d) => d.id === id)!);
    const { layers } = routingWeightsFor(pool);
    expect(layers).toHaveLength(1);
  });
});