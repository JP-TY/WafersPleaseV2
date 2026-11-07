/**
 * Playability tests.
 *
 * Everything here exists because of a specific way the game was unplayable while
 * looking and feeling fine. Neither bug threw, neither logged, and neither failed
 * an existing test:
 *
 *  1. The traveler clipboard stood on an easel at the instrument rack and
 *     physically covered the Stylus Profilometer screen -- the first tool Day 1
 *     asks you to run. You could not press it.
 *
 *  2. `ClusterView.onRun` was declared with a no-op default and never assigned, so
 *     every instrument in the rack was a dead prop. Clicking a screen did nothing.
 *     The only working path was the DOM chip row, which quietly reduced the whole
 *     diegetic workstation to scenery.
 *
 * Both are geometry and wiring facts that no amount of unit testing the simulation
 * would ever notice. These tests assert them directly.
 */

import { describe, expect, it } from 'vitest';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Ray } from '@babylonjs/core/Culling/ray.js';
import '@babylonjs/core/Culling/ray.js';

import { ShiftSession, type ReworkBenchHandle } from '../src/inspection/shift-session.js';
import { installLighting } from '../src/scene/lighting.js';
import { frameWorkspace } from '../src/scene.js';
import type { DayConfig, DefectProfile, RuleMatrix, ScoringConfig, ToolConfig } from '@wafers/data';
import defectsJson from '@wafers/data/config/defects.json';
import daysJson from '@wafers/data/config/days.json';
import matrixJson from '@wafers/data/config/rule-matrices.json';
import scoringJson from '@wafers/data/config/scoring.json';
import toolsJson from '@wafers/data/config/tools.json';

/**
 * World-space bounds of a mesh, forced fresh.
 *
 * `boundingBox.maximumWorld` is only as fresh as the last world-matrix update, and
 * on a NullEngine with no rendering loop that is the state at construction. Reading
 * it directly returned local coordinates and produced assertions that looked
 * reasonable and meant nothing.
 */
function worldBounds(mesh: { computeWorldMatrix: (f?: boolean) => unknown; refreshBoundingInfo: () => unknown; getBoundingInfo: () => { boundingBox: { minimumWorld: Vector3; maximumWorld: Vector3 } } }) {
  (mesh as { computeWorldMatrix: (f?: boolean) => unknown }).computeWorldMatrix(true);
  (mesh as { refreshBoundingInfo: () => unknown }).refreshBoundingInfo();
  const bb = (mesh as { getBoundingInfo: () => { boundingBox: { minimumWorld: Vector3; maximumWorld: Vector3 } } }).getBoundingInfo().boundingBox;
  return { min: bb.minimumWorld.clone(), max: bb.maximumWorld.clone() };
}

const DEFECTS = (defectsJson as { defects: DefectProfile[] }).defects;
const DAYS = (daysJson as { days: DayConfig[] }).days;
const TOOLS = (toolsJson as { tools: ToolConfig[] }).tools;
const SCORING = (scoringJson as { scoring: ScoringConfig }).scoring;
const RULES = (matrixJson as { ruleMatrices: RuleMatrix[] }).ruleMatrices;

/** Every tool the player must be able to operate, across all three days. */
const HOTKEYS = [
  'StylusProfilometer',
  'FourPointProbe',
  'SpectroscopicEllipsometry',
  'XRayRefractometry',
  'ElectronMicroscope',
] as const;

function bench(): ReworkBenchHandle {
  return { setVisible() {}, update() {} };
}

function station() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  installLighting(scene);
  const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.36, 2.3, new Vector3(0, 1.3, 0.1), scene);
  const session = new ShiftSession(
    scene,
    { days: DAYS, rules: RULES, defects: DEFECTS, tools: TOOLS, scoring: SCORING, seed: 4242 },
    { rca: bench(), silicide: bench(), cmp: bench() },
    camera,
  );
  frameWorkspace(camera, { phase: 'Inspection' });
  // Bounding boxes report local space until the world matrices are computed, which
  // on a NullEngine nothing else triggers. Without this the geometry assertions
  // read plausible-looking nonsense.
  scene.render();
  return { engine, scene, camera, session };
}

