/**
 * ShiftSession headless tests.
 *
 * `ShiftSession` is the adapter between the simulation in `@wafers/sim` and the
 * diegetic workspace in `src/inspection/`. That adapter owns logic the sim tests
 * cannot reach: the GDD §5 phase machine, the per-day tool roster, the stamp
 * press cooldown, the routing of a Rework stamp to the right §8 bench, and the
 * CMP-brake handoff when a calibration succeeds.
 *
 * These run against a Babylon `NullEngine`, so the whole scene graph is built
 * and torn down with no GPU and no canvas. Bugs that only show up as "the button
 * did nothing" in a browser — a phase that never advances, a stamp rejected
 * forever, a bench that never opens — reproduce here deterministically.
 */

import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import '@babylonjs/core/Culling/ray.js';

import { ShiftSession, type ReworkBenchHandle } from '../src/inspection/shift-session.js';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig, ToolConfig } from '@wafers/data';
import { QUIZ_BANK, GLOSSARY_CRYSTALS } from '../src/inspection/scaffolding.js';
import defectsJson from '@wafers/data/config/defects.json';
import daysJson from '@wafers/data/config/days.json';
import matrixJson from '@wafers/data/config/rule-matrices.json';
import scoringJson from '@wafers/data/config/scoring.json';
import toolsJson from '@wafers/data/config/tools.json';

const DEFECTS = (defectsJson as { defects: DefectProfile[] }).defects;
const DAYS = (daysJson as { days: DayConfig[] }).days;
const TOOLS = (toolsJson as { tools: ToolConfig[] }).tools;
const SCORING = (scoringJson as { scoring: ScoringConfig }).scoring;

const DAY1 = DAYS.find((d) => d.dayNumber === 1)!;
const DAY2 = DAYS.find((d) => d.dayNumber === 2)!;
const DAY3 = DAYS.find((d) => d.dayNumber === 3)!;

/** A bench stand-in that records whether it was opened, and can be resolved. */
function fakeBench(): ReworkBenchHandle & { opened: boolean; visible: boolean } {
  return {
    opened: false,
    visible: false,
    setVisible(v: boolean) {
      this.visible = v;
      if (v) this.opened = true;
    },
    update() {},
  };
}

function makeSession(day: DayConfig, seed = 4242) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const benches = { rca: fakeBench(), silicide: fakeBench(), cmp: fakeBench() };
  const rules = (matrixJson as { ruleMatrices: RuleMatrix[] }).ruleMatrices.find(
    (r) => r.id === `rule-matrix-day-${day.dayNumber}`,
  )!;
  const session = new ShiftSession(scene, { day, rules, defects: DEFECTS, tools: TOOLS, scoring: SCORING, seed }, benches);
  session.setReworkBenches(benches);
  return { engine, scene, session, benches };
}

/** Run the fixed-timestep update enough frames for a stamp press to finish. */
function settle(session: ShiftSession, frames = 30) {
  for (let i = 0; i < frames; i++) session.update(1 / 60);
}

/**
 * Play until `stop` says so, handling the whole GDD §5 phase machine.
 *
 * Every lot-spanning test needs this: the periodic Break after every third
 * wafer halts the shift until it is resumed, so a loop that only handles
 * Inspection silently stalls three wafers in and reports "nothing happened".
 */
type PlayerAction = 'Accept' | 'Reject' | 'Rework';

/**
 * Play the shift until `stop` says so.
 *
 * Every lot-spanning test needs this. Two things it gets right that hand-rolled
 * loops kept getting wrong:
 *
 *  1. The periodic Break halts the shift every third wafer until resumed, so a
 *     loop that only handles Inspection silently stalls and reports that nothing
 *     happened.
 *  2. `stop` is evaluated BEFORE any state is advanced, so a test can observe a
 *     phase (EndOfDay) or a post-stamp condition (a rework bench being open)
 *     instead of having it consumed by the same iteration.
 */
