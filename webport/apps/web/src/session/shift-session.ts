/**
 * Shift session — presentation glue over @wafers/sim.
 * Sim decides truth. This module only draws and forwards player intent.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import {
  Campaign,
  EMPTY_EVIDENCE,
  addReading,
  measure,
  recipeFor,
  type PlayerAction,
  type WaferEvidence,
  type WaferPresentation,
} from '@wafers/sim';
import type { ToolType } from '@wafers/data';
import { buildBay, type Bay } from '../bay/bay.js';
import type { BayLighting } from '../bootstrap/lighting.js';
import { frameWorkspace, frameBriefing, frameFoup, frameInspection } from '../bootstrap/engine.js';
import { pickAt } from '../input/pick.js';
import type { AudioApi } from '../audio/sfx.js';
import { RcaBench } from '../rework/rca-bench.js';
import { SilicideBench } from '../rework/silicide-bench.js';
import { CmpBench } from '../rework/cmp-bench.js';
import type { ReworkBenchHandle } from '../rework/types.js';
import { campaignConfigFrom, loadGameConfig, type GameConfig } from './config.js';
import { OnboardingTour, shouldRunOnboarding } from '../bay/onboarding.js';
import { Scaffolding } from '../bay/scaffolding.js';
import { QuizBoard } from '../bay/quiz.js';
import { ProgressionBoard } from '../bay/progression.js';
import { FollowCamera } from '../player/follow-camera.js';
import { dressBayWithProps } from '../content/props.js';

const HOTKEYS: ReadonlyArray<readonly [string, ToolType]> = [
  ['1', 'StylusProfilometer'],
  ['2', 'FourPointProbe'],
  ['3', 'SpectroscopicEllipsometry'],
  ['4', 'XRayRefractometry'],
  ['5', 'ElectronMicroscope'],
];

const BREAK_EVERY = 3;
const FOUP_AUTO_SECONDS = 2.2;
const REWORK_DWELL = 1.6;
const DEBRIEF_DWELL = 2.0;
const QUIZ_ACK_SECONDS = 1.2;

export type UiPhase =
  | 'Progression'
  | 'Onboarding'
  | 'Briefing'
  | 'Inspection'
  | 'AwaitFoup'
  | 'Rework'
  | 'CmpCalib'
  | 'Break'
  | 'Quiz'
  | 'Review'
  | 'EndOfDay'
  | 'Debrief'
  | 'Complete';

export interface HudSnapshot {
  phase: string;
  salary: string;
  wafer: string;
  hint: string;
}

export interface ShiftSessionOptions {
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly seed: number;
  readonly dayNumber: number;
  readonly audio: AudioApi;
  readonly lighting?: BayLighting;
  readonly onHud?: (hud: HudSnapshot) => void;
  readonly loadProps?: boolean;
}

export class ShiftSession {
  readonly bay: Bay;
  readonly config: GameConfig;
  readonly follow: FollowCamera;
  private campaign: Campaign;
  private director;
  private evidence: WaferEvidence = EMPTY_EVIDENCE;
  private toolsUsed = new Set<ToolType>();
  private presentation: WaferPresentation | null = null;
  private uiPhase: UiPhase = 'Briefing';
  private foupArmed = false;
  private foupTimer = 0;
  private wafersSinceBreak = 0;
  private reworkBench: ReworkBenchHandle | null = null;
  private reworkIndex = -1;
  private reworkDwell = 0;
  private debriefTimer = 0;
  private quizTimer = 0;
  private quizBoosts = 0;
  private elapsed = 0;
  private draggingWafer = false;
  private cmpOffered = false;
  private cmpReturnToInspection = false;
  private readonly rca: RcaBench;
  private readonly silicide: SilicideBench;
  private readonly cmp: CmpBench;
  private readonly camera: ArcRotateCamera;
  private readonly audio: AudioApi;
  private readonly onHud?: (hud: HudSnapshot) => void;
  private readonly onboarding: OnboardingTour;
  private readonly scaffolding: Scaffolding;
  private readonly quiz: QuizBoard;
  private readonly progression: ProgressionBoard;
  private stationSuppressed = false;

  constructor(opts: ShiftSessionOptions) {
    this.config = loadGameConfig();
    this.camera = opts.camera;
    this.audio = opts.audio;
    this.onHud = opts.onHud;
    this.follow = FollowCamera.create();

    const day = this.config.days.find((d) => d.dayNumber === opts.dayNumber) ?? this.config.days[0]!;
    this.campaign = new Campaign(campaignConfigFrom(this.config, opts.seed), day.dayNumber);
    this.director = this.campaign.createDirector();

    // Mount the full instrument rack; day roster gates which tools accept input.
    this.bay = buildBay(
      opts.scene,
      [
        'StylusProfilometer',
        'FourPointProbe',
        'SpectroscopicEllipsometry',
        'XRayRefractometry',
        'ElectronMicroscope',
      ],
      opts.lighting,
    );
    this.bay.traveler.configure(this.campaign.day, this.campaign.ruleMatrix);
    this.bay.boards.setBriefing(this.campaign.day.briefingText);
    this.bay.instruments.setDayRoster(this.campaign.day.availableTools, this.campaign.dayNumber);
    this.bay.stage.setPresent(false);

    this.onboarding = new OnboardingTour(opts.scene, this.bay.root);
    this.scaffolding = new Scaffolding(opts.scene, this.bay.root);
    this.scaffolding.setDay(this.campaign.day);
    this.quiz = new QuizBoard(opts.scene, this.bay.root);
    this.progression = new ProgressionBoard(opts.scene, this.bay.root);

    const rng = () => this.campaign.createRng();
    this.rca = new RcaBench(opts.scene, () => rng().fork(9001), recipeFor('RCAClean', this.config.rework));
    this.silicide = new SilicideBench(
      opts.scene,
      () => rng().fork(9002),
      recipeFor('SilicideWetEtch', this.config.rework),
    );
    this.cmp = new CmpBench(opts.scene, () => rng().fork(9003), recipeFor('CMPCalibration', this.config.rework));
    this.rca.setVisible(false);
    this.silicide.setVisible(false);
    this.cmp.setVisible(false);

    this.bindInput(opts.scene);

    if (opts.loadProps !== false) {
      void dressBayWithProps(opts.scene, {
        bayRoot: this.bay.root,
        // Room/Workbench/Wafer stay procedural. Authored GLBs take FOUP + rack silhouettes;
        // load button / tool screens+keys stay procedural interactables.
        hideWhenProp: {
          Foup: this.bay.foup.scenicShells(),
          Inspection: this.bay.instruments.scenicChassis(),
        },
        foupWorld: this.bay.foup.root.position.clone(),
        waferWorld: this.bay.stage.root.position.clone(),
        rackWorld: this.bay.instruments.root.position.clone(),
        travelerWorld: this.bay.traveler.root.position.clone(),
        boardsWorld: this.bay.boards.root.position.clone(),
      }).then((r) => {
        // Park scenic dress during rework (Console/Inspection/Foup/DataSlate/IncidentReport).
        // Workbench GLB is never dressed — procedural deck parks via parkables.
        const park = r.loaded.flatMap((p) => p.meshes);
        this.bay.parkScenicProps(park);
        if (this.stationSuppressed) this.bay.setStationVisible(false);
        if (r.missing.length) console.info('[Wafers Please] GLB missing:', r.missing.join(', '));
        if (r.blended.length) console.info('[Wafers Please] Prop blend:', r.blended.join('; '));
        if (typeof window !== 'undefined') {
          (window as unknown as { __WP_PROP_BLEND?: string }).__WP_PROP_BLEND = r.blended.join('; ');
          (window as unknown as { __WP_PROP_MATS?: typeof r.materials }).__WP_PROP_MATS = r.materials;
        }
      });
    }

    if (shouldRunOnboarding()) {
      this.uiPhase = 'Onboarding';
      this.bay.boards.show('Hidden');
      this.onboarding.start();
      const t = this.onboarding.currentTarget();
      if (t) this.follow.setFocus(t, 1.8);
    } else {
      this.enterBriefing();
    }
    this.refreshHud();
  }

  get phase(): UiPhase {
    return this.uiPhase;
  }

  get shiftDirector() {
    return this.director;
  }

  get campaignState() {
    return this.campaign;
  }

  interactiveMeshes(): AbstractMesh[] {
    return [
      this.bay.boards.beginButton,
      this.bay.boards.resumeButton,
      this.bay.boards.dismissButton,
      this.bay.foup.button,
      ...this.bay.instruments.allScreens(),
      ...this.bay.stamps.allMeshes(),
      this.bay.stage.wafer,
      this.bay.traveler.board,
      this.onboarding.nextBtn,
      this.onboarding.skipBtn,
      ...this.quiz.choiceButtons,
      ...this.progression.dayButtons,
      this.progression.retryBtn,
      this.progression.nextBtn,
    ].filter((m) => m.isEnabled());
  }

  update(dt: number): void {
    this.elapsed += dt;
    this.follow.update(this.camera, dt);
    this.scaffolding.update(dt);
    this.audio.setAmbience(this.uiPhase === 'Rework' || this.uiPhase === 'CmpCalib' ? 0.9 : 0.45);

    if (this.uiPhase === 'Rework' || this.uiPhase === 'CmpCalib') {
      this.reworkBench?.update(dt);
      const req = this.reworkBench?.getCloseRequest?.();
      if (req) {
        if (req.immediate) this.closeReworkOrCalib(req);
        else {
          this.reworkDwell += dt;
          if (this.reworkDwell >= REWORK_DWELL) this.closeReworkOrCalib(req);
        }
      }
    }
    if (this.uiPhase === 'AwaitFoup' && this.foupArmed) {
      this.foupTimer += dt;
      if (this.foupTimer >= FOUP_AUTO_SECONDS) this.loadNextWafer();
    }
    if (this.uiPhase === 'Debrief') this.debriefTimer += dt;
    if (this.uiPhase === 'Quiz' && this.quiz.isFinished) {
      this.quizTimer += dt;
      if (this.quizTimer >= QUIZ_ACK_SECONDS) this.finishAfterQuiz();
    }
  }

  private bindInput(scene: Scene): void {
    scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) {
        this.audio.unlock();
        const mesh = pickAt(scene, scene.pointerX, scene.pointerY);
        if (mesh) this.onPick(mesh);
        if (mesh?.metadata?.interact === 'wafer') this.draggingWafer = true;
      }
      if (info.type === PointerEventTypes.POINTERUP) this.draggingWafer = false;
      if (info.type === PointerEventTypes.POINTERMOVE && this.draggingWafer) {
        const ev = info.event as PointerEvent;
        this.bay.stage.nudgeTilt(ev.movementX, ev.movementY);
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e) => {
        this.audio.unlock();
        if (e.key === 'm' || e.key === 'M') {
          this.audio.setMuted(!this.audio.muted);
          this.refreshHud();
          return;
        }
        if (this.uiPhase !== 'Inspection') return;
        for (const [key, tool] of HOTKEYS) {
          if (e.key === key && this.campaign.day.availableTools.includes(tool)) {
            this.runTool(tool);
            break;
          }
        }
      });
    }
  }

  private onPick(mesh: AbstractMesh): void {
    let cur: AbstractMesh | null = mesh;
    let meta = cur.metadata as {
      interact?: string;
      tool?: ToolType;
      action?: PlayerAction;
      bath?: 'sc1' | 'sc2';
      choice?: number;
      day?: number;
    } | null;
    while (cur && !meta?.interact) {
      cur = cur.parent as AbstractMesh | null;
      meta = cur?.metadata ?? null;
    }

    if (this.uiPhase === 'Rework' || this.uiPhase === 'CmpCalib') {
      const target = cur ?? mesh;
      const kind = target.metadata?.interact as string | undefined;
      if (kind?.startsWith('rca')) this.rca.handlePick(target);
      else if (kind?.startsWith('sil')) this.silicide.handlePick(target);
      else if (kind?.startsWith('cmp')) this.cmp.handlePick(target);
      else {
        this.rca.handlePick(mesh);
        this.silicide.handlePick(mesh);
        this.cmp.handlePick(mesh);
      }
      this.audio.play('click');
      return;
    }

    if (!meta?.interact) return;
    const kind = meta.interact;

    if (kind === 'onboardNext') {
      const done = this.onboarding.next();
      this.audio.play('click');
      if (done) this.enterBriefing();
      else {
        const t = this.onboarding.currentTarget();
        if (t) this.follow.setFocus(t, 1.8);
      }
      return;
    }
    if (kind === 'onboardSkip') {
      this.onboarding.finish();
      this.audio.play('click');
      this.enterBriefing();
      return;
    }
    if (kind === 'quizChoice' && typeof meta.choice === 'number') {
      const before = this.quiz.boostsEarned;
      this.quiz.answer(meta.choice);
      this.audio.play(this.quiz.boostsEarned > before ? 'quizOk' : 'quizMiss');
      this.refreshHud();
      return;
    }
    if (kind === 'progDay' && meta.day) {
      this.skipToDay(meta.day);
      return;
    }
    if (kind === 'progRetry') {
      this.retryDay();
      return;
    }
    if (kind === 'progNext') {
      this.nextDay();
      return;
    }

    switch (kind) {
      case 'begin':
        this.beginShift();
        break;
      case 'resume':
        this.resumeFromBreak();
        break;
      case 'dismiss':
        this.dismissDebrief();
        break;
      case 'foup':
        if (this.uiPhase === 'AwaitFoup') this.loadNextWafer();
        break;
      case 'tool':
        if (meta.tool && this.uiPhase === 'Inspection') this.runTool(meta.tool);
        break;
      case 'stamp':
        if (meta.action && this.uiPhase === 'Inspection') this.stamp(meta.action);
        break;
      default:
        break;
    }
  }

  private enterBriefing(): void {
    this.uiPhase = 'Briefing';
    this.progression.hide();
    this.bay.boards.show('Briefing');
    this.setStationSuppressed(false);
    this.follow.resume(this.camera);
    this.follow.setFocus(new Vector3(-0.1, 1.7, -0.2), 2.55);
    frameBriefing(this.camera);
    this.follow.resync(this.camera);
    this.audio.play('phase');
    this.refreshHud();
  }

  private beginShift(): void {
    if (this.uiPhase !== 'Briefing') return;
    this.bay.boards.flashBegin();
    this.director.beginShift();
    this.audio.play('phase');
    this.audio.play('click');
    this.bay.boards.show('Hidden');
    this.armFoup();
  }

  private armFoup(): void {
    const remaining = this.director.totalWafers - this.director.wafersCompleted;
    if (remaining <= 0) {
      this.enterBreakOrReview();
      return;
    }
    this.uiPhase = 'AwaitFoup';
    this.foupArmed = true;
    this.foupTimer = 0;
    this.cmpOffered = false;
    this.bay.foup.setState(remaining, true);
    this.bay.stage.setPresent(false);
    this.bay.stamps.setArmed(false);
    this.bay.instruments.setFault(false);
    this.bay.traveler.clearImprint();
    this.follow.setFocus(new Vector3(-0.38, 1.18, 0.06), 1.18);
    frameFoup(this.camera);
    this.follow.resync(this.camera);
    this.refreshHud();
  }

  private loadNextWafer(): void {
    if (!this.foupArmed) return;
    this.foupArmed = false;
    this.presentation = this.director.presentNextWafer();
    if (!this.presentation) {
      this.enterBreakOrReview();
      return;
    }
    this.evidence = EMPTY_EVIDENCE;
    this.toolsUsed = new Set();
    this.uiPhase = 'Inspection';
    this.bay.stage.resetTilt();
    this.bay.stage.setPresent(true);
    this.bay.stage.setEvidenceTone(false, false);
    this.bay.stamps.setArmed(true);
    this.bay.foup.setState(this.director.totalWafers - this.presentation.index - 1, false);
    this.bay.traveler.setWafer(this.presentation);
    // Hero closed FOUP window + extracted wafer; stamps stay pickable on the right fringe.
    this.follow.setFocus(new Vector3(-0.36, 1.18, 0.06), 1.2);
    frameInspection(this.camera);
    this.follow.resync(this.camera);
    this.bay.foup.flashLoad();
    this.audio.play('foup');
    this.refreshHud();
  }

  private runTool(tool: ToolType): void {
    const wafer = this.director.currentWafer();
    if (!wafer || this.uiPhase !== 'Inspection') return;
    if (!this.campaign.day.availableTools.includes(tool)) return;

    this.bay.instruments.setRunning(tool, true);
    const reading = measure(wafer, tool);
    this.evidence = addReading(this.evidence, reading);
    this.toolsUsed.add(tool);
    this.bay.instruments.showReading(tool, reading);
    this.bay.stage.setEvidenceTone(this.evidence.anyOutOfSpec, this.evidence.killerRevealed);
    this.scaffolding.onReading(reading);
    this.audio.play('tool');
    if (reading.outOfSpec) this.audio.play('callout');
    const clearRun = () => this.bay.instruments.setRunning(tool, false);
    if (typeof window !== 'undefined') window.setTimeout(clearRun, 180);
    else clearRun();

    // GDD §8C: ellipsometry resolving STI void opens CMP calibration once.
    if (
      !this.cmpOffered &&
      tool === 'SpectroscopicEllipsometry' &&
      reading.resolved.some((d) => d.defectType === 'STIVoid')
    ) {
      this.cmpOffered = true;
      this.openCmpCalibration();
      return;
    }
    this.refreshHud();
  }

  private stamp(action: PlayerAction): void {
    if (this.uiPhase !== 'Inspection' || !this.presentation) return;
    if (!this.bay.stamps.press(action, this.elapsed)) return;

    const result = this.director.stampWafer(action, [...this.toolsUsed]);
    this.bay.traveler.imprintFeedback(result.feedback);
    this.bay.instruments.setFault(!result.feedback.correct);
    this.scaffolding.onStamp(result.feedback);
    this.audio.play(result.feedback.correct ? 'stamp' : 'fault');
    this.bay.stamps.setArmed(false);
    this.wafersSinceBreak += 1;

    if (result.needsRework) {
      this.openRework(this.presentation.index, result.reworkDefectType);
      return;
    }
    this.afterWaferCleared();
  }

  private openRework(index: number, defectType: string | null): void {
    this.uiPhase = 'Rework';
    this.reworkIndex = index;
    this.reworkDwell = 0;
    this.cmpReturnToInspection = false;
    this.bay.boards.show('Hidden');
    this.setStationSuppressed(true);
    this.follow.suspend();

    let bench: ReworkBenchHandle = this.rca;
    if (defectType === 'SilicideBridging') bench = this.silicide;
    else if (defectType === 'STIVoid') bench = this.cmp;
    else bench = this.rca;

    this.rca.setVisible(false);
    this.silicide.setVisible(false);
    this.cmp.setVisible(false);
    bench.prepareFresh?.();
    bench.setVisible(true);
    this.reworkBench = bench;
    bench.frameCamera?.(this.camera);
    this.audio.play('reworkOpen');
    this.refreshHud();
  }

  private openCmpCalibration(): void {
    this.uiPhase = 'CmpCalib';
    this.reworkDwell = 0;
    this.cmpReturnToInspection = true;
    this.bay.boards.show('Hidden');
    this.setStationSuppressed(true);
    this.follow.suspend();
    this.rca.setVisible(false);
    this.silicide.setVisible(false);
    this.cmp.prepareFresh();
    this.cmp.setVisible(true);
    this.reworkBench = this.cmp;
    this.cmp.frameCamera(this.camera);
    this.audio.play('reworkOpen');
    this.refreshHud();
  }

  private closeReworkOrCalib(req: {
    success: boolean;
    armCmpBrake?: boolean;
    brakeWafers?: number;
  }): void {
    const wasCalib = this.uiPhase === 'CmpCalib' || this.cmpReturnToInspection;
    if (this.uiPhase !== 'Rework' && this.uiPhase !== 'CmpCalib') return;

    if (wasCalib) {
      if (req.armCmpBrake && req.success) {
        this.director.applyCmpBrake(req.brakeWafers ?? 5);
      }
      this.audio.play(req.success ? 'reworkOk' : 'reworkFail');
      this.hideBenches();
      this.setStationSuppressed(false);
      this.follow.resume(this.camera);
      frameWorkspace(this.camera);
      // Return to same wafer for Reject stamp (GDD §8C).
      this.uiPhase = 'Inspection';
      this.bay.stamps.setArmed(true);
      this.cmpReturnToInspection = false;
      this.reworkBench = null;
      this.refreshHud();
      return;
    }

    this.director.resolveRework(this.reworkIndex, { success: req.success, quality: req.success ? 1 : 0 });
    this.audio.play(req.success ? 'reworkOk' : 'reworkFail');
    this.hideBenches();
    this.reworkBench = null;
    this.setStationSuppressed(false);
    this.follow.resume(this.camera);
    frameWorkspace(this.camera);
    this.afterWaferCleared();
  }

  private hideBenches(): void {
    this.rca.setVisible(false);
    this.silicide.setVisible(false);
    this.cmp.setVisible(false);
  }

  private afterWaferCleared(): void {
    if (this.director.wafersCompleted >= this.director.totalWafers) {
      this.enterBreakOrReview(true);
      return;
    }
    if (this.wafersSinceBreak >= BREAK_EVERY) {
      this.enterBreak();
      return;
    }
    this.armFoup();
  }

  private enterBreak(): void {
    this.uiPhase = 'Break';
    this.wafersSinceBreak = 0;
    this.bay.boards.show('Break');
    this.bay.stage.setPresent(false);
    this.bay.stamps.setArmed(false);
    this.audio.play('phase');
    this.refreshHud();
  }

  private resumeFromBreak(): void {
    if (this.uiPhase !== 'Break') return;
    this.bay.boards.show('Hidden');
    if (this.director.wafersCompleted >= this.director.totalWafers) this.enterBreakOrReview(true);
    else this.armFoup();
  }

  private enterBreakOrReview(forceEnd = false): void {
    if (!forceEnd && this.wafersSinceBreak >= BREAK_EVERY && this.director.wafersCompleted < this.director.totalWafers) {
      this.enterBreak();
      return;
    }
    try {
      while (this.director.currentPhase === 'Inspection') this.director.advancePhase();
    } catch {
      /* already past */
    }
    if (this.director.currentPhase === 'Break') this.director.advancePhase();
    this.uiPhase = 'Quiz';
    this.quizTimer = 0;
    this.bay.boards.show('Hidden');
    this.quiz.open(this.campaign.dayNumber);
    this.audio.play('phase');
    this.refreshHud();
  }

  private finishAfterQuiz(): void {
    this.quizBoosts = this.quiz.boostsEarned;
    this.quiz.hide();
    this.finishShift();
  }

  private finishShift(): void {
    while (
      this.director.currentPhase !== 'EndOfDay' &&
      this.director.currentPhase !== 'Debrief' &&
      this.director.currentPhase !== 'Complete'
    ) {
      try {
        this.director.advancePhase();
      } catch {
        break;
      }
    }
    const record = this.campaign.recordDay(this.director, this.quizBoosts);
    this.uiPhase = 'Debrief';
    this.debriefTimer = 0;
    this.bay.boards.setDebrief(record.report);
    this.bay.boards.show('Debrief');
    this.audio.play(record.passed ? 'pass' : 'fail');
    this.refreshHud();
  }

  private dismissDebrief(): void {
    if (this.uiPhase !== 'Debrief' || this.debriefTimer < DEBRIEF_DWELL) return;
    this.uiPhase = 'Progression';
    this.bay.boards.show('Hidden');
    this.progression.show(this.campaign);
    this.audio.play('phase');
    this.refreshHud();
  }

  /** Start the next unlocked day. */
  nextDay(): void {
    if (this.campaign.statusOf(this.campaign.dayNumber) !== 'passed') return;
    if (this.campaign.dayNumber >= 3) return;
    this.campaign = this.campaign.advance();
    this.rebindDay();
  }

  retryDay(): void {
    this.campaign = this.campaign.retry();
    this.rebindDay();
  }

  skipToDay(dayNumber: number): void {
    const status = this.campaign.statusOf(dayNumber);
    if (status === 'locked') return;
    this.campaign = new Campaign(
      this.campaign.config,
      dayNumber,
      this.campaign.boosts,
      this.campaign.records,
    );
    this.rebindDay();
  }

  private rebindDay(): void {
    this.director = this.campaign.createDirector();
    this.quizBoosts = 0;
    this.wafersSinceBreak = 0;
    this.presentation = null;
    this.evidence = EMPTY_EVIDENCE;
    this.toolsUsed = new Set();
    this.hideBenches();
    this.progression.hide();
    this.quiz.hide();
    this.scaffolding.setDay(this.campaign.day);
    this.bay.traveler.configure(this.campaign.day, this.campaign.ruleMatrix);
    this.bay.boards.setBriefing(this.campaign.day.briefingText);
    this.bay.instruments.setDayRoster(this.campaign.day.availableTools, this.campaign.dayNumber);
    this.enterBriefing();
  }

  /**
   * §5.2 scripted driver — exercises the same intent path as clicks without
   * bypassing session wiring (no direct ledger edits).
   */
  harness(cmd: HarnessCommand): void {
    switch (cmd.type) {
      case 'skipOnboarding':
        if (this.uiPhase === 'Onboarding') {
          this.onboarding.finish();
          this.enterBriefing();
        }
        break;
      case 'begin':
        this.beginShift();
        break;
      case 'loadFoup':
        if (this.uiPhase === 'AwaitFoup') this.loadNextWafer();
        break;
      case 'runTool':
        this.runTool(cmd.tool);
        break;
      case 'stamp':
        this.stamp(cmd.action);
        break;
      case 'resume':
        this.resumeFromBreak();
        break;
      case 'dismissDebrief':
        this.debriefTimer = DEBRIEF_DWELL;
        this.dismissDebrief();
        break;
      case 'quizAnswer':
        if (this.uiPhase === 'Quiz') this.quiz.answer(cmd.choice);
        break;
      case 'finishQuiz':
        if (this.uiPhase === 'Quiz') {
          this.quizTimer = QUIZ_ACK_SECONDS;
          if (this.quiz.isFinished) this.finishAfterQuiz();
        }
        break;
      case 'forceCloseRework':
        if (this.uiPhase === 'Rework' || this.uiPhase === 'CmpCalib') {
          this.closeReworkOrCalib({
            success: cmd.success,
            armCmpBrake: cmd.armCmpBrake,
            brakeWafers: cmd.brakeWafers,
          });
        }
        break;
      case 'forceOpenRework':
        this.openRework(Math.max(0, this.presentation?.index ?? 0), cmd.defectType ?? null);
        break;
      case 'forceOpenCmp':
        this.openCmpCalibration();
        break;
      default:
        break;
    }
  }

  private setStationSuppressed(suppressed: boolean): void {
    this.stationSuppressed = suppressed;
    this.bay.setStationVisible(!this.stationSuppressed);
  }

  private refreshHud(): void {
    const metrics = this.director.metrics;
    const wafer =
      this.presentation && (this.uiPhase === 'Inspection' || this.uiPhase === 'CmpCalib')
        ? `W${this.presentation.index + 1}/${this.presentation.totalWafers}`
        : this.uiPhase === 'AwaitFoup'
          ? 'FOUP'
          : '—';
    const hints: Record<UiPhase, string> = {
      Progression: 'Pick a day, RETRY, or NEXT DAY',
      Onboarding: 'Station tour — NEXT or SKIP',
      Briefing: 'Click BEGIN SHIFT on the briefing board',
      AwaitFoup: 'Click the FOUP load button (or wait)',
      Inspection: `Tools ${this.campaign.day.availableTools.map((t) => HOTKEYS.find((h) => h[1] === t)?.[0] ?? '').join(' ')} then stamp`,
      Rework: 'Complete the rework bench, then RETURN',
      CmpCalib: 'Tune gain/λ/phase → LOCK endpoint (arms CMP brake)',
      Break: 'Click RESUME when ready',
      Quiz: 'Answer the micro-quiz for competency boosts',
      Review: 'Compiling incident sheet…',
      EndOfDay: 'Evaluating gates…',
      Debrief: 'Read the incident sheet, then ACKNOWLEDGE',
      Complete: 'Shift complete',
    };
    this.onHud?.({
      phase: `Day ${this.campaign.dayNumber} · ${this.uiPhase}` + (this.audio.muted ? ' · MUTED' : ''),
      salary: `$${metrics.totals.salaryTotal.toFixed(0)}`,
      wafer,
      hint: hints[this.uiPhase],
    });
  }
}

export type HarnessCommand =
  | { type: 'skipOnboarding' }
  | { type: 'begin' }
  | { type: 'loadFoup' }
  | { type: 'runTool'; tool: ToolType }
  | { type: 'stamp'; action: PlayerAction }
  | { type: 'resume' }
  | { type: 'dismissDebrief' }
  | { type: 'quizAnswer'; choice: number }
  | { type: 'finishQuiz' }
  | { type: 'forceCloseRework'; success: boolean; armCmpBrake?: boolean; brakeWafers?: number }
  | { type: 'forceOpenRework'; defectType?: string | null }
  | { type: 'forceOpenCmp' };
