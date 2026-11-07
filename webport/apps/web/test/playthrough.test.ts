import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createNullStage } from '../src/bootstrap/engine.js';
import { installAudio } from '../src/audio/sfx.js';
import { ShiftSession } from '../src/session/shift-session.js';
import { runHeadlessDay1, runSessionDay1Playthrough } from '../src/session/playthrough.js';
import { buildBay } from '../src/bay/bay.js';
import { worldCenter, pickThrough } from '../src/input/pick.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';

describe('§5.2 playthrough harness', () => {
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

  it('headless Day 1 completes with deterministic seed', () => {
    const a = runHeadlessDay1(20260904);
    const b = runHeadlessDay1(20260904);
    expect(a.wafers).toBe(5);
    expect(a.salary).toBe(b.salary);
    expect(a.passed).toBe(b.passed);
  });

  it('session harness reaches debrief/progression for Day 1', () => {
    const session = new ShiftSession({
      scene,
      camera,
      seed: 20260904,
      dayNumber: 1,
      audio: installAudio(),
      loadProps: false,
    });
    const report = runSessionDay1Playthrough(session);
    expect(report.failures).toEqual([]);
    expect(report.stamped).toBe(report.wafers);
    expect(report.phasesSeen).toContain('Briefing');
    expect(report.phasesSeen).toContain('Inspection');
    expect(report.phasesSeen).toContain('Debrief');
    expect(report.ok).toBe(true);
  });

  it('§5.2 reachability: begin, FOUP, tools, stamps pickable from camera', () => {
    const bay = buildBay(scene, [
      'StylusProfilometer',
      'FourPointProbe',
      'SpectroscopicEllipsometry',
      'XRayRefractometry',
      'ElectronMicroscope',
    ]);
    bay.instruments.setDayRoster(['StylusProfilometer', 'FourPointProbe'], 1);
    const targets = [
      bay.boards.beginButton,
      bay.foup.button,
      bay.instruments.meshFor('StylusProfilometer')!,
      bay.instruments.meshFor('FourPointProbe')!,
      ...bay.stamps.allMeshes(),
    ];
    for (const mesh of targets) {
      expect(mesh.isPickable).toBe(true);
      const c = worldCenter(mesh);
      const hit = pickThrough(scene, camera, c);
      expect(hit).toBeTruthy();
    }
    // Locked tools are not pickable after day roster.
    expect(bay.instruments.meshFor('ElectronMicroscope')!.isPickable).toBe(false);
  });
});
