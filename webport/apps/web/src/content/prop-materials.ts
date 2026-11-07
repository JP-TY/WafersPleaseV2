/**
 * Post-load PBR normalize for dressed content GLBs.
 *
 * Authored dress props ship contrast-stretched albedo + ORM (metal/rough) when
 * reauthor pipeline has run; older GLBs may still be albedo+normal only. This
 * pass fixes color space, prefers authored ORM (else synthesizes roughness),
 * and lights screen-bearing props via albedo-as-emissive — without touching
 * procedural interactable screens.
 */

import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import type { BaseTexture } from '@babylonjs/core/Materials/Textures/baseTexture.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';
import { noiseRoughness } from '../bootstrap/materials.js';
import type { ContentModel } from './props.js';

export interface PropMatProfile {
  /** Multiplier on albedoTexture.level (1 = untouched). */
  readonly albedoLevel: number;
  /** Multiplies albedoColor — >1 punches washed midtones. */
  readonly albedoPunch: Color3;
  readonly metallic: number;
  readonly roughness: number;
  /** Roughness-map base (0–255) when synthesizing metallicTexture. */
  readonly roughBase: number;
  readonly roughVariance: number;
  readonly environmentIntensity: number;
  readonly directIntensity: number;
  readonly specularIntensity: number;
  /** Normal map strength. */
  readonly bumpLevel: number;
  /** Use albedo as emissiveTexture for CRT / slate / panel glow. */
  readonly emissiveFromAlbedo: boolean;
  readonly emissiveColor: Color3;
  readonly emissiveIntensity: number;
  /** Per-material forward contrast (SwiftShader-safe, no post stack). */
  readonly contrast: number;
  readonly exposure: number;
}

const PROFILES: Partial<Record<ContentModel, PropMatProfile>> = {
  // Fab-blue FOUP — hard polycarb dielectric; slightly cooler punch for cassette read.
  Foup: {
    albedoLevel: 1.18,
    albedoPunch: new Color3(0.9, 1.1, 1.22),
    metallic: 1,
    roughness: 1,
    roughBase: 122,
    roughVariance: 34,
    environmentIntensity: 0.32,
    directIntensity: 1.1,
    specularIntensity: 0.46,
    bumpLevel: 1.42,
    emissiveFromAlbedo: false,
    emissiveColor: Color3.Black(),
    emissiveIntensity: 0,
    contrast: 1.2,
    exposure: 1.03,
  },
  // Metrology chassis — ORM carries metal/rough; keep panel glow from baked HUD icons.
  Inspection: {
    albedoLevel: 1.12,
    albedoPunch: new Color3(1.08, 1.05, 1.02),
    metallic: 0.26,
    roughness: 0.48,
    roughBase: 130,
    roughVariance: 58,
    environmentIntensity: 0.3,
    directIntensity: 1.14,
    specularIntensity: 0.52,
    bumpLevel: 1.5,
    emissiveFromAlbedo: true,
    emissiveColor: new Color3(0.2, 0.24, 0.16),
    emissiveIntensity: 0.7,
    contrast: 1.18,
    exposure: 1.02,
  },
  // CRT console — keep the green screen win; ORM + CRT emissive (env capped vs chrome blowout).
  Console: {
    albedoLevel: 1.1,
    albedoPunch: new Color3(1.08, 1.05, 1.02),
    metallic: 0.18,
    roughness: 0.44,
    roughBase: 128,
    roughVariance: 56,
    environmentIntensity: 0.28,
    directIntensity: 1.14,
    specularIntensity: 0.52,
    bumpLevel: 1.45,
    emissiveFromAlbedo: true,
    // Lift dark-green CRT out of black under SwiftShader.
    emissiveColor: new Color3(0.32, 0.55, 0.28),
    emissiveIntensity: 1.45,
    contrast: 1.16,
    exposure: 1.03,
  },
  // Slate with keypad glow — dielectric body, soft emissive for ink/keys.
  DataSlate: {
    albedoLevel: 1.12,
    albedoPunch: new Color3(1.08, 1.05, 1.02),
    metallic: 0.1,
    roughness: 0.5,
    roughBase: 138,
    roughVariance: 44,
    environmentIntensity: 0.24,
    directIntensity: 1.14,
    specularIntensity: 0.46,
    bumpLevel: 1.3,
    emissiveFromAlbedo: true,
    emissiveColor: new Color3(0.16, 0.28, 0.18),
    emissiveIntensity: 0.85,
    contrast: 1.2,
    exposure: 1.02,
  },
  // Wall strip paper/plastic — contrast only, no glow.
  IncidentReport: {
    albedoLevel: 1.24,
    albedoPunch: new Color3(1.18, 1.14, 1.1),
    metallic: 0,
    roughness: 0.75,
    roughBase: 170,
    roughVariance: 36,
    environmentIntensity: 0.18,
    directIntensity: 1.12,
    specularIntensity: 0.3,
    bumpLevel: 1.2,
    emissiveFromAlbedo: false,
    emissiveColor: Color3.Black(),
    emissiveIntensity: 0,
    contrast: 1.3,
    exposure: 1.02,
  },
};

