import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Constants } from '@babylonjs/core/Engines/constants.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture.js';
import { Texture } from '@babylonjs/core/Materials/Textures/texture.js';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js';
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js';
import type { Scene } from '@babylonjs/core/scene.js';

/**
 * Soft albedo grain — dual-scale hash so large surfaces don't read as flat plastic
 * or wallpaper tiles. Rect/pixel only (NullEngine + WebGL2 safe).
 */
export function noiseAlbedo(
  scene: Scene,
  name: string,
  opts: {
    size?: number;
    base?: [number, number, number];
    variance?: number;
    speck?: number;
    tileHint?: 'fine' | 'coarse';
    /** Extra large-scale mottling (0–1). */
    blotch?: number;
  } = {},
): DynamicTexture {
  const size = opts.size ?? 256;
  const [br, bg, bb] = opts.base ?? [210, 200, 190];
  const variance = opts.variance ?? 18;
  const speck = opts.speck ?? 0.09;
  const blotch = opts.blotch ?? 0.55;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  // Deterministic hash — same look every load, no Math.random in materials.
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const fine = opts.tileHint === 'coarse' ? 6 : 3;
  const coarse = opts.tileHint === 'coarse' ? 24 : 14;
  for (let y = 0; y < size; y += fine) {
    for (let x = 0; x < size; x += fine) {
      const n = hash(x, y);
      const m = hash(x + 17, y + 31);
      const c = hash((x / coarse) | 0, (y / coarse) | 0);
      const d =
        (n - 0.5) * 2 * variance + (c - 0.5) * 2 * variance * blotch * 0.85;
      // Subtle cool/warm shift so cleanroom paint isn't a single grey wash.
      const warm = (hash(x + 41, y + 7) - 0.5) * variance * 0.35;
      const r = Math.max(0, Math.min(255, Math.round(br + d + warm)));
      const g = Math.max(0, Math.min(255, Math.round(bg + d * 0.9 + warm * 0.35)));
      const b = Math.max(0, Math.min(255, Math.round(bb + d * 0.78 - warm * 0.45)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, fine, fine);
      if (m < speck) {
        const s = Math.round(d * 0.55);
        ctx.fillStyle = `rgb(${Math.max(0, r + s)},${Math.max(0, g + s)},${Math.max(0, b + s)})`;
        ctx.fillRect(x, y, Math.max(1, fine / 2), Math.max(1, fine / 2));
      }
    }
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/**
 * Greyscale roughness map — breaks chrome-plastic by varying microfacet response.
 * Same hash family as noiseAlbedo (NullEngine-safe rects).
 */
export function noiseRoughness(
  scene: Scene,
  name: string,
  opts: { size?: number; base?: number; variance?: number; tileHint?: 'fine' | 'coarse' } = {},
): DynamicTexture {
  const size = opts.size ?? 128;
  const base = opts.base ?? 160;
  const variance = opts.variance ?? 48;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const cell = opts.tileHint === 'coarse' ? 8 : 3;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const n = hash(x + 3, y + 11);
      const c = hash((x / 12) | 0, (y / 12) | 0);
      const v = Math.max(0, Math.min(255, Math.round(base + (n - 0.5) * 2 * variance + (c - 0.5) * 28)));
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, cell, cell);
    }
  }
  tex.update();
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  return tex;
}

/**
 * Soft baked AO / contact darkening — used as ambientTexture for cheap contact feel
 * without a post stack (works under NullEngine + WebGL2).
 */