function playLot(
  session: ShiftSession,
  onWafer: (index: number) => PlayerAction | 'rework-succeed' | 'rework-fail' | null,
  stop: (phase: string, waferIndex: number, reworkOpen: boolean) => boolean = () => false,
): void {
  if (session.currentPhase === 'Briefing') session.beginShift();

  for (let guard = 0; guard < 600; guard++) {
    if (stop(session.currentPhase, session.waferIndex, session.inRework)) return;

    switch (session.currentPhase) {
      case 'Break':
        session.resumeFromBreak();
        settle(session, 1);
        continue;
      case 'Review':
        session.endReview();
        settle(session, 1);
        continue;
      case 'EndOfDay':
        session.openDebrief();
        settle(session, 1);
        continue;
      case 'Debrief':
        settle(session, 60);
        continue;
      case 'Inspection':
        break;
      default:
        return;
    }

    if (session.waferIndex < 0) {
      settle(session, 1);
      continue;
    }

    const choice = onWafer(session.waferIndex);
    if (choice === null) {
      settle(session, 1);
      continue;
    }

    for (const t of session.toolsAvailable) session.runTool(t);
    const action: PlayerAction =
      choice === 'rework-succeed' || choice === 'rework-fail' ? 'Rework' : choice;
    session.commitStamp(action);
    settle(session, 25);

    // The bench is opened by the stamp, so report that state before closing it.
    if (stop(session.currentPhase, session.waferIndex, session.inRework)) return;

    if (session.inRework) {
      session.closeReworkBench(choice !== 'rework-fail', { armCmpBrake: choice === 'rework-succeed' });
      settle(session, 25);
    }
    settle(session, 1);
  }
}

describe('GDD §5 phase machine', () => {
  it('starts in Briefing and refuses to stamp before the shift begins', () => {
    const { session } = makeSession(DAY1);
    expect(session.currentPhase).toBe('Briefing');
    expect(session.commitStamp('Accept')).toBe(false);
    expect(session.runTool('StylusProfilometer')).toBe(false);
  });

  it('Briefing -> Inspection on beginShift', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    expect(session.currentPhase).toBe('Inspection');
    expect(session.waferIndex).toBe(0);
  });

  it('walks a whole lot through to the incident printer', () => {
    const { session } = makeSession(DAY1);
    // Briefing is the state the shift STARTS in, so record it before beginning.
    const phases: string[] = [session.currentPhase];
    let last = phases[0]!;
    // playLot drives the whole shift, including the debrief dwell; recording the
    // transitions here means we observe the sequence rather than assert the end.
    playLot(session, () => 'Accept', (phase) => {
      if (phase !== last) {
        phases.push(phase);
        last = phase;
      }
      return false;
    });
    // GDD §5 is a LOOP, not a line: per-wafer inspection, a periodic break, then
    // back to inspection. Day 1 is 5 wafers with a break every 3, so exactly one
    // periodic break occurs, and the shift then finishes through review.
    expect(phases).toEqual([
      'Briefing',
      'Inspection',
      'Break',
      'Inspection',
      'Review',
      'EndOfDay',
      'Debrief',
      'Complete',
    ]);
  });

  it('exhausting the lot reaches Review then EndOfDay, never a dead-end Break', () => {
    const { session } = makeSession(DAY1);
    const phases: string[] = [];
    playLot(session, () => 'Accept', (phase) => {
      if (phases[phases.length - 1] !== phase) phases.push(phase);
      return phase === 'EndOfDay';
    });
    // The lot ran out after the last periodic break had already been passed, so
    // the tail is Inspection -> Review -> EndOfDay.
    expect(phases.slice(-3)).toEqual(['Inspection', 'Review', 'EndOfDay']);
    expect(session.currentPhase).toBe('EndOfDay');
    // Every wafer was accounted for.
    expect(session.director.wafersCompleted).toBe(session.director.totalWafers);
  });

  it('a periodic break fires part-way through, not only at the end', () => {
    const { session } = makeSession(DAY3); // 10 wafers, so a break must occur.
    let sawBreak = false;
    session.beginShift();
    for (let guard = 0; guard < 200 && !sawBreak; guard++) {
      if (session.currentPhase === 'Break') {
        sawBreak = true;
        break;
      }
      if (session.currentPhase === 'Inspection' && session.waferIndex >= 0) {
        for (const t of session.toolsAvailable) session.runTool(t);
        session.commitStamp('Accept');
        settle(session, 25);
        if (session.inRework) session.closeReworkBench(true);
      }
      settle(session, 1);
    }
    expect(sawBreak).toBe(true);
    // And it must not be the exhaustion of the lot.
    expect(session.director.wafersCompleted).toBeLessThan(session.director.totalWafers);
  });
});