const DEFAULT_PROFILE: PropMatProfile = {
  albedoLevel: 1.2,
  albedoPunch: new Color3(1.14, 1.1, 1.06),
  metallic: 0.05,
  roughness: 0.58,
  roughBase: 150,
  roughVariance: 42,
  environmentIntensity: 0.24,
  directIntensity: 1.14,
  specularIntensity: 0.42,
  bumpLevel: 1.25,
  emissiveFromAlbedo: false,
  emissiveColor: Color3.Black(),
  emissiveIntensity: 0,
  contrast: 1.25,
  exposure: 1.03,
};

export interface PropMatNormalizeSummary {
  readonly name: ContentModel;
  readonly materials: number;
  readonly albedoGamma: number;
  readonly bumpLinear: number;
  readonly roughMaps: number;
  readonly emissive: number;
  readonly skippedScreens: number;
}

function isInteractableScreenMaterial(mat: PBRMaterial): boolean {
  const n = (mat.name ?? '').toLowerCase();
  if (n.includes('screenglow') || n.includes('toolscreen') || n.includes('screen_')) return true;
  const meta = mat.metadata as { interactableScreen?: boolean; propNormalized?: boolean } | null;
  if (meta?.interactableScreen) return true;
  return false;
}

/** Separate polycarb FOUP window — keep alpha/IOR; don't punch opaque bake profile onto it. */
function isFoupGlassMaterial(mat: PBRMaterial): boolean {
  const n = (mat.name ?? '').toLowerCase();
  if (n.includes('glass') || n.includes('polycarb')) return true;
  return (
    mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHABLEND &&
    mat.alpha < 0.95 &&
    (mat.metallic ?? 0) < 0.08
  );
}

function polishFoupGlass(mat: PBRMaterial): void {
  mat.albedoColor = new Color3(0.62, 0.84, 0.92);
  mat.metallic = 0;
  mat.roughness = 0.06;
  // Opaque enough that Iris reads a pane; still see wafers behind.
  mat.alpha = Math.min(0.52, Math.max(0.36, mat.alpha || 0.42));
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.backFaceCulling = false;
  mat.needDepthPrePass = true;
  mat.environmentIntensity = 0.95;
  mat.specularIntensity = 1.15;
  mat.directIntensity = 1.15;
  mat.indexOfRefraction = 1.58;
  mat.emissiveColor = new Color3(0.14, 0.2, 0.24);
  mat.emissiveIntensity = 0.22;
  mat.albedoTexture = null;
  mat.metallicTexture = null;
  mat.metadata = { ...(mat.metadata ?? {}), propNormalized: true, propName: 'FoupGlass' };
}

function fixColorSpace(albedo: BaseTexture | null, bump: BaseTexture | null): { albedoGamma: boolean; bumpLinear: boolean } {
  let albedoGamma = false;
  let bumpLinear = false;
  if (albedo) {
    // BaseColor must be sRGB/gamma — linear sampling washes midtones muddy.
    albedo.gammaSpace = true;
    albedoGamma = true;
  }
  if (bump) {
    // Normal/data maps must stay linear.
    bump.gammaSpace = false;
    bumpLinear = true;
  }
  return { albedoGamma, bumpLinear };
}

/**
 * Normalize PBR materials on a dressed prop's meshes.
 * Skips StandardMaterial / interactable screen mats so tool CRTs stay authoritative.
 */
