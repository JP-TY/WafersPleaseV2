import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Culling/ray.js';
import { createNullStage, frameWorkspace, frameInspection } from '../src/bootstrap/engine.js';
import { buildBay } from '../src/bay/bay.js';
import { worldCenter, pickThrough } from '../src/input/pick.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import type { Engine } from '@babylonjs/core/Engines/engine.js';

function worldBounds(mesh: AbstractMesh) {
  mesh.computeWorldMatrix(true);
  mesh.refreshBoundingInfo(true, true);
  return mesh.getBoundingInfo().boundingBox;
}

describe('bay playability guards', () => {
  let engine: Engine;
  let scene: Scene;
  let camera: ArcRotateCamera;

  beforeEach(() => {
    const stage = createNullStage();
    engine = stage.engine;
    scene = stage.scene;
    camera = stage.camera;
    frameWorkspace(camera);
  });

  afterEach(() => {
    scene.dispose();
    engine.dispose();
  });

  it('builds Day 1 bay with pickable begin, FOUP, tools, and stamps', () => {
    const bay = buildBay(scene, ['StylusProfilometer', 'FourPointProbe']);
    expect(bay.boards.beginButton.isPickable).toBe(true);
    expect(bay.foup.button.isPickable).toBe(true);
    expect(bay.instruments.allScreens().every((s) => s.isPickable)).toBe(true);
    expect(bay.stamps.allMeshes().every((s) => s.isPickable)).toBe(true);
    expect(bay.stage.wafer.isPickable).toBe(true);
  });

  it('traveler does not sit in front of stylus screen (occlusion guard)', () => {
    const bay = buildBay(scene, ['StylusProfilometer', 'FourPointProbe']);
    const stylus = bay.instruments.meshFor('StylusProfilometer')!;
    const traveler = bay.traveler.board;

    const stylusCenter = worldCenter(stylus);
    const travBounds = worldBounds(traveler);

    // Traveler root sits forward (+Z) of the instrument rack so it cannot
    // occlude Day 1 stylus / probe screens (§4.7).
    expect(bay.traveler.root.position.z).toBeGreaterThan(0.3);
    expect(bay.instruments.root.position.x).toBeGreaterThan(0.4);

    // Ray from camera through stylus centre should not hit traveler first.
    const hit = pickThrough(scene, camera, stylusCenter);
    expect(hit?.name).not.toBe(traveler.name);

    // Sanity: traveler has finite world bounds after matrix update.
    expect(travBounds.maximumWorld.y).toBeGreaterThan(travBounds.minimumWorld.y);
  });

  it('stamp meshes are reachable by ray from working camera', () => {
    const bay = buildBay(scene, ['StylusProfilometer', 'FourPointProbe']);
    // Post-load inspection: briefing CTA is hidden (same as ShiftSession after begin).
    bay.boards.show('Hidden');
    // Use the real post-load inspection orbit (inside-room, FOUP+stage+stamps).
    frameInspection(camera);
    for (const mesh of bay.stamps.allMeshes()) {
      const c = worldCenter(mesh);
      const origin = camera.globalPosition.clone();
      const dir = c.subtract(origin).normalize();
      const ray = new Ray(origin, dir, 20);
      const hit = scene.pickWithRay(ray);
      expect(hit?.hit).toBe(true);
      // May hit stamp face child or body — either is interactive ancestry.
      const name = hit?.pickedMesh?.name ?? '';
      expect(name.toLowerCase()).toMatch(/stamp/);
    }
  });

  it('begin button has a positive world extent', () => {
    const bay = buildBay(scene, ['StylusProfilometer']);
    const b = worldBounds(bay.boards.beginButton);
    expect(b.maximumWorld.x - b.minimumWorld.x).toBeGreaterThan(0.1);
  });

  it('frameWorkspace sets limits before applying radius', () => {
    frameWorkspace(camera, new Vector3(0, 1, 0), 0.6);
    expect(camera.lowerRadiusLimit).toBeLessThanOrEqual(0.6);
    expect(camera.radius).toBeGreaterThanOrEqual(camera.lowerRadiusLimit!);
  });
});
