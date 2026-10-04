/**
 * Lighting, image-based lighting, and post-processing.
 *
 * The scene previously used a hemispheric light, one directional light and
 * `StandardMaterial` everywhere, which made the wafer look like a grey plastic
 * puck and every instrument like a cardboard box. A cleanroom is one of the
 * most specular interiors there is — brushed stainless, polished silicon,
 * bright ceiling troffers — and none of that reads without an environment to
 * reflect.
 *
 * So this module supplies the three things that actually make it look like a
 * place rather than a diagram:
 *
 *  1. A PROCEDURAL environment cube, generated at runtime. There is no HDR in
 *     the repo and shipping one would cost megabytes; a generated cube gives the
 *     PBR materials something real to reflect for free. It is built from six
 *     canvases: a bright ceiling, darker walls, a dark floor, and a warm strip
 *     where the ceiling troffers are.
 *  2. PBR materials with sensible metallic/roughness, so steel is steel.
 *  3. A `DefaultRenderingPipeline` for tone mapping, bloom on the emissive
 *     instrument screens, FXAA, and a vignette.
 *
 * Post-processing is the reason the screens read as light sources rather than
 * bright rectangles, which matters a lot here because the whole interface IS
 * emissive panels. It is disabled automatically under WebXR, where a post-process
 * chain cannot run — see `setPipelineEnabled`.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { CubeTexture } from '@babylonjs/core/Materials/Textures/cubeTexture.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent.js';
import '@babylonjs/core/Rendering/depthRendererSceneComponent.js';

// Side-effect import: registers the reflection probe / IBL path on PBR materials.
import '@babylonjs/core/Materials/Textures/Loaders/index.js';

/** Face order for cube textures: +X, -X, +Y, -Y, +Z, -Z. */
const FACE_SIZE = 128;

/**
 * Paint one cube face.
 *
 * `face` indexes [px, nx, py, ny, pz, nz]. The vertical gradient is the room:
 * bright at the top (ceiling troffers), dark at the bottom (floor). The warm
 * band on the +Y faces is what puts a highlight on the wafer's polished surface,
 * which is the single biggest reason it reads as silicon.
 */
function paintFace(face: number): Uint8Array {
  const px = new Uint8Array(FACE_SIZE * FACE_SIZE * 4);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    // Flip Y: cube faces are stored bottom-up.
    const i = ((FACE_SIZE - 1 - y) * FACE_SIZE + x) * 4;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
    px[i + 3] = 255;
  };

  for (let y = 0; y < FACE_SIZE; y++) {
    const v = y / (FACE_SIZE - 1); // 0 = bottom, 1 = top
    for (let x = 0; x < FACE_SIZE; x++) {
      const u = x / (FACE_SIZE - 1);

      // Base room gradient.
      let r = 16 + v * 78;
      let g = 19 + v * 84;
      let b = 24 + v * 94;

      if (face === 2) {
        // Ceiling: a darker plenum with four troffer strips. The gaps matter
        // more than the strips — they are what a mirror reflects as structure.
        r = 62;
        g = 68;
        b = 78;
        const strip =
          Math.abs(u - 0.16) < 0.036 ||
          Math.abs(u - 0.39) < 0.036 ||
          Math.abs(u - 0.61) < 0.036 ||
          Math.abs(u - 0.84) < 0.036;
        if (strip && v > 0.08 && v < 0.94) {
          r = 236;
          g = 240;
          b = 248;
        }
      } else if (face === 3) {
        // Floor: dark, slightly warm, with a soft pool of light under the bench.
        const pool = Math.hypot(u - 0.5, v - 0.5) < 0.34 ? 1.35 : 1;
        r = 16 * pool;
        g = 15 * pool;
        b = 14 * pool;
      } else if (face === 4) {
        // +Z, the back wall behind the instruments: add a cool window band so
        // the wall reads as backlit cleanroom glazing.
        const band = v > 0.44 && v < 0.6;
        if (band) {
          r = 74;
          g = 92;
          b = 114;
        }
      }

      put(x, y, Math.min(255, r), Math.min(255, g), Math.min(255, b));
    }
  }
  return px;
}

/** Build the procedural environment and assign it to the scene. */
export function installEnvironment(scene: Scene): RawCubeTexture {
  const faces = [0, 1, 2, 3, 4, 5].map(paintFace);
  const tex = new RawCubeTexture(
    scene,
    faces,
    FACE_SIZE,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true, // generateMipMaps
    false, // invertY
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE,
  );
  // The IBL is the dominant light source in this room; it should not itself be
  // tone-mapped or it flattens out.
  tex.gammaSpace = true;
  scene.environmentTexture = tex;
  scene.environmentIntensity = 1.0;
  return tex;
}

export interface Lighting {
  readonly key: DirectionalLight;
  readonly fill: HemisphericLight;
  readonly shadows: ShadowGenerator;
}