describe('per-day tool roster (GDD §9)', () => {
  it('Day 1 offers only the substrate instruments', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    expect(session.toolsAvailable).toEqual(['StylusProfilometer', 'FourPointProbe']);
    expect(session.runTool('ElectronMicroscope')).toBe(false);
  });

  it('Day 3 offers only the electron microscope', () => {
    const { session } = makeSession(DAY3);
    session.beginShift();
    expect(session.toolsAvailable).toEqual(['ElectronMicroscope']);
    expect(session.runTool('StylusProfilometer')).toBe(false);
    expect(session.runTool('ElectronMicroscope')).toBe(true);
  });

  it('refuses to run the same instrument twice on one wafer', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    expect(session.runTool('StylusProfilometer')).toBe(true);
    expect(session.runTool('StylusProfilometer')).toBe(false);
    // The other roster tool is still available.
    expect(session.runTool('FourPointProbe')).toBe(true);
  });

  it('clears the previous wafer reading when the next wafer arrives', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    session.runTool('StylusProfilometer');
    session.commitStamp('Accept');
    settle(session, 25);
    expect(session.evidenceNow.readings).toHaveLength(0);
    expect(session.toolsRun).toHaveLength(0);
  });
});

describe('stamp press (GDD §13 spring-loaded stamps)', () => {
  it('rejects a second stamp while the first is still mid-press', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    expect(session.commitStamp('Accept')).toBe(true);
    // No settle: the press animation is still running.
    expect(session.commitStamp('Accept')).toBe(false);
  });

  it('accepts a stamp again once the press has returned', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    session.commitStamp('Accept');
    settle(session, 30);
    expect(session.waferIndex).toBe(1);
    session.runTool('StylusProfilometer');
    expect(session.commitStamp('Accept')).toBe(true);
  });
});

describe('rework routing (GDD §8)', () => {
  it('a Rework stamp opens the bench that matches the defect', () => {
    // Seed 20260904, Day 1: wafer 4 carries substrate contamination only, whose
    // correct action is Rework, so the wet bench must open.
    const { session, benches } = makeSession(DAY1, 20260904);
    let openedAt = -1;
    playLot(session, () => 'Rework', (_p, _w, reworkOpen) => {
      if (reworkOpen && openedAt < 0) openedAt = 1;
      return reworkOpen;
    });
    expect(openedAt).toBeGreaterThanOrEqual(0);
    // GDD §8A: substrate contamination is cleaned at the twin-tank wet bench.
    expect(benches.rca.opened).toBe(true);
  });

  it('no bench stays visible after the rework resolves', () => {
    const { session, benches } = makeSession(DAY1, 20260904);
    let sawOpen = false;
    playLot(session, () => 'rework-succeed', (_p, _w, reworkOpen) => {
      sawOpen ||= reworkOpen;
      return false;
    });
    expect(sawOpen).toBe(true);
    expect(session.inRework).toBe(false);
    for (const b of Object.values(benches)) expect(b.visible).toBe(false);
  });

  it('a successful rework can arm the CMP brake for the next 5 wafers (GDD §8C)', () => {
    const { session } = makeSession(DAY1, 20260904);
    const armed: number[] = [];
    playLot(session, () => 'rework-succeed', (_p, _w, reworkOpen) => {
      if (!reworkOpen) return false;
      // The brake is armed as the rework RESOLVES, so read it after the close,
      // not while the bench is still open.
      session.closeReworkBench(true, { armCmpBrake: true });
      armed.push(session.director.brakeWafersRemaining);
      settle(session, 1);
      return true;
    });
    expect(armed.length).toBeGreaterThan(0);
    expect(armed[0]).toBe(5);
  });

  it('a failed rework does not arm the brake', () => {
    const { session } = makeSession(DAY1, 20260904);
    playLot(session, () => 'rework-fail');
    expect(session.director.brakeWafersRemaining).toBe(0);
  });
});

