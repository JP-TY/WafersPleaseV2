/**
 * Operator and input tests.
 *
 * These run on a Babylon `NullEngine`, so the whole rig is built and posed with no
 * GPU and no canvas. That matters here more than usual: a body assembled from
 * joints is exactly the kind of thing that can be silently built sideways, and the
 * only reliable way to catch that is to assert on absolute world coordinates rather
 * than on how a screenshot happened to look.
 *
 * The bug this suite exists for: the rig helper took a single `offset` and applied
 * it on X, so a skeleton authored as a vertical stack came out lying on its side
 * with the head 1.5 m from the feet. Every joint was in the right order in the code
 * and the body was completely wrong on screen.
 */

import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { Operator, WALK_AREA, operatorMeshes } from '../src/player/operator.js';
import { KeyboardState, resolveMove } from '../src/player/input.js';

function stage() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return { engine, scene };
}

/** Advance the operator at a fixed step, as the render loop does. */
function walk(op: Operator, dir: { x: number; z: number }, seconds: number, dt = 1 / 60): void {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) op.move(dir, dt);
}

describe('operator rig', () => {
  it('builds an upright body: the head is above the feet', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const head = scene.getMeshByName('op-hood')!.getAbsolutePosition();
    const boot = scene.getMeshByName('op-boot-l')!.getAbsolutePosition();
    // The single most important assertion in this file. A sideways rig puts these
    // the same height apart and the difference is obvious.
    expect(head.y - boot.y).toBeGreaterThan(0.9);
    expect(head.y).toBeGreaterThan(1.3);
    expect(boot.y).toBeLessThan(0.5);
    engine.dispose();
  });

  it('stands roughly eye height, matching the camera in createStage', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const head = scene.getMeshByName('op-hood')!.getAbsolutePosition();
    expect(head.y).toBeGreaterThan(1.45);
    expect(head.y).toBeLessThan(1.75);
    expect(op.eye.y).toBe(1.6);
    engine.dispose();
  });

  it('has a body made of real parts, not a single quad', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const meshes = operatorMeshes(op.root);
    expect(meshes.length).toBeGreaterThanOrEqual(10);
    for (const part of ['op-chest', 'op-hood', 'op-visor', 'op-leg-l', 'op-leg-r', 'op-arm-l', 'op-arm-r']) {
      expect(meshes.map((m) => m.name)).toContain(part);
    }
    engine.dispose();
  });

  it('articulates: legs and arms swing in opposition while walking', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const legL = scene.getTransformNodeByName('op-leg-l')!;
    const armL = scene.getTransformNodeByName('op-arm-l')!;
    let maxLeg = 0;
    let maxArm = 0;
    let opposite = 0;
    let legPrev = 0;
    for (let i = 0; i < 120; i++) {
      op.move({ x: 1, z: 0 }, 1 / 60);
      maxLeg = Math.max(maxLeg, Math.abs(legL.rotation.x));
      maxArm = Math.max(maxArm, Math.abs(armL.rotation.x));
      // Arm and leg on the same side should be out of phase, which is what makes a
      // walk read as a walk rather than as a puppet on strings.
      if (Math.sign(legL.rotation.x) !== Math.sign(armL.rotation.x) && legL.rotation.x !== 0) opposite++;
      legPrev = legL.rotation.x;
    }
    void legPrev;
    expect(maxLeg).toBeGreaterThan(0.2);
    expect(maxArm).toBeGreaterThan(0.1);
    expect(opposite).toBeGreaterThan(30);
    engine.dispose();
  });

  it('gait is driven by distance, so a standing operator does not shuffle', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const legL = scene.getTransformNodeByName('op-leg-l')!;
    for (let i = 0; i < 60; i++) op.stand();
    expect(legL.rotation.x).toBe(0);
    engine.dispose();
  });
});