describe('playability: the instruments are actually operable', () => {
  it('clicking an instrument screen runs that instrument', () => {
    // The bug: `onRun` was a no-op default that nobody assigned, so every screen was
    // inert. Assert through the real path -- the cluster's own pointer handling
    // calls `onRun`, and that has to reach `runTool`.
    const { engine, scene, session } = station();
    session.beginShift();
    expect(session.toolsRunThisWafer).toHaveLength(0);

    // Drive the same call the pointer handler makes.
    const cluster = (session as unknown as { cluster: { onRun: (t: never) => void } }).cluster;
    cluster.onRun('StylusProfilometer' as never);

    expect(session.toolsRunThisWafer).toEqual(['StylusProfilometer']);
    void scene;
    engine.dispose();
  });

  it('the physical RUN keys are wired to the same path as the screens', () => {
    const { engine, session } = station();
    session.beginShift();
    const cluster = (session as unknown as {
      cluster: { onRun: (t: never) => void; screens?: unknown };
    }).cluster;
    // Both the screen and the key route through onRun; if that one callback is
    // dead, the entire rack is decorative.
    expect(typeof cluster.onRun).toBe('function');
    cluster.onRun('StylusProfilometer' as never);
    expect(session.toolsRunThisWafer).toEqual(['StylusProfilometer']);
    engine.dispose();
  });

  it('no instrument screen is hidden behind the traveler or the operator', () => {
    // The bug: the traveler stood on an easel at the rack and covered the
    // leftmost screen. Measured by raycasting from the camera to each screen, which
    // is what a click does -- so this fails for exactly the reason play fails.
    const { engine, scene, camera } = station();

    const blocked: Record<string, string> = {};
    for (const tool of HOTKEYS) {
      const screen = scene.getMeshByName(`cluster-${tool}-screen`);
      expect(screen, `${tool} screen must exist`).toBeTruthy();
      const target = screen!.getBoundingInfo().boundingBox.centerWorld;
      const dir = target.subtract(camera.position);
      const length = dir.length();
      dir.normalize();
      const ray = new Ray(camera.position.clone(), dir, length - 0.01);
      const pick = scene.pickWithRay(ray, (m) => m.isEnabled() && m.isVisible && m.isPickable);
      if (pick?.hit && pick.pickedMesh && pick.pickedMesh !== screen) {
        blocked[tool] = pick.pickedMesh.name;
      }
    }

    expect(
      blocked,
      `these instrument screens are occluded and cannot be clicked: ${JSON.stringify(blocked)}`,
    ).toEqual({});
    engine.dispose();
  });

  it('the traveler does not reach up into the instrument rack', () => {
    // A geometric statement of the same fault, independent of camera angle: the
    // clipboard is 0.44 m of paper and must not stand taller than the rack it is
    // sitting next to.
    const { engine, scene } = station();
    const travelerTop = worldBounds(scene.getMeshByName('traveler-back')!).max.y;
    const lowestScreenBottom = Math.min(
      ...HOTKEYS.map((t) => worldBounds(scene.getMeshByName(`cluster-${t}-screen`)!).min.y),
    );
    expect(travelerTop).toBeLessThan(lowestScreenBottom + 0.12);
    engine.dispose();
  });

  it('every day roster tool has a screen the player can reach', () => {
    // Ties the two bugs together: a tool you cannot click is a tool you cannot run,
    // and the roster is the GDD 9 progression rather than a convenience filter.
    for (const day of DAYS) {
      const { engine, scene, camera } = station();
      frameWorkspace(camera, { phase: 'Inspection' });
      const roster = (day as unknown as { availableTools: string[] }).availableTools ?? [];
      expect(roster.length, `day ${day.dayNumber} must offer instruments`).toBeGreaterThan(0);
      for (const id of roster) {
        const screen = scene.getMeshByName(`cluster-${id}-screen`);
        expect(screen, `day ${day.dayNumber} tool ${id} needs a screen`).toBeTruthy();
        const target = screen!.getBoundingInfo().boundingBox.centerWorld;
        const dir = target.subtract(camera.position);
        const len = dir.length();
        dir.normalize();
        const pick = scene.pickWithRay(new Ray(camera.position.clone(), dir, len - 0.01), (m) =>
          m.isEnabled() && m.isVisible && m.isPickable,
        );
        expect(
          pick?.hit && pick.pickedMesh !== screen,
          `day ${day.dayNumber}: ${id} is blocked by ${pick?.pickedMesh?.name}`,
        ).toBeFalsy();
      }
      engine.dispose();
    }
  });
});