export function contactAo(
  scene: Scene,
  name: string,
  opts: { size?: number; edge?: number; floor?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 128;
  const edge = opts.edge ?? 0.26;
  const floor = opts.floor ?? 0.22;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const dx = Math.min(u, 1 - u);
      const dy = Math.min(v, 1 - v);
      const border = Math.min(1, Math.min(dx, dy) / edge);
      const grain = 0.88 + hash(x, y) * 0.12;
      // Deeper edge falloff — objects sit on the surface instead of floating.
      const ao = Math.max(floor, Math.min(1, (0.34 + 0.66 * border) * grain));
      const g = Math.round(ao * 255);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Soft radial contact blob — albedo for thin decal discs under FOUP / ESD / stamps.
 * Dark core → transparent rim so props ground without lighting spam.
 */
export function radialContact(
  scene: Scene,
  name: string,
  opts: { size?: number; soft?: number; core?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 96;
  const soft = opts.soft ?? 0.72;
  const core = opts.core ?? 0.12;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const maxR = Math.min(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      const fall = Math.max(0, 1 - Math.pow(Math.min(1, r / soft), 1.65));
      const grain = 0.92 + hash(x, y) * 0.08;
      const shade = Math.max(0, Math.min(1, (core + (1 - core) * (1 - fall)) * grain));
      const g = Math.round(shade * 255);
      // Alpha fades with radius so the disc reads as a soft pool, not a hard mat.
      const a = Math.round(fall * 210);
      ctx.fillStyle = `rgba(${g},${g},${Math.round(g * 0.95)},${a / 255})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/** Thin contact-shadow disc material (PBR alpha blend, NullEngine-safe). */
export function contactBlobMat(
  scene: Scene,
  name: string,
  opts?: { soft?: number; core?: number; strength?: number },
): PBRMaterial {
  const m = pbrBase(scene, name);
  const tex = radialContact(scene, `${name}_blob`, {
    size: 96,
    soft: opts?.soft ?? 0.78,
    core: opts?.core ?? 0.08,
  });
  m.albedoTexture = tex;
  m.opacityTexture = tex;
  m.albedoColor = new Color3(0.04, 0.035, 0.03);
  m.metallic = 0;
  m.roughness = 1;
  m.alpha = opts?.strength ?? 0.78;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.environmentIntensity = 0.02;
  m.specularIntensity = 0.02;
  m.directIntensity = 0.4;
  m.backFaceCulling = false;
  m.fogEnabled = false;
  return m;
}

/** Soft cleanroom IBL — plastic + brushed metal catch, no chrome softbox blowout. WebGL2-safe. */
export function installSoftEnvironment(scene: Scene): RawCubeTexture {
  const size = 32;
  const faces: Uint8Array[] = [];
  // +X −X +Y −Y +Z −Z — cool FOUP-side wall + warm ceiling, dark floor for contact.
  // Soft highlight lobes give ORM metals a specular catch without a bright chrome dome.
  const faceColors: Array<[number, number, number, number]> = [
    [214, 202, 188, 0.12], // +X console side — warm bounce
    [188, 200, 214, 0.28], // −X FOUP side — cooler rim catch
    [246, 236, 222, 0.18], // +Y ceiling softbox — warm, not blown
    [68, 64, 60, 0.04], // −Y floor — deep contact
    [222, 214, 202, 0.1], // +Z back wall
    [198, 206, 214, 0.16], // −Z camera/front — soft cool fill
  ];
  for (const [r, g, b, lobe] of faceColors) {
    const buf = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        const u = (x + 0.5) / size - 0.5;
        const v = (y + 0.5) / size - 0.5;
        const fall = 1 - Math.min(1, (u * u + v * v) * 1.85);
        // Soft off-center lobe — metals get a quiet highlight, plastics stay matte-readable.
        const hx = u - 0.12;
        const hy = v + 0.08;
        const highlight = Math.exp(-(hx * hx + hy * hy) * 9.5) * lobe;
        const k = 0.55 + 0.4 * fall + highlight;
        buf[i] = Math.min(255, Math.round(r * k));
        buf[i + 1] = Math.min(255, Math.round(g * k));
        buf[i + 2] = Math.min(255, Math.round(b * k));
        buf[i + 3] = 255;
      }
    }
    faces.push(buf);
  }
  const tex = new RawCubeTexture(
    scene,
    faces,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  tex.name = 'baySoftEnv';
  tex.coordinatesMode = Texture.SKYBOX_MODE;
  scene.environmentTexture = tex;
  // Soft IBL under the key — enough for plastic/metal ORM, not a grey wash or chrome dome.
  scene.environmentIntensity = 0.52;
  return tex;
}

/** Subtle cleanroom grade — warm midtones, stronger contrast, no purple/glow look. */
export function installCleanroomGrade(scene: Scene): void {
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  // Slightly lower exposure so a hard key doesn't white-wash cream walls.
  ip.exposure = 0.98;
  ip.contrast = 1.26;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.45;
  ip.vignetteStretch = 0.35;
  ip.vignetteColor = new Color4(0.1, 0.08, 0.06, 0);
  ip.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  const curves = new ColorCurves();
  curves.globalHue = 8;
  curves.globalDensity = 16;
  curves.globalSaturation = 8;
  curves.highlightsHue = 22;
  curves.highlightsDensity = 10;
  curves.shadowsHue = 210;
  curves.shadowsDensity = 14;
  ip.colorCurves = curves;
  ip.colorCurvesEnabled = true;
  // Apply in material forward pass — WebGL2-safe, no extra post dependency.
  ip.applyByPostProcess = false;
}

function pbrBase(scene: Scene, name: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.ambientColor = new Color3(0.08, 0.07, 0.06);
  m.environmentIntensity = 0.42;
  m.specularIntensity = 0.48;
  m.directIntensity = 1.05;
  // Default off — shell/atmosphere mats opt in; hero interactables stay crisp.
  m.fogEnabled = false;
  return m;
}

/** Opt a shell material into bay linear fog (walls/floor/distant mass). */
export function enableShellFog(mat: PBRMaterial): PBRMaterial {
  mat.fogEnabled = true;
  return mat;
}

/** Flat painted panels / plastics — dielectric, rough, controlled env. */
export function matte(scene: Scene, name: string, color: Color3, emissive = 0): PBRMaterial {
  const m = pbrBase(scene, name);
  m.albedoColor = color;
  m.metallic = 0;
  m.roughness = 0.88;
  m.environmentIntensity = 0.28;
  m.specularIntensity = 0.28;
  m.emissiveColor = color.scale(emissive);
  return m;
}

/** Matte PBR with soft noise albedo + roughness — breaks flat plastic slabs. */
export function matteNoise(
  scene: Scene,
  name: string,
  color: Color3,
  noise?: {
    variance?: number;
    speck?: number;
    size?: number;
    tileHint?: 'fine' | 'coarse';
    emissive?: number;
    blotch?: number;
    uScale?: number;
    vScale?: number;
    contactAo?: boolean;
  },
): PBRMaterial {
  const m = matte(scene, name, color, noise?.emissive ?? 0);
  const tile = noise?.tileHint ?? 'fine';
  const tex = noiseAlbedo(scene, `${name}_noise`, {
    size: noise?.size ?? 256,
    base: [
      Math.round(color.r * 255),
      Math.round(color.g * 255),
      Math.round(color.b * 255),
    ],
    variance: noise?.variance ?? 16,
    speck: noise?.speck ?? 0.08,
    tileHint: tile,
    blotch: noise?.blotch ?? 0.55,
  });
  tex.uScale = noise?.uScale ?? (tile === 'coarse' ? 1.6 : 2.8);
  tex.vScale = noise?.vScale ?? (tile === 'coarse' ? 1.4 : 2.2);
  m.albedoTexture = tex;
  // Mild tint so noise reads through solid albedoColor wash.
  m.albedoColor = new Color3(0.94, 0.93, 0.9);
  const rough = noiseRoughness(scene, `${name}_rough`, {
    size: 128,
    base: 175,
    variance: 42,
    tileHint: tile,
  });
  rough.uScale = tex.uScale;
  rough.vScale = tex.vScale;
  m.roughness = 0.82;
  m.metallicTexture = rough;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = false;
  m.metallic = 0;
  m.specularIntensity = 0.26;
  if (noise?.contactAo !== false) {
    const ao = contactAo(scene, `${name}_ao`, { size: 128, edge: 0.36, floor: 0.2 });
    m.ambientTexture = ao;
    m.ambientTextureStrength = 0.84;
  }
  m.environmentIntensity = 0.3;
  return m;
}

/**
 * Wet-bench / worktop laminate — dielectric satin epoxy (NOT metal, NOT plastic toy).
 * Distinct mid specular break vs steel (metallic) and rubber (dead matte).
 */
export function laminate(
  scene: Scene,
  name: string,
  color: Color3,
  opts?: {
    variance?: number;
    speck?: number;
    size?: number;
    tileHint?: 'fine' | 'coarse';
    blotch?: number;
    emissive?: number;
    uScale?: number;
    vScale?: number;
    contactAo?: boolean;
    /** 0 = chalky phenolic, 1 = polished epoxy. */
    polish?: number;
  },
): PBRMaterial {
  const polish = Math.max(0, Math.min(1, opts?.polish ?? 0.45));
  const m = pbrBase(scene, name);
  const tile = opts?.tileHint ?? 'fine';
  const tex = noiseAlbedo(scene, `${name}_noise`, {
    size: opts?.size ?? 256,
    base: [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)],
    variance: opts?.variance ?? 18,
    speck: opts?.speck ?? 0.1,
    tileHint: tile,
    blotch: opts?.blotch ?? 0.55,
  });
  tex.uScale = opts?.uScale ?? (tile === 'coarse' ? 1.8 : 3.2);
  tex.vScale = opts?.vScale ?? (tile === 'coarse' ? 1.5 : 1.7);
  m.albedoTexture = tex;
  m.albedoColor = new Color3(0.96, 0.94, 0.9);
  m.metallic = 0;
  // Satin dielectric — sharper than paint, duller than quartz glass.
  m.roughness = 0.62 - polish * 0.18;
  m.specularIntensity = 0.42 + polish * 0.22;
  m.environmentIntensity = 0.34 + polish * 0.12;
  m.directIntensity = 1.08;
  m.emissiveColor = color.scale(opts?.emissive ?? 0.03);
  const rough = noiseRoughness(scene, `${name}_rough`, {
    size: 128,
    base: Math.round(145 - polish * 35),
    variance: 36,
    tileHint: tile,
  });
  rough.uScale = tex.uScale;
  rough.vScale = tex.vScale;
  m.metallicTexture = rough;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = false;
  if (opts?.contactAo !== false) {
    const ao = contactAo(scene, `${name}_ao`, { size: 128, edge: 0.38, floor: 0.18 });
    m.ambientTexture = ao;
    m.ambientTextureStrength = 0.88;
  }
  return m;
}

/**
 * Brushed / painted metal — real metalness + brush roughness (not chrome-plastic laminate).
 * shine 0 = powdercoat-ish, 1 = satin tool steel.
 */
export function metal(scene: Scene, name: string, color: Color3, shine = 0.35): PBRMaterial {
  const m = pbrBase(scene, name);
  m.albedoColor = color;
  const s = Math.max(0, Math.min(1, shine));
  // Powdercoat→steel band sits clearly above dielectric laminate (metallic=0).
  m.metallic = 0.48 + s * 0.4;
  m.roughness = 0.55 - s * 0.3;
  m.environmentIntensity = 0.32 + s * 0.34;
  m.specularIntensity = 0.5 + s * 0.35;
  m.directIntensity = 1.05;
  m.emissiveColor = color.scale(0.01);
  const rough = noiseRoughness(scene, `${name}_rough`, {
    size: 128,
    base: Math.round(95 + (1 - s) * 55),
    variance: 48,
    tileHint: 'fine',
  });
  rough.uScale = 4.0;
  rough.vScale = 1.2;
  m.metallicTexture = rough;
  m.useRoughnessFromMetallicTextureGreen = true;
  m.useMetallnessFromMetallicTextureBlue = false;
  return m;
}

/** Translucent quartz tank wall — glassy dielectric, hard specular break vs laminate. */
export function quartz(scene: Scene, name: string, color?: Color3): PBRMaterial {
  const tint = color ?? new Color3(0.72, 0.88, 0.92);
  const m = pbrBase(scene, name);
  m.albedoColor = tint;
  m.metallic = 0;
  m.roughness = 0.06;
  m.alpha = 0.34;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.environmentIntensity = 0.78;
  m.specularIntensity = 0.92;
  m.directIntensity = 1.1;
  m.indexOfRefraction = 1.46;
  m.emissiveColor = tint.scale(0.08);
  return m;
}

/**
 * Radial well opacity ONLY — never use as albedo (greyscale albedo kills chemBand).
 * Center thinner so dark absorb reads; rim denser for wet edge. Mild hole (not invisible).
 */
export function wellDepthOpacity(
  scene: Scene,
  name: string,
  opts: { size?: number; core?: number; rim?: number; coreA?: number; rimA?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 96;
  const core = opts.core ?? 0.22;
  const rim = opts.rim ?? 0.85;
  const coreA = opts.coreA ?? 0.42;
  const rimA = opts.rimA ?? 0.95;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const maxR = Math.min(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a = rimA;
      if (r <= core) a = coreA;
      else if (r < rim) {
        const t = (r - core) / (rim - core);
        a = coreA + t * t * (rimA - coreA);
      }
      const g = Math.round(a * 255);
      // Opaque RGB, alpha channel carries the well hole (opacityTexture path).
      ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Chem albedo map — DARK chem-tinted center + saturated mid/rim for chemBand ~0.15–0.30.
 * Depth from dark core over black absorb; readable amber/cyan from mid ring out.
 * Never greyscale — must keep hue so Iris chemBand ≠ 0.
 */
export function wellChemAlbedo(
  scene: Scene,
  name: string,
  color: Color3,
  opts: { size?: number; core?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 128;
  const core = opts.core ?? 0.28;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const maxR = Math.min(cx, cy);
  const cr = Math.round(color.r * 255);
  const cg = Math.round(color.g * 255);
  const cb = Math.round(color.b * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Near-black core over absorb → hot mid/rim annulus (chemBand ≥0.15).
      // feel28 — Mid ≥0.94 so orbit chem survives thin glass skim; mx stays ≤210 via glowK.
      let k = 1;
      if (r <= core) k = 0.001 + (r / Math.max(core, 1e-3)) * 0.025;
      else if (r < 0.96) {
        const t = (r - core) / (0.96 - core);
        k = 0.94 + Math.pow(t, 0.4) * 0.14;
      }
      const rr = Math.max(0, Math.min(255, Math.round(cr * k)));
      const gg = Math.max(0, Math.min(255, Math.round(cg * k)));
      const bb = Math.max(0, Math.min(255, Math.round(cb * k)));
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Chem emissive map — NEAR-BLACK center + hot mid/rim.
 * Uniform emissive was washing centers chalky; this keeps rim chemBand while absorb reads.
 */
export function wellChemEmissive(
  scene: Scene,
  name: string,
  color: Color3,
  opts: { size?: number; core?: number; rimGlow?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 128;
  const core = opts.core ?? 0.34;
  const rimGlow = opts.rimGlow ?? 1.0;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const maxR = Math.min(cx, cy);
  const cr = Math.round(color.r * 255);
  const cg = Math.round(color.g * 255);
  const cb = Math.round(color.b * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      let k = rimGlow;
      if (r <= core) k = 0.0;
      else if (r < 0.94) {
        const t = (r - core) / (0.94 - core);
        k = Math.pow(t, 1.1) * rimGlow;
      }
      const rr = Math.max(0, Math.min(255, Math.round(cr * k)));
      const gg = Math.max(0, Math.min(255, Math.round(cg * k)));
      const bb = Math.max(0, Math.min(255, Math.round(cb * k)));
      ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Opacity mask for a grazing glass crescent — alpha ONLY (never chalk emissive albedo).
 * Rim-biased toward camera (−Z ≈ +v) so SpotLight paints one wet glint without covering chemBand.
 * `arc` tightens the radial band (higher = thinner rim streak).
 */
export function wetSkimStreakMap(
  scene: Scene,
  name: string,
  opts: { size?: number; core?: number; arc?: number } = {},
): DynamicTexture {
  const size = opts.size ?? 128;
  const core = opts.core ?? 0.3;
  const arc = opts.arc ?? 0.55;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const cx = (size - 1) * 0.5;
  const cy = (size - 1) * 0.5;
  const maxR = Math.min(cx, cy);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      // Tight camera-forward crescent — mask for SpotLight glass catch, not a painted arc.
      const lobe = Math.max(0, -dy * 0.92 + dx * 0.12);
      const rimStart = Math.max(core, 0.58);
      const rim = r < rimStart ? 0 : Math.min(1, (r - rimStart) / Math.max(1e-3, 0.94 - rimStart));
      const band = Math.pow(rim, arc) * (1 - Math.pow(Math.max(0, r - 0.93) / 0.08, 2));
      const a = Math.max(0, Math.min(1, band * Math.pow(lobe, 1.35) * 0.95));
      const g = Math.round(Math.min(255, a * 255));
      ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.hasAlpha = true;
  tex.update();
  tex.wrapU = Texture.CLAMP_ADDRESSMODE;
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;
  return tex;
}

/**
 * Chemistry bath volume — translucent wet body over dark absorb.
 * Readable chem hue (chemBand ~15–30%) + darker center via albedo map; neonHot≈0.
 * feel26 — dielectric clearcoat body under glass skim (not chalky emissive fill).
 */
export function bathFill(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = pbrBase(scene, name);
  // Translucent wet body — open center so dark absorb reads; rim carries chem hue.
  m.albedoColor = new Color3(1, 1, 1);
  const chemMap = wellChemAlbedo(scene, `${name}_chemAlb`, color, { size: 128, core: 0.34 });
  m.albedoTexture = chemMap;
  m.metallic = 0;
  m.roughness = 0.08;
  m.alpha = 0.4;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.needDepthPrePass = true;
  m.environmentIntensity = 0.55;
  m.specularIntensity = 0.85;
  m.emissiveColor = new Color3(1, 1, 1);
  m.emissiveTexture = wellChemEmissive(scene, `${name}_chemEm`, color, {
    size: 128,
    core: 0.4,
    rimGlow: 0.5,
  });
  m.directIntensity = 0.8;
  m.indexOfRefraction = 1.38;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 0.65;
  m.clearCoat.roughness = 0.1;
  const depth = wellDepthOpacity(scene, `${name}_wellOp`, {
    size: 96,
    core: 0.38,
    rim: 0.8,
    coreA: 0.0,
    rimA: 0.88,
  });
  m.opacityTexture = depth;
  return m;
}

/**
 * Wet bath free surface — thin high-IOR glass skim ABOVE chem/absorb.
 * feel28 — zero chalk emissive; rim-only glass so chemBand ≥0.15 stays orbit-readable.
 */
export function wetSurface(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = pbrBase(scene, name);
  // Near-black dielectric — hue only as a whisper so chem ring stays the color carrier.
  m.albedoColor = new Color3(0.015, 0.018, 0.022).add(color.scale(0.006));
  m.metallic = 0.0;
  m.roughness = 0.01;
  m.alpha = 0.14;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.needDepthPrePass = true;
  m.environmentIntensity = 2.6;
  m.specularIntensity = 3.8;
  m.emissiveColor = new Color3(0, 0, 0);
  m.directIntensity = 2.6;
  m.indexOfRefraction = 1.52;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.01;
  // Open through chem annulus — feel27 rimA=0.72 washed chemBand to ~0.12 chalk.
  const depth = wellDepthOpacity(scene, `${name}_surfOp`, {
    size: 96,
    core: 0.58,
    rim: 0.98,
    coreA: 0.0,
    rimA: 0.4,
  });
  m.opacityTexture = depth;
  return m;
}

/**
 * Grazing glass crescent — opacity mask + high-IOR dielectric (NO chalk emissive).
 * feel28 — SpotLight wet glint on outer rim only; chemBand annulus stays uncovered.
 */
export function wetSkimCatch(scene: Scene, name: string): PBRMaterial {
  const m = pbrBase(scene, name);
  // Tighter crescent than feel27 — orbit glint without soft-washing chem mid-ring.
  const streak = wetSkimStreakMap(scene, `${name}_catchMap`, { size: 128, core: 0.62, arc: 1.05 });
  // Black glass body — specular only where opacity mask opens (never baked white albedo).
  m.albedoColor = new Color3(0.02, 0.025, 0.03);
  m.metallic = 0;
  m.roughness = 0.006;
  m.alpha = 0.62;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.needDepthPrePass = true;
  m.environmentIntensity = 2.8;
  m.specularIntensity = 4.4;
  m.directIntensity = 3.0;
  m.indexOfRefraction = 1.55;
  m.emissiveColor = new Color3(0, 0, 0);
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.006;
  m.opacityTexture = streak;
  return m;
}

/**
 * Wet chem color carrier — saturated mid/rim for chemBand ≥0.15; open core over absorb.
 * feel26 — under glass skim; keep Iris isChem punch (glow≈0.89).
 * `hole` widens the open core (QDR uses larger hole so Iris darkDelta stays positive).
 */
export function wetChemTop(
  scene: Scene,
  name: string,
  color: Color3,
  glow = 0.08,
  hole = 0.28,
): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  // Unlit emissive chem — lighting crushed hue below Iris isChem (r/g/b>140).
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  m.disableLighting = true;
  const core = Math.min(Math.max(hole, 0.16), 0.5);
  const chemMap = wellChemAlbedo(scene, `${name}_chemAlb`, color, { size: 128, core });
  // Cap so mx≲210 (neonHot uses mx>220); feel28 allows 0.91 for chemBand floor.
  const glowK = Math.min(Math.max(glow, 0.86), 0.91);
  m.emissiveColor = new Color3(glowK, glowK, glowK);
  m.emissiveTexture = chemMap;
  m.diffuseTexture = chemMap;
  m.alpha = 0.95;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.fogEnabled = false;
  // Center hole over absorbTop; mid→rim opaque for chemBand.
  const depth = wellDepthOpacity(scene, `${name}_chemOp`, {
    size: 96,
    core,
    rim: Math.min(0.9, core + 0.42),
    coreA: 0.0,
    rimA: 1.0,
  });
  m.opacityTexture = depth;
  return m;
}

/**
 * Solid saturated chem annulus (no radial dark map) — chemBand punch under glass skim.
 * Use on torus/ring meshes that already open the pool middle over absorb.
 */
export function wetChemRing(scene: Scene, name: string, color: Color3, glow = 0.88): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  m.disableLighting = true;
  // Bake hue into a tiny albedo so emissive matches wetChemTop brightness path.
  const glowK = Math.min(Math.max(glow, 0.86), 0.91);
  const tex = wellChemAlbedo(scene, `${name}_ringAlb`, color, { size: 32, core: 0.0 });
  m.emissiveColor = new Color3(glowK, glowK, glowK);
  m.emissiveTexture = tex;
  m.diffuseTexture = tex;
  m.alpha = 0.97;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.fogEnabled = false;
  return m;
}

/**
 * Unlit near-black well floor — SpotLights cannot wash centerL (darkDelta lever).
 */
export function absorbWell(scene: Scene, name: string): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = new Color3(0, 0, 0);
  m.specularColor = new Color3(0, 0, 0);
  m.emissiveColor = new Color3(0.003, 0.003, 0.004);
  m.disableLighting = true;
  m.fogEnabled = false;
  return m;
}

/**
 * Capillary rim — dark high-IOR glass meniscus (SpotLight Fresnel, not chalk paint).
 * feel27 — kill cool-white emissive annulus that read as dry clay from orbit.
 */
export function wetRimFresnel(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = pbrBase(scene, name);
  // Dark glass bead — chem tint whisper only; specular owns the wet edge.
  m.albedoColor = new Color3(0.08, 0.1, 0.12).add(color.scale(0.04));
  m.metallic = 0;
  m.roughness = 0.01;
  m.alpha = 0.42;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.backFaceCulling = false;
  m.needDepthPrePass = true;
  m.environmentIntensity = 2.5;
  m.specularIntensity = 3.8;
  m.emissiveColor = new Color3(0, 0, 0);
  m.directIntensity = 2.6;
  m.indexOfRefraction = 1.52;
  m.clearCoat.isEnabled = true;
  m.clearCoat.intensity = 1.0;
  m.clearCoat.roughness = 0.01;
  return m;
}

/** CMP slurry — milky dielectric fluid. */
export function slurry(scene: Scene, name: string, color: Color3 = new Color3(0.62, 0.78, 0.88)): PBRMaterial {
  const m = pbrBase(scene, name);
  m.albedoColor = color;
  m.metallic = 0;
  m.roughness = 0.42;
  m.alpha = 0.6;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  m.environmentIntensity = 0.34;
  m.specularIntensity = 0.48;
  m.emissiveColor = color.scale(0.16);
  return m;
}

/** Silicon wafer — cool semi-metal with a hard specular edge (readable under Iris GL). */
export function silicon(scene: Scene, name: string, color: Color3): PBRMaterial {
  const m = pbrBase(scene, name);
  m.albedoColor = color;
  m.metallic = 0.55;
  m.roughness = 0.16;
  m.environmentIntensity = 0.88;
  m.specularIntensity = 0.95;
  m.directIntensity = 1.08;
  m.emissiveColor = color.scale(0.16);
  return m;
}

/**
 * Soft rubber / ESD / hose — dark dielectric, dead specular (opposite of quartz/steel).
 * Optional noise + contact AO so ESD mats ground instead of reading as pasted black slabs.
 */
export function rubber(
  scene: Scene,
  name: string,
  color: Color3,
  opts?: {
    noise?: boolean;
    variance?: number;
    speck?: number;
    contactAo?: boolean;
    uScale?: number;
    vScale?: number;
  },
): PBRMaterial {
  const m = pbrBase(scene, name);
  m.albedoColor = color;
  m.metallic = 0;
  m.roughness = 0.97;
  m.environmentIntensity = 0.06;
  m.specularIntensity = 0.08;
  m.directIntensity = 0.85;
  m.emissiveColor = color.scale(0.015);
  if (opts?.noise) {
    const tex = noiseAlbedo(scene, `${name}_noise`, {
      size: 128,
      base: [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)],
      variance: opts.variance ?? 14,
      speck: opts.speck ?? 0.16,
      tileHint: 'fine',
      blotch: 0.55,
    });
    tex.uScale = opts.uScale ?? 3.2;
    tex.vScale = opts.vScale ?? 2.4;
    m.albedoTexture = tex;
    m.albedoColor = new Color3(0.92, 0.9, 0.88);
    const rough = noiseRoughness(scene, `${name}_rough`, {
      size: 96,
      base: 210,
      variance: 28,
      tileHint: 'fine',
    });
    rough.uScale = tex.uScale;
    rough.vScale = tex.vScale;
    m.metallicTexture = rough;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = false;
  }
  if (opts?.contactAo !== false && opts?.noise) {
    const ao = contactAo(scene, `${name}_ao`, { size: 96, edge: 0.3, floor: 0.16 });
    m.ambientTexture = ao;
    m.ambientTextureStrength = 0.92;
  }
  return m;
}

/** Lit paper / printed traveler surface. */
export function paper(scene: Scene, name: string, tint = new Color3(0.94, 0.92, 0.86)): PBRMaterial {
  return matte(scene, name, tint, 0.1);
}

/**
 * Soft glow for instrument screens / lamps.
 * Kept as StandardMaterial so existing `.diffuseColor` mutations stay valid.
 */
export function screenGlow(scene: Scene, name: string, color: Color3): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = new Color3(0.08, 0.09, 0.1);
  m.emissiveColor = color.scale(0.65);
  m.fogEnabled = false;
  return m;
}

/** Emissive strip / indicator — Standard for cheap diffuse/emissive swaps. */
export function lamp(scene: Scene, name: string, color: Color3, strength = 0.85): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = color;
  m.specularColor = Color3.Black();
  m.emissiveColor = color.scale(strength);
  m.fogEnabled = false;
  return m;
}

export const COLORS = {
  floor: new Color3(0.64, 0.6, 0.54),
  floorTile: new Color3(0.72, 0.68, 0.62),
  // Warm cream walls — break the plastic grey wash.
  wall: new Color3(0.96, 0.92, 0.86),
  wallTrim: new Color3(0.58, 0.5, 0.42),
  ceiling: new Color3(0.96, 0.93, 0.88),
  bench: new Color3(0.3, 0.3, 0.3),
  benchTop: new Color3(0.56, 0.52, 0.46),
  accent: new Color3(0.16, 0.82, 0.6),
  warn: new Color3(0.9, 0.64, 0.14),
  fault: new Color3(0.86, 0.22, 0.16),
  stampAccept: new Color3(0.12, 0.68, 0.4),
  stampReject: new Color3(0.82, 0.16, 0.14),
  stampRework: new Color3(0.88, 0.58, 0.1),
  wafer: new Color3(0.38, 0.52, 0.78),
  waferLit: new Color3(0.7, 0.8, 0.98),
  quartz: new Color3(0.72, 0.88, 0.92),
  sc1: new Color3(0.25, 0.55, 0.75),
  sc2: new Color3(0.75, 0.45, 0.2),
  ink: new Color3(0.1, 0.12, 0.16),
  // Fab teal plastic pod (matches reauthored Foup.glb) — not soft grey crate.
  foup: new Color3(0.22, 0.55, 0.6),
  foupDoor: new Color3(0.16, 0.2, 0.24),
  rack: new Color3(0.18, 0.2, 0.23),
  housing: new Color3(0.26, 0.28, 0.3),
} as const;