describe('operator movement', () => {
  it('walks where it is told and stops when told to stop', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const start = { ...op.position };
    walk(op, { x: 1, z: 0 }, 1);
    expect(op.position.x).toBeGreaterThan(start.x + 0.6);
    const stopped = { ...op.position };
    op.stand();
    for (let i = 0; i < 60; i++) op.stand();
    expect(op.position.x).toBeCloseTo(stopped.x, 5);
    expect(op.moving).toBe(false);
    engine.dispose();
  });

  it('accelerates rather than snapping to speed', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    op.move({ x: 1, z: 0 }, 1 / 60);
    // First frame must be well short of full speed: instant velocity on a walking
    // figure reads as a cursor, not a person.
    expect(op.position.x).toBeLessThan(0.05);
    engine.dispose();
  });

  it('stays inside the bay', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    walk(op, { x: 1, z: 0 }, 20);
    expect(op.position.x).toBeLessThanOrEqual(WALK_AREA.maxX);
    op.placeAt(0, 0, 0);
    walk(op, { x: 0, z: 1 }, 20);
    expect(op.position.z).toBeLessThanOrEqual(WALK_AREA.maxZ);
    engine.dispose();
  });

  it('cannot walk into the bench', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    op.placeAt(0, -0.86, 0);
    // Walk hard forward for a long time: the bench spans |x| < 1.25, z -0.33..0.33.
    walk(op, { x: 0, z: 1 }, 8);
    // Either stopped in front of it or pushed out the back, never inside it.
    const insideBench = Math.abs(op.position.x) < 1.25 && op.position.z > -0.34 && op.position.z < 0.34;
    expect(insideBench).toBe(false);
    engine.dispose();
  });

  it('never spawns inside the bench', () => {
    // The original spawn at x = 0, z = -0.62 put the body radius overlapping the
    // bench face, so the first press of W did nothing at all.
    const { engine, scene } = stage();
    const op = new Operator(scene);
    const p = op.position;
    const insideBench = Math.abs(p.x) < 1.25 && p.z > -0.34 && p.z < 0.34;
    expect(insideBench).toBe(false);
    engine.dispose();
  });

  it('starts out of the camera sightline to the instruments', () => {
    // The orbit camera looks down the -Z axis at the wafer stage. An operator at
    // x = 0 stands between the lens and the bench and hides it entirely.
    const { engine, scene } = stage();
    const op = new Operator(scene);
    expect(Math.abs(op.position.x)).toBeGreaterThan(0.25);
    engine.dispose();
  });

  it('placeAt clamps into the walkable area', () => {
    const { engine, scene } = stage();
    const op = new Operator(scene);
    op.placeAt(999, 999, 0);
    expect(op.position.x).toBeLessThanOrEqual(WALK_AREA.maxX);
    expect(op.position.z).toBeLessThanOrEqual(WALK_AREA.maxZ);
    engine.dispose();
  });
});

describe('input', () => {
  function fakeCamera(alpha: number): ArcRotateCamera {
    const { scene } = stage();
    return new ArcRotateCamera('cam', alpha, 1.2, 2, Vector3.Zero(), scene);
  }

  it('reports no direction when nothing is held', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    expect(resolveMove(keys, fakeCamera(-Math.PI / 2))).toBeNull();
    keys.dispose();
    engine.dispose();
  });

  it('W moves away from the camera, not along a world axis', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    keys.setForTest('KeyW', true);
    const dir = resolveMove(keys, fakeCamera(-Math.PI / 2))!;
    // Default camera at alpha = -PI/2 sits on -Z, so forward is +Z.
    expect(dir.z).toBeGreaterThan(0.9);
    expect(Math.abs(dir.x)).toBeLessThan(0.1);
    keys.dispose();
    engine.dispose();
  });

  it('D strafes to screen-right, not screen-left', () => {
    // Babylon is left-handed: facing +Z, right is +X. Deriving the right vector the
    // right-handed way made D walk the operator the wrong way, which a screenshot
    // caught and a direction test pins down.
    const { engine } = stage();
    const keys = new KeyboardState();
    keys.setForTest('KeyD', true);
    const dir = resolveMove(keys, fakeCamera(-Math.PI / 2))!;
    expect(dir.x).toBeGreaterThan(0.9);
    keys.dispose();
    engine.dispose();
  });

  it('rotates with the camera', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    keys.setForTest('KeyW', true);
    // Camera swung 90 degrees (alpha = 0 puts it on +X): forward must swing to -X
    // with it, not stay pointing at +Z.
    const dir = resolveMove(keys, fakeCamera(0))!;
    expect(dir.x).toBeLessThan(-0.9);
    expect(Math.abs(dir.z)).toBeLessThan(0.1);
    keys.dispose();
    engine.dispose();
  });

  it('normalises diagonals so they are not faster', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    const cam = fakeCamera(-Math.PI / 2);
    keys.setForTest('KeyW', true);
    const fwd = resolveMove(keys, cam)!;
    keys.setForTest('KeyD', true);
    const diag = resolveMove(keys, cam)!;
    expect(Math.hypot(diag.x, diag.z)).toBeCloseTo(1, 6);
    expect(Math.hypot(fwd.x, fwd.z)).toBeCloseTo(1, 6);
    keys.dispose();
    engine.dispose();
  });

  it('supports the arrow cluster as well as WASD', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    keys.setForTest('ArrowUp', true);
    expect(resolveMove(keys, fakeCamera(-Math.PI / 2))).not.toBeNull();
    keys.dispose();
    engine.dispose();
  });

  it('releasing a key stops that direction', () => {
    const { engine } = stage();
    const keys = new KeyboardState();
    keys.setForTest('KeyW', true);
    expect(resolveMove(keys, fakeCamera(-Math.PI / 2))).not.toBeNull();
    keys.setForTest('KeyW', false);
    expect(resolveMove(keys, fakeCamera(-Math.PI / 2))).toBeNull();
    keys.dispose();
    engine.dispose();
  });
});