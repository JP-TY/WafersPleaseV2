/**
 * Entry point — a playable shift on the cleanroom inspection station.
 *
 * The GDD's core loop (§5) is now end to end: read the traveler, run
 * instruments, stamp the wafer, survive the rework bench, clear the lot, read
 * the incident sheet. The three rework benches are still reachable, but they are
 * now reached the way the GDD intends — by stamping REWORK on a wafer that
 * actually needs it — rather than being three tabs you can open at will.
 *
 * Everything visible is diegetic (§13): the wafer is on a stage, the instruments
 * are a rack of screens, the rules are printed on a clipboard, the disposition is
 * a physical stamp. The only non-diegetic surface is the thin HUD strip at the
 * top, which exists only because a browser window has no status bar — it reports
 * shift state and nothing the player could not read off the instruments.
 *
 * `?station=` still forces a single bench, and `?day=` picks the day, so the
 * minigames remain independently testable.
 */

import './index.css';
import { Rng, makeRunSeed, stableHash } from '@wafers/sim';
import { createRcaClean } from '@wafers/sim';
import { createSilicideEtch, rollSilicideRecipe } from '@wafers/sim';
import { createCmpEndpoint } from '@wafers/sim';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig, ToolConfig } from '@wafers/data';
import rulesData from '@wafers/data/config/defects.json';
import daysData from '@wafers/data/config/days.json';
import matrixData from '@wafers/data/config/rule-matrices.json';
import scoringData from '@wafers/data/config/scoring.json';
import toolsData from '@wafers/data/config/tools.json';
import { createStage, frameWorkspace } from './scene.js';
import { installEnvironment, installLighting, installPipeline } from './scene/lighting.js';
import { buildBay } from './inspection/bay.js';
import { RcaBench } from './rework/rca-view.js';
import { SilicideBench } from './rework/silicide-view.js';
import { CmpBench } from './rework/cmp-view.js';
import { ShiftSession, type ReworkBenchHandle } from './inspection/shift-session.js';

const DEFECTS = (rulesData as { defects: DefectProfile[] }).defects;
const DAYS = (daysData as { days: DayConfig[] }).days;
const TOOLS = (toolsData as { tools: ToolConfig[] }).tools;
const SCORING = (scoringData as { scoring: ScoringConfig }).scoring;

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed') ?? '20260904');
const run = makeRunSeed(Number.isFinite(seedParam) ? seedParam : 20260904);
const difficulty = Number(params.get('difficulty') ?? '0') || 0;
const dayParam = Number(params.get('day') ?? '1');
const day = DAYS.find((d) => d.dayNumber === dayParam) ?? DAYS[0]!;
const rules = (matrixData as { ruleMatrices: RuleMatrix[] }).ruleMatrices.find(
  (r) => r.id === `rule-matrix-day-${day.dayNumber}`,
)!;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const { engine, scene, camera } = createStage(canvas);
// Order matters: the environment first, because PBR materials compile against
// the scene's IBL, and lighting before the pipeline so tone mapping is tuned to
// the final light levels. The bay is built last because it registers the bench
// as a shadow caster.
installEnvironment(scene);
const lighting = installLighting(scene);
installPipeline(scene, camera);
buildBay(scene, lighting.shadows);
frameWorkspace(camera, { phase: 'Briefing' });

// One parent RNG for the shift, forked per bench so that playing one does not
// shift the others. This is the property Unity's single global Random stream
// lacked.
const shiftRng = new Rng(run.seed);

// Rework benches are OFF until a REWORK stamp opens one. They used to be
// permanently mounted and switched by tabs, which let the player open a
// chemistry bench at any time; the GDD §8 reworks are only reachable by
// stamping a wafer that actually needs one.
const benches: Record<string, ReworkBenchHandle> = {
  rca: new RcaBench(scene, createRcaClean(shiftRng.fork(1), difficulty)),
  silicide: new SilicideBench(
    scene,
    createSilicideEtch(rollSilicideRecipe(shiftRng.fork(2), difficulty)),
  ),
  cmp: new CmpBench(scene, createCmpEndpoint(shiftRng.fork(3), difficulty)),
};

// `?station=rca` isolates one bench, which is how the minigame e2e tests drive
// them. Without it, benches are hidden until a Rework stamp opens one.
const forcedStation = params.get('station');

const session = new ShiftSession(
  scene,
  { day, rules, defects: DEFECTS, tools: TOOLS, scoring: SCORING, seed: run.seed },
  benches,
);
session.setReworkBenches(benches);
if (!forcedStation) for (const b of Object.values(benches)) b.setVisible(false);

if (forcedStation && forcedStation in benches) {
  benches[forcedStation]!.setVisible(true);
  session.beginShift();
}

// ---------------------------------------------------------------------------
// HUD — shift state only. Anything a player could read off an instrument lives
// on an instrument, per GDD §13.
// ---------------------------------------------------------------------------

const hud = document.getElementById('hud') as HTMLElement;

