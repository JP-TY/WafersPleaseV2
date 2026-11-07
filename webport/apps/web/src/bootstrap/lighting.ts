import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { PointLight } from '@babylonjs/core/Lights/pointLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { SSAO2RenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline.js';
import type { Camera } from '@babylonjs/core/Cameras/camera.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import { installCleanroomGrade, installSoftEnvironment } from './materials.js';

export interface BayLighting {
  readonly key: DirectionalLight;
  readonly task: SpotLight;
  readonly fill: HemisphericLight;
  readonly rim: DirectionalLight;
  readonly bounce: PointLight;
  /** Cool grazing rim locked to FOUP — short range so HEPA/walls stay dark. */
  readonly foupRim: SpotLight;
  /** Soft front fill for FOUP plastic/ORM — dies before bay wash. */
  readonly foupFill: PointLight;
  readonly shadows: ShadowGenerator;
  readonly ssao: SSAO2RenderingPipeline | null;
  addCaster(mesh: AbstractMesh): void;
}

/** FOUP world seat — local lights orbit this, not the bay center. */
const FOUP_WORLD = new Vector3(-0.7, 1.16, 0.1);

/**
 * Cleanroom lighting: stronger directional key + soft fill/IBL + optional SSAO2.
 * Form reads from light/dark — fill stays under the key so surfaces don't white-wash.
 * FOUP gets short-range rim/fill so baked albedo + ORM read without white-washing HEPA.
 */
export function installLighting(scene: Scene, camera?: Camera): BayLighting {
  installSoftEnvironment(scene);
  installCleanroomGrade(scene);

  const fill = new HemisphericLight('fill', new Vector3(0.05, 1, 0.1), scene);
  // Soft ambient canopy only — must stay well below key so forms keep real light/dark.
  fill.intensity = 0.38;
  fill.diffuse = new Color3(0.96, 0.93, 0.9);
  fill.groundColor = new Color3(0.18, 0.16, 0.14);

  // Harder key angle + higher intensity — primary form light / cast shadows.
  const key = new DirectionalLight('key', new Vector3(-0.42, -0.92, 0.28), scene);
  key.position = new Vector3(2.1, 5.2, -0.4);
  key.intensity = 0.92;
  key.diffuse = new Color3(1, 0.97, 0.92);

  // Cool rim from −X picks FOUP edge off the warm wall (kept soft so it doesn't flatten).
  const rim = new DirectionalLight('rim', new Vector3(0.75, -0.3, -0.5), scene);
  rim.position = new Vector3(-2.5, 2.5, 1.5);
  rim.intensity = 0.22;
  rim.diffuse = new Color3(0.82, 0.9, 1);

  // Soft bounce under the deck — cheap contact fill without a second shadow map.
  const bounce = new PointLight('bounce', new Vector3(0.1, 0.55, 0.35), scene);
  bounce.intensity = 0.2;
  bounce.diffuse = new Color3(1, 0.9, 0.8);
  bounce.range = 3.0;

  // Task cone biased toward closed FOUP window / extracted wafer / stamps.
  const task = new SpotLight(
    'task',
    new Vector3(-0.62, 2.3, 0.28),
    new Vector3(-0.12, -1, -0.08),
    Math.PI / 2.9,
    24,
    scene,
  );
  task.intensity = 0.58;
  task.diffuse = new Color3(1, 0.97, 0.9);
  task.range = 5.2;

  // Specular kick on the extracted wafer — aim at disc, not the FOUP door face.
  const waferSpec = new SpotLight(
    'waferSpec',
    new Vector3(0.05, 1.78, -0.15),
    new Vector3(-0.55, -0.7, 0.35),
    Math.PI / 5.8,
    52,
    scene,
  );
  waferSpec.intensity = 0.55;
  waferSpec.diffuse = new Color3(0.86, 0.94, 1);
  waferSpec.range = 1.35;

  // Local FOUP rim: cool graze from −X / +Z so shell bevels + ORM metal trim catch light.
  // Short range + downward aim — must not lift the HEPA top band.
  const foupRimDir = FOUP_WORLD.subtract(new Vector3(-1.55, 1.5, 0.55)).normalize();
  const foupRim = new SpotLight(
    'foupRim',
    new Vector3(-1.55, 1.5, 0.55),
    foupRimDir,
    Math.PI / 3.4,
    32,
    scene,
  );
  foupRim.intensity = 0.38;
  foupRim.diffuse = new Color3(0.74, 0.86, 1);
  foupRim.range = 1.55;

  // Local FOUP fill: warm operator-side kick so the camera face isn't a chalk silhouette.
  const foupFill = new PointLight('foupFill', new Vector3(-0.55, 1.34, -0.32), scene);
  foupFill.intensity = 0.28;
  foupFill.diffuse = new Color3(1, 0.94, 0.86);
  foupFill.range = 1.35;

  const shadows = new ShadowGenerator(1024, key);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 28;
  // Darker contact without crushing to black voids (0 = black, 1 = invisible).
  shadows.setDarkness(0.22);
  shadows.bias = 0.0008;

  let ssao: SSAO2RenderingPipeline | null = null;
  const cam = camera ?? scene.activeCamera;
  if (cam && SSAO2RenderingPipeline.IsSupported) {
    try {
      ssao = new SSAO2RenderingPipeline(
        'baySsao',
        scene,
        { ssaoRatio: 0.55, blurRatio: 0.85 },
        [cam],
      );
      ssao.totalStrength = 1.55;
      ssao.radius = 2.05;
      ssao.base = 0.18;
      ssao.samples = 14;
      ssao.maxZ = 48;
      ssao.expensiveBlur = true;
      ssao.bilateralSamples = 12;
      ssao.bilateralSoften = 0.35;
      ssao.bilateralTolerance = 0.25;
    } catch {
      // Geometry-buffer path can fail on some headless / soft-GL configs — keep lights.
      ssao = null;
    }
  }

  return {
    key,
    task,
    fill,
    rim,
    bounce,
    foupRim,
    foupFill,
    shadows,
    ssao,
    addCaster(mesh) {
      shadows.addShadowCaster(mesh);
    },
  };
}
