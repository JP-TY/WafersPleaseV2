/**
 * The playable shift (GDD §5 core loop).
 *
 * Wires the simulation in `@wafers/sim` to the diegetic workspace in
 * `src/inspection/`. The division is deliberate and is the point of the whole
 * port:
 *
 *   `packages/sim` decides what is true. It never imports Babylon.
 *   `apps/web`   draws what the player sees. It never decides what is true.
 *
 * So the wafer stage is redrawn from `reading.resolved`, never from
 * `wafer.defects`. The simulation can be played headlessly (216 tests do exactly
 * that), and the view layer cannot leak information the simulation did not hand
 * it.
 *
 * The player's loop:
 *   1. Read the traveler for the lot's routing step and today's rules.
 *   2. Run instruments (hotkeys 1-5, or click an instrument screen). Each one
 *      costs latency and may be physically incapable of seeing the defect.
 *   3. Decide from the evidence you actually have.
 *   4. Press a physical stamp. Accept / Reject / Rework.
 *   5. A Rework stamp opens the matching minigame bench. Survive or scrap.
 *   6. The wafer clears; the next one arrives. Clear the lot, then the debrief.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';

import {
  Campaign,
  ShiftDirector,
  measure,
  addReading,
  EMPTY_EVIDENCE,
  TOOL_SPECS,
  type CampaignConfig,
  type PlayerAction,
  type WaferEvidence,
} from '@wafers/sim';
import { Rng } from '@wafers/sim';
import type { DefectProfile, ToolType } from '@wafers/data';

import { WaferStage } from './wafer-stage.js';
import { TravelerView } from './traveler-view.js';
import { ClusterView } from './cluster-view.js';
import { StampBank } from './stamp-bank.js';
import { BriefingView, DebriefView } from './boards.js';
import { QuizBoard, GlossaryTablet, type QuizQuestion } from './scaffolding.js';
import { ProgressionBoard } from './progression-view.js';
import { matte } from '../scene.js';

export interface ShiftConfig extends CampaignConfig {}

export type ShiftPhase =
  | 'Progression'
  | 'Briefing'
  | 'Inspection'
  | 'Break'
  | 'Review'
  | 'EndOfDay'
  | 'Debrief'
  | 'Complete';

/** Rework benches, opened when the player stamps Rework. */
export interface ReworkBenchHandle {
  setVisible(visible: boolean): void;
  update(dt: number): void;
  /**
   * Frame the bench. Optional so a test double need not provide it.
   *
   * Each bench owns this because the camera limits in use for the room-wide
   * inspection view clamp a close bench view back out to 0.8 m — every attempt
   * to move in closer was silently reverted, which is what made the first 3D RCA
   * attempt impossible to frame.
   */
  frameCamera?(camera: import('@babylonjs/core/Cameras/arcRotateCamera.js').ArcRotateCamera): void;
}

const HOTKEY_TOOLS: ReadonlyArray<readonly [string, ToolType]> = [
  ['1', 'StylusProfilometer'],
  ['2', 'FourPointProbe'],
  ['3', 'SpectroscopicEllipsometry'],
  ['4', 'XRayRefractometry'],
  ['5', 'ElectronMicroscope'],
];

/** Minimum dwell on the debrief board before it can be dismissed. */
const DEBRIEF_READ_SECONDS = 3;

/** GDD §5: a periodic break roughly every third wafer. */
const BREAK_EVERY = 3;

/** Ink colour for each stamp, matching the rubber die it is pressed with. */
function stampColor(action: PlayerAction): string {
  return action === 'Accept' ? '#2f9d5c' : action === 'Reject' ? '#c0392b' : '#c08a1e';
}

export class ShiftSession {
  /**
   * The campaign, not a single shift.
   *
   * GDD §9 is a three-day progression with cross-day state, so the session owns a
   * `Campaign` and swaps the director when the day changes. `director` is
   * recreated per day, which is why it is not a readonly field any more.
   */
  private _campaign: Campaign;
  director!: ShiftDirector;

