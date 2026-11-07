/**
 * Entry point — a rework bay with all three benches.
 *
 * For now each station is mounted on its own instrument screen in a dark bay so
 * the physics and the panel rendering can be verified end to end. The full
 * cleanroom assembly is Phase 4; this is the same `screenFromPanel` mounting
 * that Phase 5 will reuse for the diegetic instrument cluster, so nothing here
 * is throwaway.
 */

import './index.css';
import { Rng, makeRunSeed, stableHash } from '@wafers/sim';
import { createRcaClean } from '@wafers/sim';
import { createSilicideEtch, rollSilicideRecipe } from '@wafers/sim';
import { createCmpEndpoint } from '@wafers/sim';
import { createStage, floor } from './scene.js';
import { RcaBench } from './rework/rca-view.js';
import { SilicideBench } from './rework/silicide-view.js';
import { CmpBench } from './rework/cmp-view.js';

type Station = 'rca' | 'silicide' | 'cmp';

const STATIONS: { id: Station; key: string; title: string; hint: string }[] = [
  { id: 'rca', key: '1', title: 'RCA CLEAN', hint: 'twin-tank wet bench — heat each bath, soak, rinse between' },
  { id: 'silicide', key: '2', title: 'SILICIDE ETCH', hint: 'watch Rₛ — wash while the film is still C49' },
  { id: 'cmp', key: '3', title: 'CMP ENDPOINT', hint: 'calibrate the interferometer, then lock the knee' },
];

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed') ?? '20260904');
const run = makeRunSeed(Number.isFinite(seedParam) ? seedParam : 20260904);
const difficulty = Number(params.get('difficulty') ?? '0') || 0;

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const { engine, scene } = createStage(canvas);
floor(scene);

// One parent RNG for the shift, forked per station so that playing one does not
// shift the others. This is the property Unity's single global Random stream
// lacked.
const shiftRng = new Rng(run.seed);

const benches = {
  rca: new RcaBench(scene, createRcaClean(shiftRng.fork(1), difficulty)),
  silicide: new SilicideBench(
    scene,
    createSilicideEtch(rollSilicideRecipe(shiftRng.fork(2), difficulty)),
  ),
  cmp: new CmpBench(scene, createCmpEndpoint(shiftRng.fork(3), difficulty)),
};

interface AnyBench {
  update(dt: number): void;
  setVisible(visible: boolean): void;
}

let active: Station = (params.get('station') as Station) ?? 'rca';
if (!(active in benches)) active = 'rca';

function setStation(next: Station): void {
  active = next;
  // Inactive benches are disabled rather than destroyed, so switching is instant
  // and no simulation state is lost.
  for (const s of STATIONS) (benches[s.id] as AnyBench).setVisible(s.id === active);
  syncHud();
}

const hud = document.getElementById('hud') as HTMLElement;
function syncHud(): void {
  const s = STATIONS.find((x) => x.id === active)!;
  hud.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'row';
  for (const st of STATIONS) {
    const b = document.createElement('button');
    b.textContent = `${st.key} · ${st.title}`;
    b.className = st.id === active ? 'tab active' : 'tab';
    b.onclick = () => setStation(st.id);
    row.appendChild(b);
  }
  hud.appendChild(row);
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = s.hint;
  hud.appendChild(hint);
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `seed ${run.seed}${run.substituted ? ' (zero substituted)' : ''} · difficulty ${difficulty} · seedHash ${stableHash(String(run.seed))}`;
  hud.appendChild(meta);
}

setStation(active);

// Debug/e2e handle. Playwright drives the minigames through this rather than
// through synthetic mesh raycasts, so UI tests do not depend on camera framing.
(window as unknown as Record<string, unknown>).__WP = {
  benches,
  scene,
  get active() {
    return active;
  },
  setStation,
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
    (benches[active] as { update(dt: number): void }).update(STEP);
    acc -= STEP;
    guard++;
  }
  if (guard >= 12) acc = 0;
});

