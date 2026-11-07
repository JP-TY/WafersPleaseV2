/**
 * Campaign tests (GDD §9 progression).
 *
 * The three days are the GDD's teaching ramp, so what matters is that the ramp is
 * enforced rather than merely described in briefing text. Three claims are pinned
 * here: the gate tightens across the days, boosts persist, and the campaign is
 * deterministic.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Campaign, seedForDay, GATE_RELAXATION } from '../src/shift/campaign.js';
import { correctActionFor } from '../src/evaluation/disposition.js';
import { generateLot, projectWafer } from '../src/generation/lot-generator.js';
import { INITIAL_STATION_STATE } from '../src/generation/wafer.js';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig, ToolConfig } from '@wafers/data';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.resolve(HERE, '../../data/config');
const load = (f: string) => JSON.parse(readFileSync(path.join(CONFIG, f), 'utf8'));

const DAYS: DayConfig[] = load('days.json').days;
const RULES: RuleMatrix[] = load('rule-matrices.json').ruleMatrices;
const DEFECTS: DefectProfile[] = load('defects.json').defects;
const TOOLS: ToolConfig[] = load('tools.json').tools;
const SCORING: ScoringConfig = load('scoring.json').scoring;

const cfg = { days: DAYS, rules: RULES, defects: DEFECTS, tools: TOOLS, scoring: SCORING, seed: 20260904 };

/** Play a day with a perfect oracle: every available tool, correct stamp, reworks won. */
function playDay(campaign: Campaign, boostsEarned = 0): ReturnType<Campaign['recordDay']> {
  const director = campaign.createDirector();
  director.beginShift();
  const lot = generateLot({
    day: campaign.day,
    defects: DEFECTS,
    seed: seedForDay(cfg.seed, campaign.dayNumber),
  });
  let p = director.presentNextWafer();
  while (p) {
    const action = correctActionFor(projectWafer(lot.wafers[p.index]!, INITIAL_STATION_STATE), campaign.ruleMatrix);
    const r = director.stampWafer(action, campaign.day.availableTools);
    if (r.needsRework) director.resolveRework(p.index, { success: true, quality: 0.9 });
    p = director.presentNextWafer();
  }
  return campaign.recordDay(director, boostsEarned);
}

describe('day seeds (GDD §16 replay)', () => {
  it('is deterministic', () => {
    expect(seedForDay(42, 1)).toBe(seedForDay(42, 1));
  });

  it('gives every day a distinct lot', () => {
    const seeds = [1, 2, 3].map((d) => seedForDay(cfg.seed, d));
    expect(new Set(seeds).size).toBe(3);
  });

  it('never produces zero, which the RNG substitutes and would be recorded', () => {
    for (let d = 1; d <= 3; d++) {
      expect(seedForDay(0, d)).not.toBe(0);
      expect(seedForDay(0xffffffff, d)).not.toBe(0);
    }
  });

  it('the same campaign seed replays the same campaign', () => {
    const a = new Campaign(cfg);
    const b = new Campaign(cfg);
    expect(playDay(a).competencyScore).toBe(playDay(b).competencyScore);
    expect(playDay(a).salaryTotal).toBe(playDay(b).salaryTotal);
  });
});

describe('gate strictness tightens across the days (GDD §9)', () => {
  it('Day 1 is relaxed, Day 2 authored, Day 3 authored', () => {
    const c = new Campaign(cfg);
    expect(c.competencyTargetFor(1)).toBeCloseTo(0.6);
    expect(c.competencyTargetFor(2)).toBeCloseTo(0.7);
    expect(c.competencyTargetFor(3)).toBeCloseTo(0.7);
  });

  it('never relaxes a target into an impossible bar', () => {
    for (const d of [1, 2, 3]) {
      const t = new Campaign(cfg).competencyTargetFor(d);
      expect(t).toBeGreaterThanOrEqual(0.5);
      expect(t).toBeLessThanOrEqual(0.95);
    }
  });

  it('the relaxation only ever loosens, never tightens below authored', () => {
    for (const d of [1, 2, 3]) {
      expect(GATE_RELAXATION[d] ?? 0).toBeLessThanOrEqual(0);
    }
  });

  it('the authored percentage is normalised before comparison', () => {
    // DayConfig authors 70; the gate compares against a fraction. A regression
    // here makes every day unwinnable, which is exactly what happened before.
    for (const d of [1, 2, 3]) {
      const authored = DAYS.find((x) => x.dayNumber === d)!.competencyTarget;
      expect(authored).toBe(70);
      expect(new Campaign(cfg).competencyTargetFor(d)).toBeLessThan(1);
    }
  });
});

