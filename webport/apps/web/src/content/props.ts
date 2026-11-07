/**
 * Load optimized content GLBs from /models (packages/content via vite plugin).
 * Blends with procedural interactables: authored GLBs own primary silhouettes;
 * picks (FOUP load, tool screens/keys, stamps, wafer) stay procedural.
 *
 * Room + Workbench stay procedural — Room blew scale / white-washed the camera;
 * Workbench GLB was a giant grey deck slab. Wafer stays procedural die grid.
 */

import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader.js';
import { MeshoptCompression } from '@babylonjs/core/Meshes/Compression/meshoptCompression.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { registerBuiltInLoaders } from '@babylonjs/loaders/dynamic.js';
import { applyLabel } from '../bay/labels.js';
import {
  normalizeDressedPropMaterials,
  type PropMatNormalizeSummary,
} from './prop-materials.js';

/**
 * Authored FoupGlassMat can sit recessed in the door thickness and vanish on Iris.
 * Add a proud polycarb plane over the aperture so wafers read *behind glass*.
 * Charcoal gasket + face/side ID plates sell cassette identity without mesh rewrite.
 */
function attachFoupPolycarbPane(scene: Scene, prop: LoadedProp): AbstractMesh {
  for (const m of prop.meshes) {
    const n = (m.name ?? '').toLowerCase();
    const matN = (m.material?.name ?? '').toLowerCase();
    if (n.includes('glass') || matN.includes('glass') || matN.includes('polycarb')) {
      // Keep baked glass out of the way — runtime pane owns the read.
      m.setEnabled(false);
    }
  }

  // Slightly inset aperture glass — reads as door pane, not a floating sheet.
  const pane = CreatePlane('FoupPolycarbPane', { width: 0.92, height: 1.22 }, scene);
  pane.parent = prop.root;
  // glTF root keeps a 180° Y basis — local +Z faces the inspection camera (−Z world).
  pane.position.set(0.0, 0.06, 0.58);
  pane.isPickable = false;
  pane.renderingGroupId = 1;

  const mat = new PBRMaterial('FoupPolycarbMat', scene);
  mat.albedoColor = new Color3(0.52, 0.8, 0.9);
  mat.metallic = 0;
  mat.roughness = 0.05;
  mat.alpha = 0.42;
  mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  mat.backFaceCulling = false;
  mat.needDepthPrePass = true;
  mat.environmentIntensity = 1.05;
  mat.specularIntensity = 1.25;
  mat.directIntensity = 1.2;
  mat.indexOfRefraction = 1.58;
  mat.emissiveColor = new Color3(0.14, 0.24, 0.3);
  mat.emissiveIntensity = 0.26;
  pane.material = mat;

  // Soft vertical highlight streak — classic polycarb cue under weak env maps.
  const streak = CreatePlane('FoupPolycarbStreak', { width: 0.09, height: 1.05 }, scene);
  streak.parent = pane;
  streak.position.set(0.2, 0, 0.003);
  streak.isPickable = false;
  streak.renderingGroupId = 1;
  const streakMat = new PBRMaterial('FoupPolycarbStreakMat', scene);
  streakMat.albedoColor = new Color3(0.95, 0.98, 1.0);
  streakMat.metallic = 0;
  streakMat.roughness = 0.03;
  streakMat.alpha = 0.55;
  streakMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  streakMat.backFaceCulling = false;
  streakMat.emissiveColor = new Color3(0.55, 0.72, 0.88);
  streakMat.emissiveIntensity = 0.55;
  streakMat.specularIntensity = 1.35;
  streak.material = streakMat;

  // Charcoal door gasket — frames glass as an aperture, not a floating card.
  const gasketMat = new PBRMaterial('FoupPolycarbGasketMat', scene);
  gasketMat.albedoColor = new Color3(0.12, 0.14, 0.16);
  gasketMat.metallic = 0.15;
  gasketMat.roughness = 0.72;
  gasketMat.environmentIntensity = 0.18;
  gasketMat.specularIntensity = 0.28;
  gasketMat.directIntensity = 0.9;
  for (const [i, w, h, x, y] of [
    [0, 1.02, 0.06, 0, 0.64],
    [1, 1.02, 0.06, 0, -0.64],
    [2, 0.06, 1.28, -0.49, 0],
    [3, 0.06, 1.28, 0.49, 0],
  ] as const) {
    const gasket = CreateBox(`FoupPolycarbGasket${i}`, { width: w, height: h, depth: 0.04 }, scene);
    gasket.parent = pane;
    gasket.position.set(x, y, -0.02);
    gasket.material = gasketMat;
    gasket.isPickable = false;
    gasket.renderingGroupId = 1;
    prop.meshes.push(gasket);
  }

  // Face cassette ID — diegetic FOUP language without HUD or mesh rewrite.
  const faceId = CreatePlane('FoupFaceIdPlate', { width: 0.72, height: 0.28 }, scene);
  faceId.parent = prop.root;
  faceId.position.set(0.0, -0.62, 0.62);
  faceId.isPickable = false;
  faceId.renderingGroupId = 1;
  applyLabel(faceId, scene, {
    width: 384,
    height: 144,
    fill: '#081018',
    ink: '#8af0c0',
    align: 'center',
    font: 'bold 36px monospace',
    lines: ['FOUP 300mm', 'LOT D200 · CASSETTE'],
    lineHeight: 48,
  });
  prop.meshes.push(faceId);

  // Side RFID / lot strip — readable on mild yaw (inspection orbit).
  const sideId = CreatePlane('FoupSideIdPlate', { width: 0.42, height: 0.55 }, scene);
  sideId.parent = prop.root;
  sideId.position.set(0.58, 0.05, 0.12);
  sideId.rotation.y = Math.PI / 2;
  sideId.isPickable = false;
  sideId.renderingGroupId = 1;
  applyLabel(sideId, scene, {
    width: 256,
    height: 320,
    fill: '#101820',
    ink: '#c8dce8',
    align: 'center',
    font: 'bold 28px monospace',
    lines: ['FOUP', '300mm', '║║║║║', 'D200'],
    lineHeight: 52,
  });
  prop.meshes.push(sideId);

  return pane;
}