function syncHud(): void {
  const m = session.director.metrics;
  const phase = session.currentPhase;
  const remain = Math.max(0, session.shiftTimeLimit - session.shiftElapsed);
  const mm = String(Math.floor(remain / 60)).padStart(2, '0');
  const ss = String(Math.floor(remain % 60)).padStart(2, '0');

  hud.innerHTML = '';

  if (session.inRework) {
    const tag = document.createElement('div');
    tag.className = 'tag rework';
    tag.textContent = 'REWORK BENCH — complete the process or the wafer is scrapped';
    hud.appendChild(tag);
  }

  const measuring = phase === 'Inspection';
  const row = document.createElement('div');
  row.className = measuring ? 'row' : 'row dim';
  for (const [k, tool] of [
    ['1', 'StylusProfilometer'],
    ['2', 'FourPointProbe'],
    ['3', 'SpectroscopicEllipsometry'],
    ['4', 'XRayRefractometry'],
    ['5', 'ElectronMicroscope'],
  ] as const) {
    const available = session.toolsAvailable.includes(tool);
    const used = session.toolsRun.includes(tool);
    const b = document.createElement('button');
    b.className = `tab${used ? ' used' : available && measuring ? '' : ' locked'}`;
    b.textContent = `${k} · ${tool.replace(/([a-z])([A-Z])/g, '$1 $2')}`;
    b.onclick = () => session.runTool(tool);
    row.appendChild(b);
  }
  hud.appendChild(row);

  const stats = document.createElement('div');
  stats.className = 'stats';
  stats.textContent =
    `${phase.toUpperCase()} · ${mm}:${ss} · SALARY ${session.salary.toLocaleString()} / ${day.salaryTarget} · ` +
    `COMP ${(m.competencyScore * 100).toFixed(0)}% / ${day.competencyTarget}% · ` +
    `${m.totals.wafers}/${session.director.totalWafers} wafers`;
  hud.appendChild(stats);

  const callout = session.callout;
  if (callout) {
    const c = document.createElement('div');
    c.className = 'callout';
    c.textContent = callout;
    hud.appendChild(c);
  }

  if (phase === 'Briefing') {
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'BEGIN SHIFT';
    go.onclick = () => session.beginShift();
    hud.appendChild(go);
  }
  if (phase === 'Break') {
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'END BREAK — NEXT WAFER';
    go.onclick = () => session.resumeFromBreak();
    hud.appendChild(go);
  }
  if (phase === 'Review') {
    const go = document.createElement('button');
    go.className = 'primary';
    go.textContent = 'END REVIEW';
    go.onclick = () => session.endReview();
    hud.appendChild(go);
  }
  if (phase === 'EndOfDay') {
    if (session.quizOpen) {
      const q = document.createElement('div');
      q.className = 'tag rework';
      q.textContent = 'SHIFT-END REVIEW — answer on the board';
      hud.appendChild(q);
    } else {
      const go = document.createElement('button');
      go.className = 'primary';
      go.textContent = 'END OF DAY — PRINT DIAGNOSTIC SHEET';
      go.onclick = () => session.openDebrief();
      hud.appendChild(go);
    }
  }
  if (session.debriefComplete) {
    const again = document.createElement('button');
    again.className = 'primary';
    again.textContent = 'RESTART SHIFT';
    again.onclick = () => location.reload();
    hud.appendChild(again);
  }

  const meta = document.createElement('div');
  meta.className = 'meta';
  const boosts = session.boosts > 0 ? ` · competency +${session.boosts}` : '';
  meta.textContent =
    `day ${day.dayNumber} · seed ${run.seed}${run.substituted ? ' (zero substituted)' : ''}` +
    ` · seedHash ${stableHash(String(run.seed))}${boosts} · G glossary  N next  P peel`;
  hud.appendChild(meta);
}

session.onStateChange = () => {
  frameWorkspace(camera, { phase: session.currentPhase, quizOpen: session.quizOpen });
  syncHud();
};
session.onStateChange();

// Debug/e2e handle. Playwright drives the shift through this rather than
// through synthetic mesh raycasts, so UI tests do not depend on camera framing.
(window as unknown as Record<string, unknown>).__WP = {
  benches,
  lighting,
  session,
  scene,
  get phase() {
    return session.currentPhase;
  },
  beginShift: () => session.beginShift(),
  runTool: (t: string) => session.runTool(t as never),
  stamp: (a: string) => session.commitStamp(a as never),
  openDebrief: () => session.openDebrief(),
  closeRework: (ok: boolean, opts?: { armCmpBrake?: boolean }) => session.closeReworkBench(ok, opts),
  closeQuiz: () => session.closeQuiz(),
  answerQuiz: (i: number) => session.answerQuiz(i),
  nextQuiz: () => session.nextQuiz(),
  glossary: () => session.toggleGlossary(),
};

// Fixed timestep so the physics does not depend on frame rate — required for
// determinism, and it also stops a slow frame from skipping the anneal window.
const STEP = 1 / 60;
let acc = 0;

scene.onBeforeRenderObservable.add(() => {
  const dt = Math.min(engine.getDeltaTime() / 1000, 0.1);
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard < 12) {
    session.update(STEP);
    for (const b of Object.values(benches)) b.update(STEP);
    acc -= STEP;
    guard++;
  }
  if (guard >= 12) acc = 0;
});