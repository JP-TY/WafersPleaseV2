/**
 * Babylon scene bootstrap.
 *
 * All imports are explicit deep paths. Barrel imports from `@babylonjs/core`
 * defeat tree-shaking and ship the whole engine — the port plan flags this as a
 * hard requirement, and `pnpm build` output is the check.
 */

import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { steel } from './scene/lighting.js';
import '@babylonjs/core/Materials/standardMaterial.js';
// Side-effect import that registers the ray/picking pipeline. With deep ES6
// imports `scene.pick` is present on the API but silently never hits anything
// without it -- the barrel import used to pull this in as a side effect.
// Symptom: the instrument renders but is completely unclickable.
import '@babylonjs/core/Culling/ray.js';
// glTF lives in @babylonjs/loaders in Babylon 9, not @babylonjs/core.
import '@babylonjs/loaders/glTF/2.0/index.js';

export interface Stage {
  engine: Engine;
  scene: Scene;
  camera: ArcRotateCamera;
  canvas: HTMLCanvasElement;
}

/**
 * Frame the inspection workspace.
 *
 * The old default framed a single instrument at bench height. The workspace is
 * wider than it is tall — wafer stage centre, clipboard left, stamp bank right,
 * instrument rack above and behind, briefing board on the back wall — so the
 * camera sits back far enough to hold all of it, and looks slightly downward at
 * a seated eye height. Set from `main.ts` via `frameWorkspace`.
 */
/**
 * Whether this phase is a reading phase -- the camera looks at the back wall board
 * rather than at the bench.
 *
 * Exported because the follow camera has to stand down for these. It owns the
 * camera target while the player is at the workstation, and a paper-weighted
 * briefing or a debrief board that the camera refuses to stay on is not readable
 * at any distance.
 */
export function isReadingPhase(phase: string, quizOpen: boolean): boolean {
  return (
    phase === 'Progression' ||
    phase === 'Briefing' ||
    phase === 'Debrief' ||
    phase === 'Complete' ||
    (phase === 'EndOfDay' && quizOpen)
  );
}

export function frameWorkspace(camera: ArcRotateCamera, opts: { phase?: string; quizOpen?: boolean } = {}): void {
  // alpha = -PI/2 puts the viewer on -Z looking toward +Z, matching LAYOUT in
  // inspection/bay.ts. beta is measured from +Y, so beta = PI/2 is horizontal.
  //
  // EndOfDay counts as "reading" while the §12 quiz is up, otherwise the review
  // board sits unreadably small on the back wall while the camera is still framed
  // on the bench.
  const reading = isReadingPhase(opts.phase ?? '', opts.quizOpen === true);
  camera.alpha = -Math.PI / 2;
  if (reading) {
    // The paperwork phases look at the board on the back wall, from far enough
    // back that the full 1.86 m panel fits in frame.
    camera.setTarget(new Vector3(0, 1.98, 1.9));
    camera.beta = 1.5;
    camera.radius = 2.1;
  } else {
    // Working view: wafer stage centred, clipboard and stamps flanking, rack
    // above. Pitched down a little, from a seated eye height.
    //
    // Pulled back from 1.82 to 2.3 m with the target dropped to 1.3. At 1.82 the
    // operator's head sat below the bottom of the frame: a person standing at the
    // bench is 1.6 m tall and the camera is pitched down at the instruments, so
    // framing tightly on the instruments framed out the person using them. The
    // instruments are large enough (a 1.15 m screen) to stay readable at 2.3 m.
    camera.setTarget(new Vector3(0, 1.3, 0.1));
    camera.beta = 1.36;
    camera.radius = 2.3;
  }
  camera.lowerRadiusLimit = 0.8;
  camera.upperRadiusLimit = 4;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  // WebGL2 is the required production renderer for WebXR: WebGPU-in-WebXR is
  // still experimental in Quest Browser, so WebGPU stays a feature-detected
  // enhancement rather than the baseline.
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true,
  }, true);

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.043, 0.055, 0.078, 1);

  // Framed on the instrument at bench height, close enough that panel text is
  // legible. Radius is generous enough for a seated VR user to lean in.
  const camera = new ArcRotateCamera('cam', -Math.PI / 2, Math.PI / 2, 1.35, new Vector3(0, 1.42, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 0.55;
  camera.upperRadiusLimit = 6;
  camera.fov = 0.9;
  // 1 unit = 1 metre, per the VR guidance. Eye height ~1.6 m seated.
  camera.wheelPrecision = 40;

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera, canvas };
}

/**
 * Unlit emissive material — for anything that IS a light source or a screen.
 *
 * Kept as `StandardMaterial` with `disableLighting` rather than a PBR material on
 * purpose: these panels must emit at exactly the value painted into them. A PBR
 * material would multiply the panel by the environment and tone mapping, so a
 * dim reading would lift toward the room's brightness and the instrument would
 * stop being readable as a measurement.
 */
export function emissive(scene: Scene, name: string, color: Color3, texture?: Texture): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = Color3.Black();
  mat.specularColor = Color3.Black();
  mat.emissiveColor = color;
  mat.disableLighting = true;
  if (texture) {
    mat.diffuseTexture = texture;
    mat.emissiveTexture = texture;
  }
  return mat;
}

/**
 * Matte surface for room geometry.
 *
 * A PBR material so room surfaces pick up the environment. The specular argument
 * becomes roughness, which is the PBR equivalent and what the eye actually reads:
 * a low-gloss floor and a high-gloss bench need different numbers here, and the
 * old specular scale could not express that distinction.
 */
export function matte(scene: Scene, name: string, color: Color3, specular = 0.04): PBRMaterial {
  const mat = new PBRMaterial(name, scene);
  mat.albedoColor = color;
  // specular 0.04 (very matte) -> roughness 0.95; specular 0.4 (glossy) -> 0.2
  mat.roughness = Math.max(0.12, Math.min(0.98, 1 - specular * 2.4));
  mat.metallic = 0;
  mat.environmentIntensity = 0.7;
  return mat;
}

/**
 * Mount a `Panel`'s texture onto a physical screen mesh.
 *
 * This is what makes the UI diegetic: the instrument is an object in the room,
 * not an overlay. The GDD is explicit that there are "no traditional floating
 * HUD elements or video game menu bars".
 */
export function screenFromPanel(
  scene: Scene,
  panelTexture: Texture,
  name: string,
  width: number,
  height: number,
): AbstractMesh {
  const screen = CreatePlane(name, { width, height }, scene);
  const mat = emissive(scene, `${name}-mat`, new Color3(0.85, 0.9, 0.95), panelTexture);
  screen.material = mat;
  return screen;
}

/**
 * Bezel so a screen reads as embedded hardware rather than a floating quad.
 *
 * Kept close behind the panel (2 cm) and only slightly larger. An earlier
 * version sat 6 cm back, which perspective slid visibly up and to the side so it
 * read as a large dark slab rather than a frame.
 */
export function bezel(scene: Scene, name: string, w: number, h: number, depth = 0.02): AbstractMesh {
  const b = CreateBox(name, { width: w + 0.035, height: h + 0.035, depth }, scene);
  b.material = steel(scene, `${name}-mat`, '#6d757f');
  return b;
}

/** Floor plane. Present so props have a ground reference and shadows read. */
export function floor(scene: Scene, size = 14): AbstractMesh {
  const g = CreateGround('floor', { width: size, height: size }, scene);
  g.material = matte(scene, 'floor-mat', new Color3(0.13, 0.14, 0.16), 0.02);
  return g;
}