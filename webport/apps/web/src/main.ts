/**
 * Wafers Please — diegetic cleanroom (Babylon 9).
 * Core loop + Days 1–3 campaign, rework benches, WebXR optional path.
 */

import './index.css';
import { makeRunSeed } from '@wafers/sim';
import { createStage, frameWorkspace } from './bootstrap/engine.js';
import { installLighting } from './bootstrap/lighting.js';
import { installAudio } from './audio/sfx.js';
import { ShiftSession } from './session/shift-session.js';
import { installXrSession } from './xr/session.js';
import { probeXr } from './xr/plan.js';
import { registerServiceWorker, isSecureContext } from './pwa.js';

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed') ?? '20260904');
const run = makeRunSeed(Number.isFinite(seedParam) ? seedParam : 20260904);
const dayNumber = Number(params.get('day') ?? '1') || 1;
// Scenic GLBs on by default; ?props=0 keeps a lean procedural-only bay.
const loadProps = params.get('props') !== '0';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud');
const hudPhase = document.getElementById('hud-phase');
const hudSalary = document.getElementById('hud-salary');
const hudWafer = document.getElementById('hud-wafer');
const hudHint = document.getElementById('hud-hint');

const { engine, scene, camera } = createStage(canvas);
const lighting = installLighting(scene, camera);
frameWorkspace(camera);

const audio = installAudio();

// ?nosw=1 skips SW — useful for smoke/debug when /models XHR must bypass cache.
if (params.get('nosw') !== '1') void registerServiceWorker();
if (!isSecureContext()) {
  console.warn(
    '[Wafers Please] Not a secure context — WebXR and the service worker are unavailable. Serve over HTTPS (or localhost).',
  );
}

const session = new ShiftSession({
  scene,
  camera,
  seed: run.seed,
  dayNumber,
  audio,
  lighting,
  loadProps,
  onHud(h) {
    if (hudPhase) hudPhase.textContent = h.phase;
    if (hudSalary) hudSalary.textContent = h.salary;
    if (hudWafer) hudWafer.textContent = h.wafer;
    if (hudHint) hudHint.textContent = h.hint;
  },
});

let last = performance.now();
scene.onBeforeRenderObservable.add(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  session.update(dt);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) engine.stopRenderLoop();
  else {
    last = performance.now();
    engine.runRenderLoop(() => scene.render());
  }
});

void (async () => {
  const plan = await probeXr();
  console.info('[Wafers Please] WebXR probe:', plan.note);
  if (!plan.supported) return;
  const floor = scene.meshes.filter((m) => m.name === 'floor');
  const xr = await installXrSession({
    scene,
    floorMeshes: floor,
    hudEl: hud,
    onEnter: () => session.follow.suspend(),
    onExit: () => session.follow.resume(camera),
  });
  if (window.__WP) window.__WP.xr = xr;
})();

declare global {
  interface Window {
    __WP?: {
      scene: typeof scene;
      session: ShiftSession;
      engine: typeof engine;
      xr?: unknown;
    };
  }
}
window.__WP = { scene, session, engine };

canvas.focus();