let loadersReady = false;
function ensureLoaders(): void {
  if (loadersReady) return;
  // Content GLBs use EXT_meshopt_compression — serve decoder locally (no CDN).
  MeshoptCompression.Configuration = {
    decoder: { url: '/meshopt_decoder.js' },
  };
  registerBuiltInLoaders();
  loadersReady = true;
}

export const CONTENT_MODELS = [
  'Room',
  'Workbench',
  'Foup',
  'Wafer',
  'Inspection',
  'Console',
  'DataSlate',
  'IncidentReport',
] as const;

export type ContentModel = (typeof CONTENT_MODELS)[number];

/** Primary authored dress — shells (Room/Workbench) and die-grid Wafer stay procedural. */
const DRESS_MODELS: readonly ContentModel[] = [
  'Foup',
  'Inspection',
  'Console',
  'DataSlate',
  'IncidentReport',
];

export interface LoadedProp {
  readonly name: ContentModel;
  readonly root: TransformNode | AbstractMesh;
  readonly meshes: AbstractMesh[];
}

export interface PropLoadResult {
  readonly loaded: LoadedProp[];
  readonly missing: ContentModel[];
  readonly blended: readonly string[];
  /** Per-prop PBR normalize summaries (color space / rough / emissive). */
  readonly materials: readonly PropMatNormalizeSummary[];
}

/** Anchors from the procedural bay so props align without occluding picks. */
export interface BayPropAnchors {
  readonly bayRoot: TransformNode;
  /** Procedural meshes to hide when a matching prop loads (visual only). */
  readonly hideWhenProp?: Partial<Record<ContentModel, AbstractMesh[]>>;
  readonly foupWorld?: Vector3;
  readonly waferWorld?: Vector3;
  readonly rackWorld?: Vector3;
  readonly travelerWorld?: Vector3;
  readonly boardsWorld?: Vector3;
}

function fitUniform(meshes: AbstractMesh[], targetSize: number): number {
  let min = new Vector3(Infinity, Infinity, Infinity);
  let max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    m.computeWorldMatrix(true);
    m.refreshBoundingInfo(true, true);
    const b = m.getBoundingInfo().boundingBox;
    min = Vector3.Minimize(min, b.minimumWorld);
    max = Vector3.Maximize(max, b.maximumWorld);
  }
  const size = max.subtract(min);
  const longest = Math.max(size.x, size.y, size.z, 1e-4);
  return targetSize / longest;
}

/** Import a single GLB; returns null if fetch/parse fails. */
export async function loadProp(scene: Scene, name: ContentModel): Promise<LoadedProp | null> {
  ensureLoaders();
  try {
    const result = await SceneLoader.ImportMeshAsync('', '/models/', `${name}.glb`, scene);
    const root = result.meshes[0];
    if (!root) return null;
    root.name = `prop_${name}`;
    for (const m of result.meshes) {
      m.isPickable = false;
      m.receiveShadows = true;
    }
    return { name, root, meshes: result.meshes as AbstractMesh[] };
  } catch (err) {
    console.warn(`[Wafers Please] GLB load failed: ${name}`, err);
    return null;
  }
}

