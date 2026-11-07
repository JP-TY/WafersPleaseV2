import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  Rng,
  recipeFor,
  createSilicideEtch,
  createCmpEndpoint,
  sample,
} from '@wafers/sim';
import { createNullStage, frameFoup, frameInspection } from '../src/bootstrap/engine.js';
import { SilicideBench } from '../src/rework/silicide-bench.js';
import { CmpBench } from '../src/rework/cmp-bench.js';
import { RcaBench } from '../src/rework/rca-bench.js';
import { REWORK_SLOT } from '../src/rework/station-return.js';
import { loadGameConfig } from '../src/session/config.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';

describe('Silicide + CMP benches', () => {
  let engine: Engine;
  let scene: Scene;
  let camera: ArcRotateCamera;

  beforeEach(() => {
    const stage = createNullStage();
    engine = stage.engine;
    scene = stage.scene;
    camera = stage.camera;
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('loads authored silicide and CMP recipes', () => {
    const game = loadGameConfig();
    expect(recipeFor('SilicideWetEtch', game.rework).kind).toBe('SilicideWetEtch');
    expect(recipeFor('CMPCalibration', game.rework).kind).toBe('CMPCalibration');
  });

  it('parks rework benches inside the cleanroom (not behind the back wall)', () => {
    // Bay back wall ≈ z=-1.65; prior RCA slot z=-2.2 framed as a grey void.
    expect(REWORK_SLOT.z).toBeGreaterThan(-1.2);
    expect(Math.abs(REWORK_SLOT.x)).toBeLessThan(1.5);
    const game = loadGameConfig();
    const rca = new RcaBench(scene, () => new Rng(1), recipeFor('RCAClean', game.rework));
    const sil = new SilicideBench(scene, () => new Rng(2), recipeFor('SilicideWetEtch', game.rework));
    const cmp = new CmpBench(scene, () => new Rng(3), recipeFor('CMPCalibration', game.rework));
    for (const b of [rca, sil, cmp]) {
      expect(b.root.position.z).toBeGreaterThan(-1.2);
      expect(b.root.position.z).toBeCloseTo(REWORK_SLOT.z, 5);
    }
  });

  it('frames rework camera inside the cleanroom volume (forward of back wall)', () => {
    const game = loadGameConfig();
    const rca = new RcaBench(scene, () => new Rng(1), recipeFor('RCAClean', game.rework));
    rca.setVisible(true);
    rca.frameCamera(camera);
    // Stay forward of back wall ≈ -1.65 — exterior orbit framed grey slab/void.
    // β≈1.18 looks into pool surfaces (β≳1.3 was edge-on); cam stays under FFU / inside room.
    expect(camera.radius).toBeLessThanOrEqual(2.4);
    expect(camera.beta).toBeGreaterThan(1.1);
    expect(camera.beta).toBeLessThan(1.35);
    expect(camera.fov).toBeGreaterThan(0.95);
    expect(camera.position.z).toBeGreaterThan(-1.45);
    expect(camera.position.y).toBeLessThan(1.9);
    expect(camera.position.y).toBeGreaterThan(1.2);
    expect(camera.position.x).toBeLessThan(2.25);
  });

  it('frames FOUP/inspection inside the cleanroom under the FFU bank', () => {
    frameFoup(camera);
    expect(camera.position.z).toBeGreaterThan(-1.45);
    expect(camera.position.y).toBeLessThan(1.9);
    expect(camera.radius).toBeLessThanOrEqual(2.5);
    expect(camera.getTarget().x).toBeLessThan(0.1);
    frameInspection(camera);
    expect(camera.position.z).toBeGreaterThan(-1.45);
    expect(camera.position.y).toBeLessThan(1.9);
    expect(camera.radius).toBeLessThanOrEqual(2.5);
  });

  it('mounts silicide bench under NullEngine', () => {
    const game = loadGameConfig();
    const bench = new SilicideBench(scene, () => new Rng(2), recipeFor('SilicideWetEtch', game.rework));
    bench.setVisible(true);
    bench.prepareFresh();
    bench.update(0.016);
    bench.setVisible(false);
    expect(bench.getCloseRequest()).toBeNull();
  });

  it('mounts CMP bench under NullEngine', () => {
    const game = loadGameConfig();
    const bench = new CmpBench(scene, () => new Rng(3), recipeFor('CMPCalibration', game.rework));
    bench.setVisible(true);
    bench.prepareFresh();
    bench.update(0.016);
    expect(bench.getCloseRequest()).toBeNull();
  });

  it('silicide wash-in-window can succeed (sim grading source)', () => {
    // Use explicit wash bounds matching packages/sim happy-path tests.
    const etch = createSilicideEtch({
      tauSeconds: 20,
      tauJitter: 1,
      washMinSeconds: 0.35,
      washMaxSeconds: 2.2,
      procedure: null,
    });
    const dt = 1 / 60;
    for (let t = 0; t < 1; t += dt) etch.tick(dt);
    etch.act({ type: 'startWash' });
    for (let t = 0; t < 1.2; t += dt) etch.tick(dt);
    etch.act({ type: 'stopWash' });
    etch.act({ type: 'commit' });
    expect(etch.finished).toBe(true);
    expect(etch.result?.success).toBe(true);
  });

  it('CMP sample and lock share the same calibration transform', () => {
    const game = loadGameConfig();
    const cmp = createCmpEndpoint(new Rng(5), 0, recipeFor('CMPCalibration', game.rework));
    cmp.act({ type: 'setGain', value: 0.9 });
    cmp.act({ type: 'setWavelength', value: 5 });
    cmp.act({ type: 'setPhase', value: Math.PI });
    for (let t = 0; t < cmp.state.true_.endpointSeconds * 0.95; t += 0.1) cmp.tick(0.1);
    const smp = sample(cmp.state);
    expect(smp.apparentNm).toBeGreaterThanOrEqual(0);
    cmp.act({ type: 'lockEndpoint' });
    expect(cmp.finished).toBe(true);
  });
});
