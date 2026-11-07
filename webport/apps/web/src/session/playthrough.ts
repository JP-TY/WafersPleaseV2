/**
 * §5.2 playthrough harness — scripted Day 1 via session.harness().
 * Stamps from metrology evidence (same facts the UI shows). Rework benches are
 * closed through forceCloseRework after open (proves session wiring); ideal RCA
 * physics is covered by packages/sim + rca-bench tests.
 */

import {
  Campaign,
  EMPTY_EVIDENCE,
  addReading,
  measure,
  createRcaClean,
  recipeFor,
  type PlayerAction,
} from '@wafers/sim';
import type { ShiftSession } from './shift-session.js';
import { campaignConfigFrom, loadGameConfig } from './config.js';

export interface PlaythroughReport {
  readonly ok: boolean;
  readonly phasesSeen: readonly string[];
  readonly wafers: number;
  readonly stamped: number;
  readonly reworks: number;
  readonly failures: readonly string[];
}

/** Headless perfect Day 1 (sim only) — gates + teaching payload. */
export function runHeadlessDay1(seed: number): { passed: boolean; salary: number; wafers: number } {
  const game = loadGameConfig();
  const campaign = new Campaign(campaignConfigFrom(game, seed), 1);
  const director = campaign.createDirector();
  const recipe = recipeFor('RCAClean', game.rework);
  const rng = campaign.createRng();
  director.beginShift();

  let presented = director.presentNextWafer();
  while (presented) {
    const wafer = director.currentWafer()!;
    let evidence = EMPTY_EVIDENCE;
    const toolsUsed: Array<(typeof campaign.day.availableTools)[number]> = [];
    for (const tool of campaign.day.availableTools) {
      evidence = addReading(evidence, measure(wafer, tool));
      toolsUsed.push(tool);
    }
    let action: PlayerAction = 'Accept';
    if (evidence.revealed.some((d) => d.defectType === 'BowingWarping')) action = 'Reject';
    else if (evidence.revealed.some((d) => d.defectType === 'SubstrateContamination')) action = 'Rework';
    else if (evidence.anyOutOfSpec) {
      const stylus = evidence.readings.find((r) => r.tool === 'StylusProfilometer');
      action = stylus?.outOfSpec ? 'Reject' : 'Rework';
    }
    const stamp = director.stampWafer(action, toolsUsed);
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
      director.resolveRework(presented.index, {
        success: !!clean.result?.success,
        quality: clean.result?.quality ?? 0,
      });
    }
    presented = director.presentNextWafer();
  }

  while (director.currentPhase !== 'EndOfDay' && director.currentPhase !== 'Complete') {
    try {
      director.advancePhase();
    } catch {
      break;
    }
  }
  const record = campaign.recordDay(director, 0);
  return { passed: record.passed, salary: record.salaryTotal, wafers: director.totalWafers };
}

/** Drive a live ShiftSession through a full Day 1 (NullEngine-safe). */
export function runSessionDay1Playthrough(
  session: ShiftSession,
  opts?: { maxSteps?: number; tick?: (dt: number) => void },
): PlaythroughReport {
  const maxSteps = opts?.maxSteps ?? 250;
  const tick = opts?.tick ?? ((dt: number) => session.update(dt));
  const phasesSeen: string[] = [];
  const failures: string[] = [];
  let stamped = 0;
  let reworks = 0;

  const note = () => {
    if (phasesSeen[phasesSeen.length - 1] !== session.phase) phasesSeen.push(session.phase);
  };

  session.harness({ type: 'skipOnboarding' });
  note();
  session.harness({ type: 'begin' });
  note();

  for (let step = 0; step < maxSteps; step++) {
    tick(0.25);
    note();

    if (session.phase === 'AwaitFoup') {
      session.harness({ type: 'loadFoup' });
      continue;
    }

    if (session.phase === 'Inspection') {
      const wafer = session.shiftDirector.currentWafer();
      if (!wafer) {
        failures.push('Inspection with no wafer');
        break;
      }
      for (const tool of session.campaignState.day.availableTools) {
        session.harness({ type: 'runTool', tool });
        tick(0.05);
        if (session.phase !== 'Inspection') break;
      }
      // Re-read through a wide type — runTool may have opened CmpCalib.
      const afterTools: string = session.phase;
      if (afterTools === 'CmpCalib') {
        session.harness({ type: 'forceCloseRework', success: true, armCmpBrake: true, brakeWafers: 5 });
        continue;
      }
      if (afterTools !== 'Inspection') continue;

      let evidence = EMPTY_EVIDENCE;
      for (const tool of session.campaignState.day.availableTools) {
        evidence = addReading(evidence, measure(wafer, tool));
      }
      let action: PlayerAction = 'Accept';
      if (evidence.revealed.some((d) => d.defectType === 'BowingWarping')) action = 'Reject';
      else if (evidence.revealed.some((d) => d.defectType === 'SubstrateContamination')) action = 'Rework';
      else if (evidence.anyOutOfSpec) {
        const stylus = evidence.readings.find((r) => r.tool === 'StylusProfilometer');
        action = stylus?.outOfSpec ? 'Reject' : 'Rework';
      }
      tick(0.5);
      session.harness({ type: 'stamp', action });
      stamped += 1;
      continue;
    }

    if (session.phase === 'Rework') {
      reworks += 1;
      session.harness({ type: 'forceCloseRework', success: true });
      if (session.phase === 'Rework') {
        failures.push('stuck in Rework after forceCloseRework');
        break;
      }
      continue;
    }

    if (session.phase === 'Break') {
      session.harness({ type: 'resume' });
      continue;
    }

    if (session.phase === 'Quiz') {
      // Day 1 correct answers: 1, 2, 0
      session.harness({ type: 'quizAnswer', choice: 1 });
      session.harness({ type: 'quizAnswer', choice: 2 });
      session.harness({ type: 'quizAnswer', choice: 0 });
      tick(1.5);
      session.harness({ type: 'finishQuiz' });
      continue;
    }

    if (session.phase === 'Debrief') {
      tick(3);
      session.harness({ type: 'dismissDebrief' });
      continue;
    }

    if (session.phase === 'Progression' || session.phase === 'Complete') break;
  }

  const wafers = session.shiftDirector.totalWafers;
  const reachedEnd = phasesSeen.includes('Debrief') || phasesSeen.includes('Progression');
  return {
    ok: stamped >= wafers && reachedEnd && failures.length === 0,
    phasesSeen,
    wafers,
    stamped,
    reworks,
    failures,
  };
}