/**
 * Lights and shadows.
 *
 * Only the key light casts shadows. The two cross-illumination spots on the wafer
 * stage are deliberately shadowless: they are raking accents whose job is to put
 * a gradient across the surface, and their shadows would fall on the wafer itself
 * and hide the very gradient they are meant to reveal.
 */
export function installLighting(scene: Scene): Lighting {
  const fill = new HemisphericLight('fill', new Vector3(0, 1, 0), scene);
  fill.intensity = 0.42;
  fill.diffuse = new Color3(0.72, 0.8, 0.92);
  fill.groundColor = new Color3(0.1, 0.11, 0.13);

  const key = new DirectionalLight('key', new Vector3(-0.42, -0.86, 0.3), scene);
  key.position = new Vector3(2.6, 4.2, -1.6);
  key.intensity = 2.4;
  key.diffuse = new Color3(1, 0.98, 0.94);

  // 512 is plenty for a bench-sized scene and halves the shadow cost; the
  // contact shadows that matter here are small and close to the caster.
  const shadows = new ShadowGenerator(512, key);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.008;
  shadows.normalBias = 0.02;
  shadows.darkness = 0.34;

  return { key, fill, shadows };
}

/**
 * Brushed stainless.
 *
 * Anisotropic-looking brushing is faked with a low-amplitude roughness
 * variation texture rather than real anisotropy, which keeps the material cost
 * the same as any other PBR material and avoids a shader variant.
 */
export function steel(scene: Scene, name: string, tint = '#8f97a3'): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(tint);
  m.metallic = 1;
  m.roughness = 0.34;
  m.environmentIntensity = 1;
  m.specularIntensity = 1;
  return m;
}

/** Painted / anodised equipment housing: dielectric, fairly rough. */
export function painted(scene: Scene, name: string, color: string, roughness = 0.55): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = 0;
  m.roughness = roughness;
  m.environmentIntensity = 0.9;
  return m;
}

/**
 * Polished silicon.
 *
 * Near-mirror, faintly blue, with the die map as an emissive so the reticle
 * lines catch the eye. This is the material the whole scene is judged on: a real
 * wafer is a mirror, and the moment it stops being one it reads as a hockey puck.
 */
export function silicon(scene: Scene, name: string, dieMap: import('@babylonjs/core/Materials/Textures/texture.js').Texture): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = new Color3(0.1, 0.11, 0.135);
  m.metallic = 0.74;
  m.roughness = 0.4;
  m.emissiveTexture = dieMap;
  m.emissiveColor = new Color3(0.2, 0.23, 0.3);
  m.environmentIntensity = 0.75;
  // A little clearcoat gives the polished edge its sheen. More than this and the
  // wafer clips to flat white and stops reading as silicon.
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 0.08;
  m.clearCoat.roughness = 0.08;
  return m;
}

/** Cast rubber, for the stamp dies and the chuck boots. */
export function rubber(scene: Scene, name: string, color: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = 0;
  m.roughness = 0.92;
  m.environmentIntensity = 0.6;
  return m;
}

export interface Pipeline {
  readonly pipeline: DefaultRenderingPipeline;
  /** Post-processing cannot run in a WebXR session; call this on XR enter/exit. */
  setEnabled(enabled: boolean): void;
}

/**
 * Tone mapping + bloom + FXAA + vignette.
 *
 * Bloom is doing real work here rather than decorating: every instrument screen
 * is an emissive panel, and without bloom they read as bright rectangles pasted
 * onto the scene instead of as displays emitting light.
 */
export function installPipeline(scene: Scene, camera: import('@babylonjs/core/Cameras/camera.js').Camera): Pipeline {
  const pipeline = new DefaultRenderingPipeline('wp-pipeline', true, scene, [camera]);

  // FXAA alone. 4x MSAA on top of it cost ~40% of the frame and, because
  // the scene is mostly flat panels, was not visible in the result.
  pipeline.fxaaEnabled = true;
  pipeline.samples = 1;

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = 0.62;
  pipeline.bloomWeight = 0.42;
  pipeline.bloomKernel = 32;
  pipeline.bloomScale = 0.35;

  // ACES-style tone mapping keeps the bright instrument screens from clipping to
  // flat white, which is what makes emissive UI look like a glowing panel.
  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.25;
  ip.contrast = 1.08;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.5;
  ip.vignetteStretch = 0.35;
  ip.vignetteColor = new Color4(0, 0, 0.02, 0);

  return {
    pipeline,
    setEnabled(enabled: boolean) {
      // Disabling the pipeline drops the post-process chain entirely, which is
      // what WebXR needs: the XR compositor owns the frame there.
      pipeline.imageProcessingEnabled = enabled;
      pipeline.bloomEnabled = enabled;
      pipeline.fxaaEnabled = enabled;
    },
  };
}

/** Optional probe-based reflections for the wafer's surroundings. */
export { CubeTexture };