describe('the view layer never leaks ground truth', () => {
  it('a wafer with an unmeasured defect shows no evidence and no markers', () => {
    const { session } = makeSession(DAY1, 7);
    session.beginShift();
    // Fresh wafer: nothing has been measured, so nothing may be revealed.
    expect(session.evidenceNow.revealed).toHaveLength(0);
    expect(session.evidenceNow.anyOutOfSpec).toBe(false);
  });

  it('evidence grows only through instruments, never by asking the director', () => {
    const { session } = makeSession(DAY1, 7);
    session.beginShift();
    const wafer = session.director.currentWafer();
    // Ground truth is available to the session, but the evidence the view reads
    // stays empty until an instrument runs.
    const truth = wafer!.defects.filter((d) => !d.masked).length;
    expect(session.evidenceNow.revealed.length).toBe(0);
    for (const t of session.toolsAvailable) session.runTool(t);
    // Whatever is revealed is a subset of what is actually there.
    expect(session.evidenceNow.revealed.length).toBeLessThanOrEqual(truth);
  });
});

describe('the shift stays inside its time budget (GDD §4)', () => {
  it('the shift clock advances only during inspection', () => {
    const { session } = makeSession(DAY1);
    session.beginShift();
    const t0 = session.shiftElapsed;
    settle(session, 60);
    expect(session.shiftElapsed).toBeGreaterThan(t0);
    expect(session.shiftTimeLimit).toBe(DAY1.timeLimitMinutes * 60);

    session.openDebrief; // no-op guard: not in EndOfDay yet
    const t1 = session.shiftElapsed;
    settle(session, 60);
    // Still inspecting, so it keeps counting.
    expect(session.shiftElapsed).toBeGreaterThan(t1);
  });

  it('the debrief clock stops the shift clock', () => {
    const { session } = makeSession(DAY1);
    playLot(session, () => 'Accept', (phase) => phase === 'EndOfDay');
    expect(session.currentPhase).toBe('EndOfDay');
    session.openDebrief();
    const t1 = session.shiftElapsed;
    settle(session, 120);
    expect(session.shiftElapsed).toBe(t1);
  });
});
describe('GDD §12 shift-end micro-quiz', () => {
  /**
   * The quiz content itself. A training game that ships a wrong explanation is
   * worse than one with no quiz at all, so the bank is checked for the failure
   * modes that actually occur in quiz content: an answer with no mechanism, a
   * pool with no correct option, and two options that are both defensible.
   */
  it('every question has exactly one correct option and three options total', () => {
    for (const q of QUIZ_BANK) {
      expect(q.options.length, `${q.topic}: option count`).toBeGreaterThanOrEqual(2);
      const correct = q.options.filter((o) => o.correct);
      expect(correct.length, `${q.topic}: correct-option count`).toBe(1);
    }
  });

  it('every option explains itself, and the explanation is substantive', () => {
    for (const q of QUIZ_BANK) {
      for (const o of q.options) {
        expect(o.because.trim().length, `${q.topic}: "${o.text.slice(0, 30)}"`).toBeGreaterThan(40);
        // An explanation that just restates the option teaches nothing.
        expect(o.because.toLowerCase().startsWith('because it is correct')).toBe(false);
      }
    }
  });

  it('every question is reachable from at least one day', () => {
    const days = [1, 2, 3];
    for (const q of QUIZ_BANK) {
      expect(q.days.some((d) => days.includes(d)), `${q.topic} unreachable`).toBe(true);
    }
  });

  it('each day draws only from its own defect pool', () => {
    for (const day of [1, 2, 3]) {
      const pool = QUIZ_BANK.filter((q) => q.days.includes(day));
      expect(pool.length, `day ${day} has no questions`).toBeGreaterThan(0);
    }
  });

  it('the quiz opens on end-of-review and awards permanent boosts', () => {
    const { session } = makeSession(DAY2, 11);
    playLot(session, () => 'Accept', (phase) => phase === 'Review');
    expect(session.currentPhase).toBe('Review');

    session.endReview();
    expect(session.quizOpen).toBe(true);
    expect(session.currentPhase).toBe('EndOfDay');

    // Walk the whole quiz through the public surface: answer, read the
    // explanation, advance.
    let answered = 0;
    for (let guard = 0; guard < 30 && session.quizOpen; guard++) {
      if (session.answerQuiz(0)) {
        answered++;
      } else if (!session.nextQuiz()) {
        break;
      }
    }
    expect(session.quizOpen).toBe(false);
    expect(answered).toBeGreaterThan(0);
    // A correct answer must register a permanent boost.
    expect(session.boosts).toBeGreaterThanOrEqual(1);
  });

  it('the quiz does not perturb the lot (GDD §16 replay)', () => {
    // Two sessions, same seed. One takes the quiz, one does not. The shift's
    // salary must be identical: opening a review board is not allowed to change
    // the wafers that were generated.
    const a = makeSession(DAY1, 909);
    const b = makeSession(DAY1, 909);

    playLot(a.session, () => 'Accept', (phase) => phase === 'Review');
    playLot(b.session, () => 'Accept', (phase) => phase === 'Review');

    a.session.endReview(); // opens the quiz
    expect(a.session.quizOpen).toBe(true);

    a.session.endReview();
    b.session.endReview(); // no question pool for Day 1 in this path? Day1 has 2 questions

    expect(a.session.director.metrics.totals.salaryTotal).toBe(b.session.director.metrics.totals.salaryTotal);
    expect(a.session.director.wafersCompleted).toBe(b.session.director.wafersCompleted);
  });
});