  private readonly stage: WaferStage;
  private readonly traveler: TravelerView;
  private readonly cluster: ClusterView;
  private readonly stamps: StampBank;
  private readonly briefing: BriefingView;
  private readonly debrief: DebriefView;
  private readonly quiz: QuizBoard;
  private readonly glossary: GlossaryTablet;
  readonly progression: ProgressionBoard;
  /**
   * Permanent competency boosts earned from the GDD §12 shift-end quiz.
   * Accumulated across days, never spent — the GDD calls them "permanent
   * competency rating boosts", so they must survive a shift boundary.
   */
  private competencyBoosts = 0;
  private readonly crossDial: { mesh: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh };

  /** Tools available today (GDD §9 gates the roster per day). */
  private availableTools: readonly ToolType[] = [];
  private readonly allDefects: readonly DefectProfile[] = [];

  /** The wafer under inspection, and the evidence gathered on it. */
  private currentWaferIndex = -1;
  private evidence: WaferEvidence = EMPTY_EVIDENCE;
  private toolsRunThisWafer: ToolType[] = [];
  private waferStartTime = 0;

  private readonly quizRng: Rng;
  private phase: ShiftPhase = 'Briefing';
  /** Wafer presented during a break, held back until the player resumes. */
  private pendingWafer: import('@wafers/sim').WaferPresentation | null = null;
  private elapsedSeconds = 0;
  private debriefTimer = 0;
  private shiftSeconds = 0;

  /** Which rework bench to open, if any, and whether it is open. */
  private pendingReworkDefect: string | null = null;
  private reworkBench: ReworkBenchHandle | null = null;

  /** Set by the owner so the HUD can report state; not used for logic. */
  onStateChange: () => void = () => {};
  /** Fired when the campaign's day or pass/fail state changes. */
  onProgressionChange: () => void = () => {};
  /** Fired after a rework bench closes, so the caller can restore the station view. */
  onStationRestore: () => void = () => {};

  /**
   * Which surface currently owns the camera.
   *
   * `onStateChange` fires for every phase change, and main.ts reframes the room
   * on each one. That silently undid `bench.frameCamera()` — the bench framed
   * the camera and the very next state change snapped it back to the room view,
   * which is why an open bench kept rendering as a distant, unreadable smudge.
   * While a bench owns the view, state changes must leave the camera alone.
   */
  private viewOwner: 'station' | 'bench' = 'station';

  /** True while a bench holds the screen and the station must stay hidden. */
  private stationSuppressed = false;

  /**
   * Put the session into (or out of) bench-only view.
   *
   * Used by the `?station=` mounts, which need the same treatment a real rework
   * gets: station down, stamps disabled, camera handed to the bench.
   */
  enterBenchView(active: boolean): void {
    this.setStationVisible(!active);
    this.stamps.setEnabled(!active && !this.reworkBench);
    this.viewOwner = active ? 'bench' : 'station';
    this.onBenchViewChange(active);
  }

  /** True when a rework bench, rather than the inspection station, is on screen. */
  get benchOwnsView(): boolean {
    return this.viewOwner === 'bench';
  }

  /**
   * Notified when a bench takes or releases the screen.
   *
   * Used by the presentation layer to move the operator body out of the way. Kept
   * as a callback rather than a direct reference so the session still has no idea
   * that a body exists.
   */
  onBenchViewChange: (active: boolean) => void = () => {};

  /** Whether the wafer stage is currently on screen. Exposed for tests. */
  get stageVisible(): boolean {
    return this.stage.isVisible;
  }

  /** Hand the camera to a surface. main.ts uses this for `?station=` mounts. */
  setViewOwner(owner: 'station' | 'bench'): void {
    this.viewOwner = owner;
  }