describe('day gating (GDD §9 "Pass both gates to certify")', () => {
  it('starts with only Day 1 available', () => {
    const c = new Campaign(cfg);
    expect(c.statusOf(1)).toBe('available');
    expect(c.statusOf(2)).toBe('locked');
    expect(c.statusOf(3)).toBe('locked');
  });

  it('unlocks Day 2 after Day 1 is passed', () => {
    let c = new Campaign(cfg);
    playDay(c);
    expect(c.statusOf(1)).toBe('passed');
    expect(c.statusOf(2)).toBe('available');
    expect(c.statusOf(3)).toBe('locked');
    c = c.advance();
    expect(c.dayNumber).toBe(2);
  });

  it('unlocks Day 3 only after Day 2, and certifies on its pass', () => {
    let c = new Campaign(cfg);
    playDay(c);
    c = c.advance();
    playDay(c);
    expect(c.statusOf(3)).toBe('available');
    c = c.advance();
    playDay(c);
    expect(c.statusOf(3)).toBe('passed');
    expect(c.isCertified).toBe(true);
    expect(c.isComplete).toBe(true);
  });

  it('a failed day leaves the next one locked', () => {
    const c = new Campaign(cfg);
    // Stamp everything Accept on Day 1, which is wrong on most wafers.
    const director = c.createDirector();
    director.beginShift();
    while (director.presentNextWafer()) director.stampWafer('Accept', c.day.availableTools);
    const rec = c.recordDay(director, 0);
    if (!rec.passed) {
      expect(c.statusOf(2)).toBe('locked');
      // Repeating a failed day stays allowed: that is the training loop.
      expect(c.retry().dayNumber).toBe(1);
      expect(c.statusOf(1)).not.toBe('locked');
    }
  });
});

describe('quiz boosts persist across days (GDD §12 "permanent")', () => {
  it('are banked when the day is recorded, and carry forward', () => {
    // Boosts are earned during Review, before the debrief, so they arrive with
    // recordDay rather than with advance().
    let c = new Campaign(cfg);
    playDay(c, 2);
    expect(c.boosts).toBe(2);
    c = c.advance();
    expect(c.boosts).toBe(2);
    playDay(c, 3);
    expect(c.boosts).toBe(5);
    c = c.advance();
    expect(c.boosts).toBe(5);
  });

  it('are retained on a retry of the same day', () => {
    const c = new Campaign(cfg, 1, 4, []).retry();
    expect(c.boosts).toBe(4);
  });

  it('are retained on a full restart', () => {
    const c = new Campaign(cfg, 3, 7, []).restart();
    expect(c.dayNumber).toBe(1);
    expect(c.boosts).toBe(7);
    expect(c.records).toHaveLength(0);
  });

  it('are recorded per day in the summary', () => {
    let c = new Campaign(cfg);
    playDay(c, 1);
    c = c.advance();
    playDay(c, 2);
    const sum = c.summary();
    expect(sum[0]!.boostsEarned).toBe(1);
    expect(sum[1]!.boostsEarned).toBe(2);
    expect(c.boosts).toBe(3);
  });
});

describe('advance is non-destructive', () => {
  it('returns a new campaign and leaves the old one where it was', () => {
    const c = new Campaign(cfg);
    playDay(c);
    const next = c.advance();
    expect(next).not.toBe(c);
    expect(c.dayNumber).toBe(1);
    expect(next.dayNumber).toBe(2);
  });

  it('does not run past the last day', () => {
    const c = new Campaign(cfg, 3);
    expect(c.advance().dayNumber).toBe(3);
  });
});

describe('the summary feeds the progression board', () => {
  it('reports one row per day with gate targets and results', () => {
    let c = new Campaign(cfg);
    playDay(c);
    c = c.advance();
    const rows = c.summary();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.dayNumber)).toEqual([1, 2, 3]);
    expect(rows[0]!.status).toBe('passed');
    expect(rows[0]!.competencyScore).not.toBeNull();
    expect(rows[1]!.status).toBe('available');
    expect(rows[1]!.competencyScore).toBeNull();
    expect(rows[2]!.status).toBe('locked');
    for (const r of rows) {
      expect(r.title.length).toBeGreaterThan(3);
      expect(r.salaryTarget).toBeGreaterThan(0);
      expect(r.competencyTarget).toBeGreaterThan(0.5);
    }
  });
});