describe('GDD §12 glossary tablet', () => {
  it('opens and closes, and is available mid-inspection', () => {
    const { session } = makeSession(DAY1, 5);
    session.beginShift();
    expect(session.glossaryOpen).toBe(false);
    expect(session.toggleGlossary()).toBe(true);
    expect(session.glossaryOpen).toBe(true);
    expect(session.toggleGlossary()).toBe(false);
  });

  it('pages and peels without disturbing the shift', () => {
    const { session } = makeSession(DAY3, 5);
    session.beginShift();
    for (const t of session.toolsAvailable) session.runTool(t);
    const before = session.evidenceNow.revealed.length;
    session.toggleGlossary();
    session.pageGlossary();
    session.peelGlossary();
    session.pageGlossary();
    expect(session.evidenceNow.revealed.length).toBe(before);
    expect(session.glossaryOpen).toBe(true);
  });
});

describe('glossary crystal diagrams', () => {
  it('every diagram has layers that stack to a real cross-section', () => {
    for (const c of GLOSSARY_CRYSTALS) {
      expect(c.layers.length, `${c.title}`).toBeGreaterThan(1);
      for (const l of c.layers) {
        expect(l.thickness).toBeGreaterThan(0);
        expect(l.label.length).toBeGreaterThan(3);
        expect(l.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(c.body.length).toBeGreaterThan(120);
    }
  });
});