export function normalizeDressedPropMaterials(
  scene: Scene,
  name: ContentModel,
  meshes: readonly AbstractMesh[],
): PropMatNormalizeSummary {
  const profile = PROFILES[name] ?? DEFAULT_PROFILE;
  const seen = new Set<PBRMaterial>();
  let materials = 0;
  let albedoGamma = 0;
  let bumpLinear = 0;
  let roughMaps = 0;
  let emissive = 0;
  let skippedScreens = 0;

  for (const mesh of meshes) {
    // Never touch pickable interactables even if parented under a prop root.
    if (mesh.isPickable) {
      skippedScreens++;
      continue;
    }
    const mat = mesh.material;
    if (!(mat instanceof PBRMaterial)) continue;
    if (seen.has(mat)) continue;
    seen.add(mat);

    if (isInteractableScreenMaterial(mat)) {
      skippedScreens++;
      continue;
    }
    const meta = (mat.metadata ?? {}) as { propNormalized?: boolean };
    if (meta.propNormalized) continue;

    if (name === 'Foup' && isFoupGlassMaterial(mat)) {
      polishFoupGlass(mat);
      materials++;
      continue;
    }

    materials++;
    const spaces = fixColorSpace(mat.albedoTexture, mat.bumpTexture);
    if (spaces.albedoGamma) albedoGamma++;
    if (spaces.bumpLinear) bumpLinear++;

    if (mat.albedoTexture) {
      // Force sRGB sampling intent. Getter may still report false when the GPU
      // uses an sRGB buffer (conversion already done) — both paths are valid.
      mat.albedoTexture.gammaSpace = true;
      mat.albedoTexture.level = profile.albedoLevel;
    }
    mat.albedoColor = profile.albedoPunch;
    mat.ambientColor = new Color3(0.03, 0.028, 0.024);

    // Prefer authored metallicRoughnessTexture (ORM: G=rough, B=metal). Else
    // synthesize micro-rough so SwiftShader doesn't shade every face as chalk.
    const authoredOrm =
      !!mat.metallicTexture && !String(mat.metallicTexture.name ?? '').startsWith('propRough_');
    if (!mat.metallicTexture) {
      const rough = noiseRoughness(scene, `propRough_${name}_${mat.name || materials}`, {
        size: 128,
        base: profile.roughBase,
        variance: profile.roughVariance,
        tileHint: 'fine',
      });
      rough.uScale = 3.2;
      rough.vScale = 2.4;
      rough.gammaSpace = false;
      mat.metallicTexture = rough;
      roughMaps++;
      mat.useRoughnessFromMetallicTextureGreen = true;
      mat.useMetallnessFromMetallicTextureBlue = false;
      mat.metallic = profile.metallic;
      mat.roughness = profile.roughness;
    } else {
      mat.metallicTexture.gammaSpace = false;
      roughMaps++;
      mat.useRoughnessFromMetallicTextureGreen = true;
      if (authoredOrm && name === 'Foup') {
        // Authored ORM carries plastic body (B≈0.03) + chrome latch/wafer edges (B≈0.8).
        // Absolute ORM metal/rough — same path as Console chassis trim.
        mat.useMetallnessFromMetallicTextureBlue = true;
        mat.useRoughnessFromMetallicTextureGreen = true;
        mat.metallic = 1;
        mat.roughness = 1;
      } else if (authoredOrm) {
        // Console / Inspection — absolute ORM metal/rough reads (chassis + trim).
        mat.useMetallnessFromMetallicTextureBlue = true;
        mat.metallic = 1;
        mat.roughness = 1;
      } else {
        mat.useMetallnessFromMetallicTextureBlue = false;
        mat.metallic = profile.metallic;
        mat.roughness = profile.roughness;
      }
    }

    mat.environmentIntensity = profile.environmentIntensity;
    mat.directIntensity = profile.directIntensity;
    mat.specularIntensity = profile.specularIntensity;

    if (mat.bumpTexture) {
      mat.bumpTexture.level = profile.bumpLevel;
      mat.bumpTexture.gammaSpace = false;
    }

    // Per-prop contrast punch — forward path only (no extra post dependency).
    const ipc = new ImageProcessingConfiguration();
    ipc.contrast = profile.contrast;
    ipc.exposure = profile.exposure;
    ipc.toneMappingEnabled = true;
    ipc.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
    ipc.applyByPostProcess = false;
    mat.imageProcessingConfiguration = ipc;

    if (profile.emissiveFromAlbedo && mat.albedoTexture) {
      mat.emissiveTexture = mat.albedoTexture;
      mat.emissiveColor = profile.emissiveColor;
      mat.emissiveIntensity = profile.emissiveIntensity;
      emissive++;
    } else {
      // Keep authored emissive if present; otherwise kill residual wash glow.
      if (!mat.emissiveTexture) {
        mat.emissiveColor = Color3.Black();
        mat.emissiveIntensity = 0;
      }
    }

    mat.metadata = { ...meta, propNormalized: true, propName: name };
  }

  return { name, materials, albedoGamma, bumpLinear, roughMaps, emissive, skippedScreens };
}

/** Normalize every loaded dressed prop; returns per-prop summaries. */
export function normalizeLoadedPropMaterials(
  scene: Scene,
  loaded: readonly { name: ContentModel; meshes: AbstractMesh[] }[],
): PropMatNormalizeSummary[] {
  return loaded.map((p) => normalizeDressedPropMaterials(scene, p.name, p.meshes));
}