/**
 * Dress the bay with content props as primary visual roles where scale works.
 * Interactables stay authoritative for picking; matching procedural shells hide.
 */
export async function dressBayWithProps(
  scene: Scene,
  anchors: BayPropAnchors | TransformNode,
): Promise<PropLoadResult> {
  ensureLoaders();
  const cfg: BayPropAnchors = 'bayRoot' in anchors ? anchors : { bayRoot: anchors };

  const loaded: LoadedProp[] = [];
  const missing: ContentModel[] = [];
  const blended: string[] = [];
  const materials: PropMatNormalizeSummary[] = [];

  // Procedural shell owns volume / deck — catalog kept for manifest parity.
  missing.push('Room', 'Workbench', 'Wafer');
  blended.push('Room:procedural-shell', 'Workbench:procedural-deck', 'Wafer:procedural-die');

  const place: Partial<
    Record<ContentModel, { pos: Vector3; targetSize: number; rotY?: number; role: 'primary' | 'scenic' }>
  > = {
    // Hero scale — closed FOUP window + wafer stack own the inspection shot.
    Foup: {
      pos: (cfg.foupWorld ?? new Vector3(-0.7, 1.16, 0.02)).add(new Vector3(0, -0.02, 0)),
      targetSize: 1.05,
      // Door/window toward camera (−Z). Slight yaw for OHT flange + side grip depth.
      rotY: 0.12,
      role: 'primary',
    },
    // Primary metrology chassis behind diegetic screens (replaces box rack/housings).
    Inspection: {
      pos: (cfg.rackWorld ?? new Vector3(1.48, 1.38, -0.52)).add(new Vector3(0.02, -0.08, -0.04)),
      targetSize: 0.62,
      rotY: -0.32,
      role: 'primary',
    },
    // Operator console on the right deck — authored detail, not a tucked 28 cm stub.
    Console: {
      pos: new Vector3(1.18, 1.08, 0.42),
      targetSize: 0.46,
      rotY: -0.55,
      role: 'primary',
    },
    // Readable slate beside traveler — still secondary to the pickable board.
    DataSlate: {
      pos: (cfg.travelerWorld ?? new Vector3(-0.42, 1.14, 0.58)).add(new Vector3(-0.28, 0.02, 0.1)),
      targetSize: 0.3,
      rotY: 0.5,
      role: 'primary',
    },
    // Wall strip dress only — keep tiny so it never dominates rework/HEPA.
    IncidentReport: {
      pos: (cfg.boardsWorld ?? new Vector3(-0.15, 1.95, -0.55)).add(new Vector3(0.65, -0.08, 0.04)),
      targetSize: 0.2,
      rotY: -0.12,
      role: 'scenic',
    },
  };

  for (const name of DRESS_MODELS) {
    const prop = await loadProp(scene, name);
    if (!prop) {
      missing.push(name);
      continue;
    }
    const layout = place[name];
    if (layout) {
      prop.root.parent = null;
      prop.root.scaling.setAll(1);
      const scale = Math.min(fitUniform(prop.meshes, layout.targetSize), 8);
      prop.root.parent = cfg.bayRoot;
      prop.root.scaling.setAll(scale);
      prop.root.position.copyFrom(layout.pos);
      // Keep authored glTF basis quaternion (often 180° Y); euler yaw is a soft hint.
      if (layout.rotY) prop.root.rotation.y = layout.rotY;
    } else {
      prop.root.parent = cfg.bayRoot;
    }

    // Texture/material fidelity — not lighting or chamfer spam.
    materials.push(normalizeDressedPropMaterials(scene, name, prop.meshes));

    if (name === 'Foup') {
      const pane = attachFoupPolycarbPane(scene, prop);
      prop.meshes.push(pane);
      blended.push('Foup:polycarb-pane');
    }

    const hide = cfg.hideWhenProp?.[name];
    if (hide?.length) {
      for (const m of hide) {
        m.setEnabled(false);
        // Prevent setStationVisible(true) from resurrecting a replaced shell.
        m.metadata = { ...(m.metadata ?? {}), propReplaced: true };
      }
      blended.push(`${name}:${layout?.role ?? 'primary'}-hid ${hide.map((h) => h.name).join(',')}`);
    } else {
      blended.push(`${name}:${layout?.role ?? 'scenic'}`);
    }

    loaded.push(prop);
  }

  return { loaded, missing, blended, materials };
}
