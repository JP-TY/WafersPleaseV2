import { describe, expect, it } from 'vitest';
import {
  Campaign,
  ShiftDirector,
  measure,
  addReading,
  EMPTY_EVIDENCE,
  recipeFor,
  createRcaClean,
} from '@wafers/sim';
import { loadGameConfig, campaignConfigFrom } from '../src/session/config.js';

/** Headless Day 1 purity consumer: play a seeded shift without Babylon. */
function playDay1Perfect(seed: number) {
  const game = loadGameConfig();
  const campaign = new Campaign(campaignConfigFrom(game, seed), 1);
  const director = campaign.createDirector();
  const matrix = campaign.ruleMatrix;
  const recipe = recipeFor('RCAClean', game.rework);
  const rng = campaign.createRng();

  director.beginShift();
  expect(director.currentPhase).toBe('Inspection');

  let presented = director.presentNextWafer();
  while (presented) {
    const wafer = director.currentWafer()!;
    let evidence = EMPTY_EVIDENCE;
    const toolsUsed: Array<(typeof campaign.day.availableTools)[number]> = [];
    for (const tool of campaign.day.availableTools) {
      const reading = measure(wafer, tool);
      evidence = addReading(evidence, reading);
      toolsUsed.push(tool);
    }

    // Decide from evidence + matrix (same information the UI shows).
    let action: 'Accept' | 'Reject' | 'Rework' = 'Accept';
    if (evidence.revealed.some((d) => d.defectType === 'BowingWarping')) action = 'Reject';
    else if (evidence.revealed.some((d) => d.defectType === 'SubstrateContamination')) action = 'Rework';
    else if (evidence.anyOutOfSpec) {
      // Out of spec but unresolved — stamp Reject as safe Day 1 default for bow-like signals.
      const stylus = evidence.readings.find((r) => r.tool === 'StylusProfilometer');
      action = stylus?.outOfSpec ? 'Reject' : 'Rework';
    }

    const stamp = director.stampWafer(action, toolsUsed);
    expect(stamp.feedback.correctAction).toBeTruthy();
    // Teaching payload always present from sim.
    expect(stamp.feedback.reasoning.length).toBeGreaterThan(0);

    if (stamp.needsRework) {
      const clean = createRcaClean(rng.fork(presented.index + 1), 0, recipe);
      const dt = 1 / 60;
      const runStep = (bath: 'sc1' | 'sc2' | null) => {
        if (bath) {
          clean.act({ type: 'setHeater', bath, setpointC: clean.state.step.targetC.nominal });
          for (
            let i = 0;
            i < 60 * 60 && clean.state.baths[bath].temperatureC < clean.state.step.targetC.nominal - 0.5;
            i++
          ) {
            clean.tick(dt);
          }
        }
        const hold = clean.state.step.dwellSeconds;
        clean.act({ type: 'immerse' });
        for (let t = 0; t < hold; t += dt) clean.tick(dt);
        clean.act({ type: 'withdraw' });
      };
      runStep('sc1');
      runStep(null);
      runStep('sc2');
      runStep(null);
      expect(clean.finished).toBe(true);
      director.resolveRework(presented.index, {
        success: !!clean.result?.success,
        quality: clean.result?.quality ?? 0,
      });
    }

    presented = director.presentNextWafer();
  }

  expect(director.wafersCompleted).toBe(director.totalWafers);
  while (director.currentPhase !== 'EndOfDay' && director.currentPhase !== 'Complete') {
    try {
      director.advancePhase();
    } catch {
      break;
    }
  }
  const record = campaign.recordDay(director, 0);
  return { record, matrix, director };
}

describe('Day 1 purity consumers', () => {
  it('loads authored config for Day 1 tools and defects', () => {
    const game = loadGameConfig();
    const day = game.days.find((d) => d.dayNumber === 1)!;
    expect(day.availableTools).toEqual(['StylusProfilometer', 'FourPointProbe']);
    expect(day.allowedDefects).toContain('bowing-warping');
    expect(day.allowedDefects).toContain('substrate-contamination');
    expect(game.ruleMatrices.some((m) => m.id === 'rule-matrix-day-1')).toBe(true);
  });

  it('identical seeds produce identical gate outcomes', () => {
    const a = playDay1Perfect(424242);
    const b = playDay1Perfect(424242);
    expect(a.record.salaryTotal).toBe(b.record.salaryTotal);
    expect(a.record.competencyScore).toBe(b.record.competencyScore);
    expect(a.record.passed).toBe(b.record.passed);
  });

  it('ShiftDirector exposes teaching feedback on wrong stamps', () => {
    const game = loadGameConfig();
    const campaign = new Campaign(campaignConfigFrom(game, 7), 1);
    const director = campaign.createDirector();
    director.beginShift();
    const p = director.presentNextWafer();
    expect(p).not.toBeNull();
    // Stamp Accept without tools — may or may not be wrong depending on wafer.
    const result = director.stampWafer('Accept', []);
    expect(result.feedback).toBeDefined();
    expect(typeof result.feedback.correct).toBe('boolean');
    expect(result.feedback.playerAction).toBe('Accept');
  });

  it('campaign day seed is stable', () => {
    const game = loadGameConfig();
    const a = new Campaign(campaignConfigFrom(game, 99), 1).createDirector();
    const b = new Campaign(campaignConfigFrom(game, 99), 1).createDirector();
    expect(a.lot.wafers.map((w) => w.index)).toEqual(b.lot.wafers.map((w) => w.index));
    expect(a.lot.wafers.length).toBe(game.days[0]!.wafersPerDay);
  });
});

describe('playability smoke (headless director)', () => {
  it('can clear a Day 1 lot without dead-ending', () => {
    const game = loadGameConfig();
    const director = new ShiftDirector({
      day: game.days[0]!,
      defects: game.defects,
      ruleMatrix: game.ruleMatrices.find((m) => m.id === 'rule-matrix-day-1')!,
      scoring: game.scoring,
      seed: 20260904,
    });
    director.beginShift();
    let guard = 0;
    while (director.wafersCompleted < director.totalWafers && guard++ < 20) {
      const p = director.presentNextWafer();
      if (!p) break;
      const stamp = director.stampWafer('Accept', ['StylusProfilometer', 'FourPointProbe']);
      if (stamp.needsRework) {
        director.resolveRework(p.index, { success: true, quality: 1 });
      }
    }
    expect(director.wafersCompleted).toBe(director.totalWafers);
    director.advancePhase(); // → Break or Review
    const { gate, debrief } = director.completeShift();
    expect(debrief.headline.length).toBeGreaterThan(0);
    expect(typeof gate.passed).toBe('boolean');
  });
});