  constructor(
    scene: Scene,
    cfg: ShiftConfig,
    reworkBenches: Record<string, ReworkBenchHandle>,
    /** The active camera, so a bench can frame itself when it opens. */
    private readonly camera?: import('@babylonjs/core/Cameras/arcRotateCamera.js').ArcRotateCamera,
  ) {
    this.allDefects = cfg.defects;

    this._campaign = new Campaign(cfg);

    // Forked off the campaign seed, NOT shared with any lot. Drawing quiz
    // questions must not perturb the metrology rolls, or taking the quiz would
    // change the wafers and break GDD §16 replay.
    this.quizRng = new Rng(cfg.seed ^ 0x5eed);

    this.stage = new WaferStage(scene);
    this.traveler = new TravelerView(scene);
    this.cluster = new ClusterView(scene);
    this.stamps = new StampBank(scene);
    this.briefing = new BriefingView(scene);
    this.debrief = new DebriefView(scene);
    this.quiz = new QuizBoard(scene);
    this.progression = new ProgressionBoard(scene);
    this.glossary = new GlossaryTablet(scene);
    this.quiz.onAnswer = (_r, pool) => {
      this.competencyBoosts = pool;
      this.onStateChange();
    };
    this.crossDial = { mesh: this.buildCrossDial(scene) };

    // Bind the views to the campaign's current day. This has to happen AFTER the
    // views are constructed: `beginDay` feeds the traveler and the briefing board,
    // so calling it first dereferences fields that do not exist yet.
    this.beginDay(this._campaign);

    // GDD §4: hotkeys 1-4 for metrology mode switching. Hotkeys are handled on
    // the document rather than the canvas so they work regardless of focus.
    window.addEventListener('keydown', (e) => this.onKey(e));

    // Stamp presses come from the physical heads; clicking one commits a stamp.
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERUP) return;
      this.tryStampFrom(scene);
    });

    this.applyPhaseVisibility();
    this.onStateChange();
  }

  // -------------------------------------------------------------------------
  // Workspace
  // -------------------------------------------------------------------------

  /** The cross-illumination dial the GDD §13 workspace calls for. */
  private buildCrossDial(scene: Scene): import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh {
    const dial = CreateBox('cross-dial', { width: 0.09, height: 0.09, depth: 0.03 }, scene);
    dial.position = new Vector3(0.62, 1.14, 0.24);
    dial.rotation.x = Math.PI / 2.6;
    dial.material = matte(scene, 'cross-dial-mat', new Color3(0.3, 0.32, 0.36), 0.4);
    // A pointer line on the dial face, so its rotation reads as the light angle.
    const needle = CreateBox('cross-dial-needle', { width: 0.07, height: 0.004, depth: 0.004 }, scene);
    needle.parent = dial;
    needle.position = new Vector3(0, 0, -0.018);
    needle.material = matte(scene, 'cross-dial-needle-mat', new Color3(0.85, 0.88, 0.92), 0.5);
    return dial;
  }

  // -------------------------------------------------------------------------
  // Shift control
  // -------------------------------------------------------------------------

  /**
   * Point the session at a campaign day: fresh director, fresh roster, fresh
   * traveler context. Called on construction and on every day change.
   */
  private beginDay(campaign: Campaign): void {
    // `ruleMatrix` is the single matrix for this day, resolved by the campaign.
    this._campaign = campaign;
    this.director = campaign.createDirector();
    this.competencyBoosts = campaign.boosts;
    this.availableTools = [...campaign.day.availableTools];
    this.traveler.setShiftContext(campaign.day, campaign.ruleMatrix, this.allDefects);
    this.briefing.setDay(campaign.day);
    this.phase = 'Briefing';
    this.currentWaferIndex = -1;
    this.evidence = EMPTY_EVIDENCE;
    this.toolsRunThisWafer = [];
    this.shiftSeconds = 0;
  }

  /**
   * GDD §9: finish the day, bank the boosts, and move to the next.
   *
   * `recordDay` is where the pass decision and the boost banking happen, so it
   * must run BEFORE `advance` — otherwise the boosts land against the wrong day.
   */
  completeDay(): { passed: boolean; dayNumber: number } | null {
    if (this.phase !== 'Debrief' && this.phase !== 'Complete' && this.phase !== 'EndOfDay') return null;
    // The session banks quiz boosts locally as they are earned, so the boost
    // total has to be handed to the campaign here or it never crosses the day
    // boundary and Day 2 starts with nothing.
    const rec = this.campaign.recordDay(this.director, this.competencyBoosts);
    this.phase = 'Progression';
    this.applyPhaseVisibility();
    this.onProgressionChange();
    this.onStateChange();
    return { passed: rec.passed, dayNumber: rec.dayNumber };
  }

  /** Show the progression board between days. */
  showProgression(showResults = false): void {
    this.progression.setCampaign(this.campaign, showResults);
    this.progression.setVisible(true);
    this.onStateChange();
  }

  /** The current campaign. Read-only: use `nextDay` / `retryDay` / `skipToDay`. */
  get campaign(): Campaign {
    return this._campaign;
  }

  /** GDD §9: move to the next unlocked day. */
  nextDay(): void {
    this.beginDay(this._campaign.advance());
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /**
   * Jump to a specific day without requiring the earlier ones to be passed.
   *
   * Used by `?day=N` and by the tests. Not the same as `nextDay`: it deliberately
   * ignores the unlock chain, so it must stay a development and inspection
   * affordance rather than something the progression offers mid-run.
   */
  skipToDay(dayNumber: number): void {
    let c = new Campaign(this._campaign.config, Math.max(1, Math.min(dayNumber, 3)));
    this.beginDay(c);
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /** GDD §9: replay the day just failed. */
  retryDay(): void {
    this.beginDay(this._campaign.retry());
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /** Leave the briefing board and start inspection. GDD §5 phase 1 -> 2. */
  beginShift(): void {
    this.director.beginShift();
    this.phase = 'Inspection';
    this.shiftSeconds = 0;
    this.applyPhaseVisibility();
    this.nextWafer();
    this.onStateChange();
  }

  /** Advance from EndOfDay to the incident printer. GDD §5 phase 5 -> 6. */
  openDebrief(): void {
    if (this.phase !== 'EndOfDay') return;
    this.phase = 'Debrief';
    this.debriefTimer = 0;
    this.debrief.setReport(this.director.completeShift().debrief);
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /**
   * Bank the finished day and put up the progression board.
   *
   * Separate from `completeDay` so the caller can run the shift-end quiz first —
   * the boosts must be earned before the day is recorded, because `recordDay` is
   * what banks them against the correct day.
   */
  finishDay(): { passed: boolean; dayNumber: number } | null {
    // The quiz may still be up — it is administered during Review, and a player
    // can file the record without dismissing it. Take it down first or it draws
    // over the progression board.
    this.quiz.close();
    const result = this.completeDay();
    if (result) this.showProgression(true);
    return result;
  }

  /**
   * Advance the GDD §5 phase machine and bring in the next wafer.
   *
   * Break is PERIODIC within a shift, not the end of it: a GDD §5 shift is
   * "per-wafer inspection -> periodic Break -> end-of-shift review". Treating
   * the exhausted lot as the break left the player on a "NEXT WAFER" button with
   * no wafers left, which is a dead end. So the lot running out goes to Review,
   * and Break fires on a cadence part-way through.
   */
  private nextWafer(): void {
    const p = this.director.presentNextWafer();
    if (!p) {
      // Lot exhausted. GDD §5 puts a review between per-wafer inspection and the
      // end-of-day handover, so the shift goes to Review first; endReview() then
      // moves it on. Jumping straight to EndOfDay skipped a phase the GDD names.
      this.phase = 'Review';
      this.applyPhaseVisibility();
      this.onStateChange();
      return;
    }

    // Periodic break, every `BREAK_EVERY` wafers, never on the last one (the
    // end-of-shift board is the right place to stop).
    const done = this.director.wafersCompleted;
    if (done > 0 && done % BREAK_EVERY === 0 && p.index + 1 < this.director.totalWafers) {
      this.pendingWafer = p;
      this.phase = 'Break';
      this.applyPhaseVisibility();
      this.onStateChange();
      return;
    }
    this.currentWaferIndex = p.index;
    this.evidence = EMPTY_EVIDENCE;
    this.toolsRunThisWafer = [];
    this.waferStartTime = this.shiftSeconds;
    this.stage.clear();
    this.cluster.resetForNewWafer([]);
    this.traveler.setWafer(p.index, p.totalWafers, p.routingStep);
    this.traveler.setPhase('Inspection');
    this.onStateChange();
  }

  /**
   * Resume from the periodic break.
   *
   * `presentNextWafer` has already advanced the director, so the wafer that was
   * held back is simply displayed rather than re-requested.
   */
  resumeFromBreak(): void {
    if (this.phase !== 'Break') return;
    this.phase = 'Inspection';
    if (this.pendingWafer) {
      const p = this.pendingWafer;
      this.pendingWafer = null;
      this.currentWaferIndex = p.index;
      this.evidence = EMPTY_EVIDENCE;
      this.toolsRunThisWafer = [];
      this.waferStartTime = this.shiftSeconds;
      this.stage.clear();
      this.cluster.resetForNewWafer([]);
      this.traveler.setWafer(p.index, p.totalWafers, p.routingStep);
      this.traveler.setPhase('Inspection');
    }
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /** GDD §5: the periodic rest is a bench, not a modal. */
  takeBreak(): void {
    if (this.phase !== 'Inspection') return;
    this.phase = 'Review';
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /**
   * GDD §5: Review -> EndOfDay.
   *
   * Opens the §12 shift-end micro-quiz on the way through. It is offered rather
   * than forced: the GDD says "optional", and forcing it would punish a player
   * who just wants to finish the shift. It sits between review and end-of-day
   * because that is where a supervisor would administer it.
   */
  endReview(): void {
    if (this.phase !== 'Review') return;
    this.quiz.open(this._campaign.day, this.quizRng, 3);
    this.phase = 'EndOfDay';
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /** Dismiss the quiz board. */
  closeQuiz(): void {
    this.quiz.close();
    this.applyPhaseVisibility();
    this.onStateChange();
  }

  /**
   * Pick a quiz option. Returns false when no quiz is open or the current
   * question was already answered.
   */
  answerQuiz(optionIndex: number): boolean {
    if (!this.quiz.isOpen) return false;
    const ok = this.quiz.choose(optionIndex);
    if (ok) this.onStateChange();
    return ok;
  }

  /**
   * Move past the explanation. Returns true while the quiz is still running, so
   * the caller can keep clicking without re-querying.
   */
  nextQuiz(): boolean {
    if (!this.quiz.isOpen) return false;
    const more = this.quiz.advance();
    if (!more) {
      this.applyPhaseVisibility();
      this.onStateChange();
    }
    return more;
  }

  get quizOpen(): boolean {
    return this.quiz.isOpen;
  }

  /** True when a question is answered and waiting to be dismissed. */
  get quizAwaitingAdvance(): boolean {
    return this.quiz.awaitingAdvance;
  }

  /** The question currently on the board, for inspection and for tests. */
  get currentQuestion(): QuizQuestion | null {
    return this.quiz.currentQuestion;
  }

  get boosts(): number {
    return this.competencyBoosts;
  }

  /**
   * The GDD §12 glossary tablet, toggled with G.
   *
   * Available during Inspection because that is when a player actually needs it:
   * mid-wafer, deciding whether a reading makes sense. Reference material opened
   * only at the end of a shift is no use.
   */
  toggleGlossary(): boolean {
    this.glossary.setVisible(!this.glossary.isOpen);
    return this.glossary.isOpen;
  }

  get glossaryOpen(): boolean {
    return this.glossary.isOpen;
  }

  /** Cycle the tablet's cross-section diagram. */
  pageGlossary(): void {
    if (this.glossary.isOpen) this.glossary.next();
  }

  /** Peel one layer off the current cross-section. */
  peelGlossary(): void {
    if (this.glossary.isOpen) this.glossary.peel();
  }

  // -------------------------------------------------------------------------
  // Metrology
  // -------------------------------------------------------------------------

  /**
   * Run one instrument on the wafer in front of the player.
   *
   * Returns false for a tool that is not on today's roster — the roster is the
   * GDD §9 progression, not a convenience filter, so an off-roster instrument is
   * unavailable rather than merely discouraged.
   */
  runTool(tool: ToolType): boolean {
    if (this.phase !== 'Inspection') return false;
    if (this.reworkBench) return false;
    if (!this.availableTools.includes(tool)) return false;
    if (this.currentWaferIndex < 0) return false;
    if (this.toolsRunThisWafer.includes(tool)) return false;

    const wafer = this.director.currentWafer();
    if (!wafer) return false;

    const reading = measure(wafer, tool);
    this.evidence = addReading(this.evidence, reading);
    this.toolsRunThisWafer.push(tool);
    this.cluster.setReading(reading);
    // The stage only ever learns what an instrument resolved.
    this.stage.setRevealed(this.evidence.revealed);
    this.cluster.resetForNewWafer(this.toolsRunThisWafer);

    // GDD §12: scaffolded context callouts, fading by Day 3. The callout is
    // allowed to name the finding once an instrument has actually reported it —
    // that is the Day 1 affordance. It must never name a defect the player has
    // not measured.
    this.emitCallout(reading.tool);
    this.onStateChange();
    return true;
  }

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    const hit = HOTKEY_TOOLS.find(([k]) => k === e.key);
    if (hit) {
      e.preventDefault();
      this.runTool(hit[1]);
      return;
    }
    // Stamp hotkeys for keyboard-only play. The physical stamps remain the
    // primary interaction (GDD §4 "mechanical mouse clicks"), these are the
    // accessibility path.
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      this.toggleGlossary();
      return;
    }
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this.pageGlossary();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      this.peelGlossary();
      return;
    }
    if (e.key === 'Escape') {
      if (this.quizOpen) {
        e.preventDefault();
        this.closeQuiz();
      } else if (this.glossaryOpen) {
        e.preventDefault();
        this.toggleGlossary();
      }
      return;
    }
    const stamp: Record<string, PlayerAction> = { a: 'Accept', r: 'Reject', w: 'Rework' };
    const act = stamp[e.key.toLowerCase()];
    if (act) {
      e.preventDefault();
      this.commitStamp(act);
    }
  }

  // -------------------------------------------------------------------------
  // Disposition
  // -------------------------------------------------------------------------

  private tryStampFrom(scene: Scene): void {
    for (const { mesh, action } of this.stamps.pickables()) {
      const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === mesh);
      if (pick?.hit) {
        this.commitStamp(action);
        return;
      }
    }
  }

  /** Fire a stamp if the shift state allows it. */
  commitStamp(action: PlayerAction): boolean {
    if (this.phase !== 'Inspection') return false;
    if (this.reworkBench) return false;
    if (this.currentWaferIndex < 0) return false;
    if (!this.stamps.press(action)) return false;

    const duration = this.shiftSeconds - this.waferStartTime;
    const result = this.director.stampWafer(action, this.toolsRunThisWafer, duration);

    // Feedback on the traveler, in the stamp's own colour — the paper carries
    // the imprint so the player can see the lot's routing history.
    this.traveler.setStamp(action.toUpperCase(), stampColor(action));

    if (result.needsRework) {
      this.pendingReworkDefect = result.reworkDefectType;
      this.openReworkBench(this.pendingReworkDefect);
    } else {
      this.advance();
    }
    this.onStateChange();
    return true;
  }

  /**
   * Route the wafer downstream and bring in the next one.
   *
   * GDD §5's slide-into-track is literal: the outcome determines which physical
   * tray the wafer sits in, so a scrap pile is visible during the shift rather
   * than only on the debrief sheet.
   */
  private advance(): void {
    this.currentWaferIndex = -1;
    this.stage.clear();
    this.nextWafer();
  }

  // -------------------------------------------------------------------------
  // Rework benches
  // -------------------------------------------------------------------------

  /** Map a defect type to the GDD §8 bench that can fix it. */
  private benchFor(defectType: string | null): ReworkBenchHandle | null {
    switch (defectType) {
      case 'SubstrateContamination':
        return this.reworkBenchByName('rca');
      case 'SilicideBridging':
        return this.reworkBenchByName('silicide');
      case 'STIVoid':
        // §8C: the CMP endpoint calibration is what protects against STI voids,
        // and a successful calibration arms the safety brake.
        return this.reworkBenchByName('cmp');
      default:
        return null;
    }
  }

  private benches: Record<string, ReworkBenchHandle> = {};

  setReworkBenches(benches: Record<string, ReworkBenchHandle>): void {
    this.benches = benches;
  }

  private reworkBenchByName(name: string): ReworkBenchHandle | null {
    return this.benches[name] ?? null;
  }

  private openReworkBench(defectType: string | null): void {
    const bench = this.benchFor(defectType);
    if (!bench) {
      // No bench can service this defect. That is a legitimate outcome (GDD §7
      // says STI voids are "cannot be chemically extracted"), so the wafer is
      // simply stamped and routed.
      this.advance();
      return;
    }
    this.reworkBench = bench;
    bench.setVisible(true);
    this.stamps.setEnabled(false);
    this.setStationVisible(false);
    this.viewOwner = 'bench';
    this.onStateChange();
    this.onBenchViewChange(true);
    if (bench.frameCamera && this.camera) bench.frameCamera(this.camera);
  }

  /**
   * Close the rework bench and report its result.
   *
   * GDD §8 makes each minigame's failure destructive, so the director has to be
   * told the truth: success salvages the wafer and can arm the CMP safety brake
   * (§8C, next 5 wafers), failure scraps it.
   */
  closeReworkBench(success: boolean, options?: { armCmpBrake?: boolean }): void {
    if (!this.reworkBench) return;
    this.reworkBench.setVisible(false);
    this.reworkBench = null;
    this.stamps.setEnabled(true);
    this.setStationVisible(true);
    this.viewOwner = 'station';
    this.onBenchViewChange(false);
    // Hand the camera back to the station's working view.
    this.onStationRestore?.();

    if (this.currentWaferIndex >= 0) {
      this.director.resolveRework(this.currentWaferIndex, { success, quality: success ? 0.9 : 0 });
      if (success && options?.armCmpBrake) this.director.applyCmpBrake(5);
      this.traveler.setStamp(success ? 'REWORKED' : 'SCRAPPED', success ? '#2f9d5c' : '#c0392b');
    }
    this.pendingReworkDefect = null;
    this.advance();
    this.onStateChange();
  }

  // -------------------------------------------------------------------------
  // Callouts (GDD §12)
  // -------------------------------------------------------------------------

  /**
   * Track which defect classes have already been called out.
   *
   * `FirstOccurrencePerDefectClass` is not a per-wafer flag: once the player has
   * been told what a void looks like, they should keep having to spot it. The
   * GDD's progression is about withdrawing help, not about repeating the same
   * hint forever.
   */
  private readonly calloutSeen = new Set<string>();

  private emitCallout(tool: ToolType): void {
    const mode = this.director.day.calloutMode;
    if (mode === 'Disabled') return;
    for (const d of this.evidence.revealed) {
      const key = d.defectClass;
      if (mode === 'FirstOccurrencePerDefectClass') {
        if (this.calloutSeen.has(key)) continue;
        this.calloutSeen.add(key);
      }
      this.lastCallout = this.calloutFor(d.defectType, tool);
      this.calloutTimer = 7;
      return;
    }
  }

  private lastCallout: string | null = null;
  private calloutTimer = 0;

  private calloutFor(defectType: string, tool: ToolType): string {
    switch (defectType) {
      case 'BowingWarping':
        return 'Bowing detected: flatness deviation will push the surface beyond high-NA depth-of-focus bounds.';
      case 'SubstrateContamination':
        return 'Sheet-resistance offset: an organic or metallic film is shunting the surface.';
      case 'STIVoid':
        return 'Optical density below limit: the trench isolation fill is incomplete.';
      case 'InterfaceRoughness':
        return 'Sub-nanometre interface scattering: carriers will be trapped at the gate interface.';
      case 'SilicideBridging':
        return 'Conductive metal stringer over the sidewall spacer — this will short gate to source/drain.';
      case 'TungstenPlugVoid':
        return 'Keyhole void in the tungsten core: an open circuit, uncorrectable post-deposition.';
      default:
        return `${TOOL_SPECS[tool].measurand.label} out of limits.`;
    }
  }

  /** The GDD §12 context callout currently showing, or null. */
  get callout(): string | null {
    return this.calloutTimer > 0 && this.phase === 'Inspection' ? this.lastCallout : null;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  /**
   * Show or hide the inspection station as a group.
   *
   * Deliberately not `applyPhaseVisibility`, which also drives the phase boards:
   * a rework takes over the bench without changing phase, so the station has to be
   * switchable independently of it.
   */
  setStationVisible(visible: boolean): void {
    this.stationSuppressed = !visible;
    this.applyStationVisibility(visible);
  }

  private applyStationVisibility(visible: boolean): void {
    this.stage.setVisible(visible);
    this.traveler.setVisible(visible);
    this.cluster.setVisible(visible);
    this.crossDial.mesh.setEnabled(visible);
  }

  private applyPhaseVisibility(): void {
    const inspecting = this.phase === 'Inspection';
    const paperwork =
      this.phase === 'Progression' ||
      this.phase === 'Briefing' ||
      this.phase === 'Debrief' ||
      this.phase === 'Complete';
    this.briefing.setVisible(this.phase === 'Briefing');
    this.debrief.setVisible(this.phase === 'Debrief' || this.phase === 'Complete');
    void paperwork;
    // A bench owns the screen while it is open: the station stays down no matter
    // what the phase machine says, otherwise the metrology rack reappears in
    // front of the bench the moment the phase ticks over.
    const onStage = inspecting && !this.stationSuppressed;
    this.stage.setVisible(onStage);
    this.traveler.setVisible((inspecting || this.phase === 'Break') && !this.stationSuppressed);
    this.cluster.setVisible(onStage);
    // The progression board only belongs on-stage during the Progression phase;
    // the debrief has its own board on the same wall.
    if (this.phase !== 'Progression') this.progression.setVisible(false);
    this.stamps.setVisible((inspecting || this.phase === 'Break') && !this.stationSuppressed);
    this.crossDial.mesh.setEnabled(onStage);
    this.glossary.setVisible(this.glossary.isOpen && onStage);
    // The wafer stage is hidden while paperwork is up, but the cluster rack and
    // traveler must not be left floating with no bench context, so keep the
    // wafer stage visible on Break only.
    void paperwork;
    this.stamps.setEnabled(inspecting && !this.reworkBench && !this.stationSuppressed);
    this.traveler.setPhase(this.phase);
  }

  update(dt: number): void {
    this.elapsedSeconds += dt;
    this.quiz.update();
    this.progression.update();
    this.glossary.setVisible(this.glossary.isOpen && this.phase !== 'Briefing');
    if (this.phase === 'Inspection') {
      this.shiftSeconds += dt;
      // GDD §12 cross-illumination: sweep slowly if the player leaves it alone,
      // so the bow stays legible without forcing anyone to touch the dial.
      this.stage.setCrossAngle(Math.sin(this.elapsedSeconds * 0.22) * 0.5);
    }
    if (this.calloutTimer > 0) this.calloutTimer -= dt;

    if (this.phase !== 'Inspection') this.calloutTimer = 0;

    this.stage.update(dt);
    this.stamps.update(dt);
    this.traveler.update();
    this.cluster.update();
    this.briefing.update();
    this.debrief.update();

    if (this.phase === 'Debrief') {
      this.debriefTimer += dt;
      if (this.debriefTimer > DEBRIEF_READ_SECONDS) this.phase = 'Complete';
    }
  }

  // -------------------------------------------------------------------------
  // Read-only state for the HUD / tests
  // -------------------------------------------------------------------------

  get currentPhase(): ShiftPhase {
    return this.phase;
  }
  get shiftElapsed(): number {
    return this.shiftSeconds;
  }
  get shiftTimeLimit(): number {
    return this.director.day.timeLimitMinutes * 60;
  }
  get waferIndex(): number {
    return this.currentWaferIndex;
  }
  get evidenceNow(): WaferEvidence {
    return this.evidence;
  }
  get toolsAvailable(): readonly ToolType[] {
    return this.availableTools;
  }
  get toolsRun(): readonly ToolType[] {
    return this.toolsRunThisWafer;
  }
  get inRework(): boolean {
    return this.reworkBench !== null;
  }
  get debriefComplete(): boolean {
    return this.phase === 'Complete';
  }
  get salary(): number {
    return this.director.metrics.totals.salaryTotal;
  }
  /** Whether the progression board is currently on the wall. */
  get progressionVisible(): boolean {
    return this.progression.isVisible;
  }

  get dayNumber(): number {
    return this.campaign.dayNumber;
  }
  get certified(): boolean {
    return this.campaign.isCertified;
  }
}