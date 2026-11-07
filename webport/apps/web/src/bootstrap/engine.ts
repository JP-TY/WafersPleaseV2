import { Engine } from '@babylonjs/core/Engines/engine.js';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import '@babylonjs/core/Culling/ray.js';

export interface Stage {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
}

/**
 * Default orbit — camera on −Z looking +Z into the bay (matches board/label facing).
 * Constraints: cam.z ≳ -1.45 (back wall ≈ -1.65) AND cam.y ≲ 1.9 (under FFU
 * skirts). Prior r≈3.35 exterior wall-crop; β≈1.02 put cam.y≈2.3 into HEPA mass.
 */
export const DEFAULT_TARGET = new Vector3(-0.15, 1.08, 0.42);
export const DEFAULT_RADIUS = 2.2;
export const DEFAULT_ALPHA = -Math.PI / 2 + 0.48;
export const DEFAULT_BETA = 1.24;

/**
 * Bootstrap a WebGL2 Babylon stage.
 *
 * WebGL2 is required for WebXR. Tests pass a NullEngine via `createNullStage`.
 */
export function createStage(canvas: HTMLCanvasElement): Stage {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
    disableWebGL2Support: false,
  });
  const scene = new Scene(engine);
  // Warm cleanroom void — slightly lifted so fogged far mass reads as bay air, not a black hole.
  scene.clearColor = new Color4(0.36, 0.33, 0.3, 1);
  scene.ambientColor.set(0.14, 0.13, 0.12);
  // Linear fog — shell mats opt in; hero FOUP/wafer/stamps keep fogEnabled=false.
  // Start farther so +Z niche/cove/HEPA behind triad stay readable before fog wash.
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogStart = 2.8;
  scene.fogEnd = 6.2;
  scene.fogColor = new Color3(0.4, 0.37, 0.34);

  const camera = new ArcRotateCamera(
    'bayCam',
    DEFAULT_ALPHA,
    DEFAULT_BETA,
    DEFAULT_RADIUS,
    DEFAULT_TARGET.clone(),
    scene,
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 0.85;
  camera.upperRadiusLimit = 5.8;
  camera.lowerBetaLimit = 0.4;
  camera.upperBetaLimit = Math.PI / 2 - 0.06;
  camera.wheelPrecision = 42;
  camera.panningSensibility = 0;
  camera.minZ = 0.05;
  camera.fov = 0.85;
  camera.inertia = 0.82;

  engine.runRenderLoop(() => {
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera };
}

/** Headless stage for vitest / NullEngine playability guards. */
export function createNullStage(): Stage {
  const engine = new NullEngine({
    renderWidth: 1024,
    renderHeight: 768,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 1);
  const camera = new ArcRotateCamera(
    'nullCam',
    DEFAULT_ALPHA,
    DEFAULT_BETA,
    DEFAULT_RADIUS,
    DEFAULT_TARGET.clone(),
    scene,
  );
  camera.lowerRadiusLimit = 0.85;
  camera.upperRadiusLimit = 5.8;
  return { engine, scene, camera };
}

/** Frame the inspection workspace. Set limits before radius (§4.4). */
export function frameWorkspace(
  camera: ArcRotateCamera,
  target = DEFAULT_TARGET.clone(),
  radius = DEFAULT_RADIUS,
): void {
  // Limits first so a tight radius (tests / close-ups) is never clamped away.
  camera.lowerRadiusLimit = Math.min(0.85, radius);
  camera.upperRadiusLimit = Math.max(5.8, radius);
  camera.setTarget(target);
  camera.radius = radius;
  camera.alpha = DEFAULT_ALPHA;
  camera.beta = DEFAULT_BETA;
  camera.fov = 1.0;
  camera.getViewMatrix();
}

/** Pull in on the briefing board so BEGIN SHIFT is the first readable CTA. */
export function frameBriefing(camera: ArcRotateCamera): void {
  // Stay under the FFU bank (cam.y ≲ 1.9) so BEGIN SHIFT is not occluded by HEPA frames.
  frameWorkspace(camera, new Vector3(-0.1, 1.35, 0.15), 2.15);
  camera.alpha = -Math.PI / 2 + 0.35;
  camera.beta = 1.25;
  camera.fov = 0.95;
  camera.getViewMatrix();
}

/**
 * Frame FOUP + wafer stage + stamps (traveler if present) after begin/load.
 * cam.z ≳ -1.45 (no wall-crop) and cam.y ≲ 1.9 (under FFU, not HEPA-face crop).
 *
 * Prior tight r≈1.3 / β≈1.15 looked down onto the deck so back-wall niche/cove/HEPA
 * sat above the frustum — Iris crop read as flat tan void despite geometry existing.
 */
export function frameFoup(camera: ArcRotateCamera): void {
  // −Z orbit (FOUP face-on); +Z niche cove/HEPA behind triad. Keep cam.y ≲ 1.9.
  // Bias target −X so left FOV eats scenic mass / FOUP, not empty tan wall.
  // Babylon: z = t.z + r·sinβ·sinα — keep cam.z ≳ -1.45 under the FFU bank.
  frameWorkspace(camera, new Vector3(-0.28, 1.28, 0.22), 1.62);
  camera.alpha = -Math.PI / 2 + 0.32;
  camera.beta = 1.3;
  camera.fov = 1.05;
  camera.getViewMatrix();
}

/** Full inspection bay after wafer load — same inside-room / under-HEPA constraints. */
export function frameInspection(camera: ArcRotateCamera): void {
  // Playable triad stays hero; +Z niche/cove/HEPA must land above the deck in Iris
  // (not a coplanar tan plate). cam.y ≲ 1.9 / cam.z ≳ -1.45 / HEPA band ≥0.6.
  // Mild +X orbit so left jamb / soffit / HEPA + mid-bay carts layer as recessed mass,
  // not a face-on picture frame. −X target bias keeps left FOV on dark scenic, not cream.
  // Slightly tighter + higher target so mid-bay carts/island fill FOV (not sparse void).
  frameWorkspace(camera, new Vector3(-0.22, 1.28, 0.42), 1.48);
  camera.alpha = -Math.PI / 2 + 0.32;
  camera.beta = 1.3;
  camera.fov = 0.96;
  camera.getViewMatrix();
}

/**
 * Frame a rework bench looking into the open sash (−Z operator face).
 * Camera stays forward of the back wall (≈ z=-1.65) so the shot reads as
 * wet bench + walls/floor/cove — not an exterior grey slab or open void.
 *
 * Babylon: x = t.x + r·sinβ·cosα; z = t.z + r·sinβ·sinα.
 * Prior r≈2.2 / +0.95 yaw was a rear-¾ furniture-ledge crop with chem ≪1% ROI.
 * Closer frontal orbit (small +X yaw, r≲1.4) punches baths while cam.z ≳ -1.45.
 *
 * Babylon: pos.y = target.y + radius * cos(beta); β→π/2 is more horizontal.
 */
export function frameBench(camera: ArcRotateCamera, target: Vector3, radius = 2.35): void {
  camera.lowerRadiusLimit = 0.85;
  camera.upperRadiusLimit = 5.8;
  // Feel22 — oblique enough for wall-band / liquid stack; chem tops still readable.
  camera.setTarget(target.clone().add(new Vector3(0.02, -0.02, -0.02)));
  camera.radius = Math.min(radius, 1.02);
  camera.alpha = -Math.PI / 2 + 0.22;
  // β≈1.08 exposes concentric rim→wall→liquid→floor silhouette.
  camera.beta = 1.08;
  camera.fov = 1.0;
  // Sync derived .position (NullEngine otherwise keeps the construction-time orbit).
  // Do NOT call rebuildAnglesAndRadius — that recomputes radius from the stale position.
  camera.getViewMatrix();
}
