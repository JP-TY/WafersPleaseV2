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
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
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

  new HemisphericLight('ambient', new Vector3(0, 1, 0), scene).intensity = 0.42;
  const key = new DirectionalLight('key', new Vector3(-0.5, -1, -0.45), scene);
  key.intensity = 0.85;
  key.position = new Vector3(3, 5, 2.5);

  engine.runRenderLoop(() => scene.render());
  window.addEventListener('resize', () => engine.resize());

  return { engine, scene, camera, canvas };
}

/** Unlit emissive material — for anything that is a light source or a screen. */
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

/** Matte surface for room geometry. */
export function matte(scene: Scene, name: string, color: Color3, specular = 0.04): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(specular, specular, specular);
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
  b.material = matte(scene, `${name}-mat`, new Color3(0.19, 0.21, 0.24), 0.16);
  return b;
}

/** Floor plane. Present so props have a ground reference and shadows read. */
export function floor(scene: Scene, size = 14): AbstractMesh {
  const g = CreateGround('floor', { width: size, height: size }, scene);
  g.material = matte(scene, 'floor-mat', new Color3(0.13, 0.14, 0.16), 0.02);
  return g;
}