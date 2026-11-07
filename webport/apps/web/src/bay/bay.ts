import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { ToolType } from '@wafers/data';
import { COLORS, matte, matteNoise, metal, lamp, laminate, contactAo, contactBlobMat, noiseAlbedo, noiseRoughness, enableShellFog, rubber } from '../bootstrap/materials.js';
import type { BayLighting } from '../bootstrap/lighting.js';
import { WaferStage } from './wafer-stage.js';
import { Foup } from './foup.js';
import { InstrumentCluster } from './instruments.js';
import { Traveler } from './traveler.js';
import { StampBank } from './stamps.js';
import { PhaseBoards } from './boards.js';
import { applyLabel } from './labels.js';

export interface Bay {
  readonly root: TransformNode;
  readonly stage: WaferStage;
  readonly foup: Foup;
  readonly instruments: InstrumentCluster;
  readonly traveler: Traveler;
  readonly stamps: StampBank;
  readonly boards: PhaseBoards;
  /** Procedural shells safe to hide when matching GLBs load. */
  readonly scenicShells: {
    readonly bench: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
    readonly backWall: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
    readonly foupBody: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
    readonly foupShell: readonly import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh[];
    readonly instrumentChassis: readonly import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh[];
  };
  /** Register content GLBs that must leave the slot when a rework cabinet opens. */
  parkScenicProps(meshes: readonly import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh[]): void;
  setStationVisible(visible: boolean): void;
}

function floorMat(scene: Scene): PBRMaterial {
  const tex = new DynamicTexture('floorGridTex', { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  // Dual-scale grain + warm/cool tile tint — vinyl ESD floor, not plastic slab.
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < 512; y += 3) {
    for (let x = 0; x < 512; x += 3) {
      const d = (hash(x, y) - 0.5) * 26;
      const blotch = (hash((x / 18) | 0, (y / 18) | 0) - 0.5) * 18;
      const warm = (hash(x + 9, y + 3) - 0.5) * 10;
      const r = Math.max(0, Math.min(255, Math.round(148 + d + blotch + warm)));
      const g = Math.max(0, Math.min(255, Math.round(140 + d * 0.9 + blotch * 0.85 + warm * 0.3)));
      const b = Math.max(0, Math.min(255, Math.round(128 + d * 0.75 + blotch * 0.7 - warm * 0.4)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 3, 3);
    }
  }
  ctx.strokeStyle = '#9a9288';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    const p = (i / 8) * 512;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 512);
    ctx.moveTo(0, p);
    ctx.lineTo(512, p);
    ctx.stroke();
  }
  // Soft tile checker — subtle, not a plastic checkerboard.
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,245,230,0.07)';
        ctx.fillRect(x * 64, y * 64, 64, 64);
      } else {
        ctx.fillStyle = 'rgba(40,36,32,0.04)';
        ctx.fillRect(x * 64, y * 64, 64, 64);
      }
    }
  }
  tex.update();
  tex.uScale = 4.2;
  tex.vScale = 3.4;
  const m = new PBRMaterial('floorMat', scene);
  m.albedoTexture = tex;
  m.albedoColor = new Color3(0.94, 0.91, 0.86);
  m.metallic = 0;
  m.roughness = 0.82;
  m.environmentIntensity = 0.32;
  m.specularIntensity = 0.28;
  m.emissiveColor = new Color3(0.035, 0.032, 0.028);
  m.ambientColor = new Color3(0.1, 0.09, 0.08);
  // Floor participates in bay fog so the far deck falls off into atmosphere.
  m.fogEnabled = true;
  return m;
}

function hepaFaceMat(scene: Scene, name: string): PBRMaterial {
  const tex = new DynamicTexture(name + 'Tex', { width: 256, height: 256 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#b8c2cc';
  ctx.fillRect(0, 0, 256, 256);
  // Fine media weave
  ctx.strokeStyle = '#9aa6b2';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 32; i++) {
    const p = (i / 32) * 256;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  // Coarse FFU cell borders
  ctx.strokeStyle = '#6e7884';
  ctx.lineWidth = 4;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * 256;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, 256);
    ctx.moveTo(0, p);
    ctx.lineTo(256, p);
    ctx.stroke();
  }
  tex.update();
  const m = matte(scene, name, new Color3(0.78, 0.82, 0.88), 0.1);
  m.albedoTexture = tex;
  m.emissiveColor = new Color3(0.07, 0.075, 0.085);
  return m;
}

/**
 * Build the diegetic training bay (GDD §13 / §15).
 * Procedural-first cleanroom shell — readable without content GLBs.
 */
export function buildBay(scene: Scene, tools: readonly ToolType[], lighting?: BayLighting): Bay {
  const root = new TransformNode('bay', scene);

  // --- Room shell -----------------------------------------------------------
  // Wide + deep so rework FOV rays hit floor/walls (shallow 5.6 depth opened a +Z clearColor void).
  const ROOM_W = 11.0;
  const ROOM_D = 8.4;
  const WALL_X = ROOM_W / 2 - 0.04;
  const WALL_Z_FRONT = ROOM_D / 2 - 0.1;

  const floor = CreateBox('floor', { width: ROOM_W, height: 0.06, depth: ROOM_D }, scene);
  floor.parent = root;
  floor.position.y = -0.03;
  const floorMaterial = floorMat(scene);
  {
    const rough = noiseRoughness(scene, 'floorRough', { size: 128, base: 180, variance: 40, tileHint: 'coarse' });
    rough.uScale = 4.2;
    rough.vScale = 3.4;
    floorMaterial.metallicTexture = rough;
    floorMaterial.useRoughnessFromMetallicTextureGreen = true;
    floorMaterial.useMetallnessFromMetallicTextureBlue = false;
    const ao = contactAo(scene, 'floorAo', { size: 96, edge: 0.18 });
    floorMaterial.ambientTexture = ao;
    floorMaterial.ambientTextureStrength = 0.65;
  }
  floor.material = floorMaterial;
  floor.receiveShadows = true;
  floor.isPickable = false;

  // Shared wall grain — stronger mottling so cream walls aren't flat plastic fill.
  const wallPaint = enableShellFog(
    matteNoise(scene, 'wallMat', COLORS.wall, {
      variance: 16,
      speck: 0.07,
      size: 512,
      tileHint: 'fine',
      blotch: 0.7,
      emissive: 0.04,
      uScale: 1.9,
      vScale: 1.55,
    }),
  );

  const back = CreateBox('backWall', { width: ROOM_W, height: 3.0, depth: 0.08 }, scene);
  back.parent = root;
  back.position.set(0, 1.5, -1.65);
  back.material = wallPaint;
  back.isPickable = false;

  const left = CreateBox('leftWall', { width: 0.08, height: 3.0, depth: ROOM_D }, scene);
  left.parent = root;
  left.position.set(-WALL_X, 1.5, 0.1);
  left.material = wallPaint;
  left.isPickable = false;

  const right = CreateBox('rightWall', { width: 0.08, height: 3.0, depth: ROOM_D }, scene);
  right.parent = root;
  right.position.set(WALL_X, 1.5, 0.1);
  right.material = wallPaint;
  right.isPickable = false;

  // Far +Z wall — closes the clearColor hole when rework FOV looks past the old shallow floor.
  const front = CreateBox('frontWall', { width: ROOM_W, height: 3.0, depth: 0.08 }, scene);
  front.parent = root;
  front.position.set(0, 1.5, WALL_Z_FRONT);
  front.material = wallPaint;
  front.isPickable = false;

  const ceiling = CreateBox('ceiling', { width: ROOM_W, height: 0.06, depth: ROOM_D }, scene);
  ceiling.parent = root;
  ceiling.position.set(0, 3.02, 0.1);
  ceiling.material = enableShellFog(matte(scene, 'ceilingMat', COLORS.ceiling, 0.14));
  ceiling.isPickable = false;

  // Back-right shell fill — extends the back wall into the ¾ FOV so +X doesn't open to clearColor.
  // (A near side-wing at cam.x occluded the whole bench; keep mass on the back plane.)
  // Dark housing (never cream wall) — cream wings were the Iris tan peek on rework flanks.
  const wingMat = enableShellFog(
    matteNoise(scene, 'rightWingMat', new Color3(0.3, 0.32, 0.35), {
      variance: 15,
      speck: 0.06,
      size: 256,
      tileHint: 'coarse',
      blotch: 0.72,
      emissive: 0.022,
      uScale: 1.8,
      vScale: 1.5,
    }),
  );
  wingMat.emissiveColor = new Color3(0.04, 0.038, 0.035);
  const backRight = CreateBox('rightWing', { width: 4.2, height: 2.95, depth: 0.1 }, scene);
  backRight.parent = root;
  backRight.position.set(2.4, 1.48, -1.52);
  backRight.material = wingMat;
  backRight.isPickable = false;
  const backRightCove = CreateBox('rightWingCove', { width: 4.0, height: 0.14, depth: 0.12 }, scene);
  backRightCove.parent = root;
  backRightCove.position.set(2.4, 1.9, -1.42);
  backRightCove.material = lamp(scene, 'rightWingCoveMat', new Color3(1, 0.9, 0.74), 1.4);
  backRightCove.isPickable = false;
  // Far +X return — kept out of rework/inspection cam (prior x≈2.05 ate ¾ framing as a grey pillar).
  const sideCloser = CreateBox('rightWingReturn', { width: 0.1, height: 2.5, depth: 1.4 }, scene);
  sideCloser.parent = root;
  sideCloser.position.set(3.35, 1.35, -0.85);
  sideCloser.material = wingMat;
  sideCloser.isPickable = false;
  const sideCloserCove = CreateBox('rightWingReturnCove', { width: 0.08, height: 0.1, depth: 1.2 }, scene);
  sideCloserCove.parent = root;
  sideCloserCove.position.set(3.28, 1.9, -0.85);
  sideCloserCove.material = lamp(scene, 'rightWingReturnCoveMat', new Color3(1, 0.9, 0.74), 1.15);
  sideCloserCove.isPickable = false;

  // Filter-ceiling mass — deep FFU waffle above dropped canopy (~1.26) / rework cam.
  // Faces ~2.18 with deep hanging skirts so upper third is dark waffle, not beige void.
  const hepaMatShared = hepaFaceMat(scene, 'hepaFace');
  const hepaFrameMat = metal(scene, 'hepaFrameMat', new Color3(0.48, 0.5, 0.54), 0.12);
  const plenumMat = matte(scene, 'hepaPlenumMat', new Color3(0.62, 0.64, 0.68), 0.06);
  const tbarMat = metal(scene, 'hepaTbarMat', new Color3(0.58, 0.6, 0.64), 0.18);

  const plenum = CreateBox('hepaPlenum', { width: ROOM_W - 0.3, height: 0.24, depth: ROOM_D - 0.5 }, scene);
  plenum.parent = root;
  plenum.position.set(0, 2.52, 0.15);
  plenum.material = plenumMat;
  plenum.isPickable = false;

  // Perimeter softbox under the plenum lip — keep it above cam so it doesn't wash the shot.
  const coveRing = CreateBox('coveRing', { width: ROOM_W - 0.55, height: 0.08, depth: ROOM_D - 0.85 }, scene);
  coveRing.parent = root;
  coveRing.position.set(0, 2.38, 0.15);
  coveRing.material = lamp(scene, 'coveRingMat', new Color3(1, 0.9, 0.74), 0.7);
  coveRing.isPickable = false;

  const FFU_W = 1.0;
  const FFU_D = 0.82;
  const FFU_PITCH_X = 1.12;
  const FFU_PITCH_Z = 0.92;
  let hepaIdx = 0;
  for (let zi = -2; zi <= 2; zi++) {
    for (let xi = -4; xi <= 4; xi++) {
      const x = xi * FFU_PITCH_X;
      const z = zi * FFU_PITCH_Z + 0.1;
      // Deep frame — vertical waffle mass hanging into the upper FOV above the canopy.
      const frame = CreateBox(`hepaFrame_${hepaIdx}`, { width: FFU_W, height: 0.48, depth: FFU_D }, scene);
      frame.parent = root;
      frame.position.set(x, 2.28, z);
      frame.material = hepaFrameMat;
      frame.isPickable = false;
      // Recessed filter face — hangs above dropped canopy so underside fills upper third.
      const panel = CreateBox(`hepa_${hepaIdx}`, { width: FFU_W - 0.14, height: 0.06, depth: FFU_D - 0.14 }, scene);
      panel.parent = root;
      panel.position.set(x, 2.1, z);
      panel.material = hepaMatShared;
      panel.isPickable = false;
      const hub = CreateCylinder(`hepaHub_${hepaIdx}`, { diameter: 0.22, height: 0.04, tessellation: 12 }, scene);
      hub.parent = root;
      hub.position.set(x, 2.14, z);
      hub.material = hepaFrameMat;
      hub.isPickable = false;
      // Deep hanging skirt — fills the gap above the lowered canopy with dark waffle mass.
      const skirt = CreateBox(`hepaSkirt_${hepaIdx}`, { width: FFU_W - 0.04, height: 0.22, depth: FFU_D - 0.04 }, scene);
      skirt.parent = root;
      skirt.position.set(x, 1.96, z);
      skirt.material = hepaFrameMat;
      skirt.isPickable = false;
      hepaIdx++;
    }
  }

  // T-bar runners under the skirts.
  for (let xi = -4; xi <= 5; xi++) {
    const runner = CreateBox(`hepaRunnerX_${xi}`, { width: 0.055, height: 0.08, depth: FFU_PITCH_Z * 5 + 0.2 }, scene);
    runner.parent = root;
    runner.position.set(xi * FFU_PITCH_X - FFU_PITCH_X * 0.5, 1.88, 0.1);
    runner.material = tbarMat;
    runner.isPickable = false;
  }
  for (let zi = -2; zi <= 3; zi++) {
    const runner = CreateBox(`hepaRunnerZ_${zi}`, { width: FFU_PITCH_X * 9 + 0.2, height: 0.08, depth: 0.055 }, scene);
    runner.parent = root;
    runner.position.set(0, 1.88, zi * FFU_PITCH_Z - FFU_PITCH_Z * 0.5 + 0.1);
    runner.material = tbarMat;
    runner.isPickable = false;
  }

  // Cove light strips — brighter far falloff so inspection crop reads bay depth.
  const coveBack = CreateBox('coveBack', { width: ROOM_W - 0.4, height: 0.12, depth: 0.14 }, scene);
  coveBack.parent = root;
  coveBack.position.set(0, 1.78, -1.48);
  coveBack.material = lamp(scene, 'coveBackMat', new Color3(1, 0.88, 0.7), 1.15);
  coveBack.isPickable = false;

  for (const [side, x] of [
    ['L', -(WALL_X - 0.14)],
    ['R', WALL_X - 0.14],
  ] as const) {
    const coveSide = CreateBox(`cove${side}`, { width: 0.1, height: 0.1, depth: 6.4 }, scene);
    coveSide.parent = root;
    coveSide.position.set(x, 1.78, 0.2);
    coveSide.material = lamp(scene, `cove${side}Mat`, new Color3(1, 0.9, 0.74), 1.05);
    coveSide.isPickable = false;
  }

  const coveFront = CreateBox('coveTask', { width: 3.6, height: 0.08, depth: 0.1 }, scene);
  coveFront.parent = root;
  coveFront.position.set(0.2, 1.72, 0.7);
  coveFront.material = lamp(scene, 'coveTaskMat', new Color3(1, 0.9, 0.74), 1.0);
  coveFront.isPickable = false;
  // Far +Z cove — soft glow into the deep bay behind the inspection triad.
  const coveFar = CreateBox('coveFar', { width: 6.5, height: 0.1, depth: 0.12 }, scene);
  coveFar.parent = root;
  coveFar.position.set(0.15, 1.82, 2.55);
  coveFar.material = lamp(scene, 'coveFarMat', new Color3(1, 0.9, 0.74), 1.25);
  coveFar.isPickable = false;

  // Wall trim / kick + wainscot band so walls have vertical presence
  const kick = CreateBox('kickPlate', { width: ROOM_W - 0.3, height: 0.16, depth: 0.07 }, scene);
  kick.parent = root;
  kick.position.set(0, 0.08, -1.58);
  kick.material = metal(scene, 'kickMat', COLORS.wallTrim, 0.28);
  kick.isPickable = false;

  const wainscot = CreateBox('wainscot', { width: ROOM_W - 0.3, height: 0.9, depth: 0.04 }, scene);
  wainscot.parent = root;
  wainscot.position.set(0, 0.55, -1.6);
  wainscot.material = matteNoise(scene, 'wainscotMat', COLORS.wall.scale(0.9), {
    variance: 11,
    speck: 0.04,
    size: 128,
    tileHint: 'coarse',
    blotch: 0.5,
    emissive: 0.04,
    uScale: 2.4,
    vScale: 1.2,
  });
  wainscot.isPickable = false;

  // Floor/wall contact darkening — cheap AO read at the kick line.
  const wallContact = CreateBox('wallContact', { width: ROOM_W - 0.4, height: 0.02, depth: 0.1 }, scene);
  wallContact.parent = root;
  wallContact.position.set(0, 0.01, -1.55);
  wallContact.material = matte(scene, 'wallContactMat', new Color3(0.1, 0.09, 0.08), 0);
  wallContact.isPickable = false;

  // Slim corner posts at the far wall junctions — not mid-FOV pillars.
  for (const [i, cx, cz] of [
    [0, -(WALL_X - 0.12), -1.52],
    [1, WALL_X - 0.12, -1.52],
  ] as const) {
    const col = CreateBox(`cornerCol_${i}`, { width: 0.12, height: 2.7, depth: 0.12 }, scene);
    col.parent = root;
    col.position.set(cx, 1.4, cz);
    col.material = metal(scene, `cornerColMat_${i}`, COLORS.housing.scale(1.05), 0.18);
    col.isPickable = false;
    const cornerFfu = CreateBox(`cornerFfu_${i}`, { width: 0.4, height: 0.18, depth: 0.4 }, scene);
    cornerFfu.parent = root;
    cornerFfu.position.set(cx * 0.9, 2.28, cz * 0.7);
    cornerFfu.material = hepaFrameMat;
    cornerFfu.isPickable = false;
  }

  // Far-corner gas bottles only — no rack/cart slabs in rework mid-frame.
  for (const [i, sx] of [-1, 1].entries()) {
    const rackX = sx * 3.1;
    const rackZ = -1.4;
    for (const [j] of [0, 1].entries()) {
      const bottle = CreateCylinder(`cornerBottle_${i}_${j}`, {
        diameter: 0.08,
        height: 0.38,
        tessellation: 10,
      }, scene);
      bottle.parent = root;
      bottle.position.set(rackX + (j ? 0.07 : -0.07) * sx, 0.22, rackZ);
      bottle.material = metal(
        scene,
        `cornerBottleMat_${i}_${j}`,
        j ? new Color3(0.55, 0.62, 0.72) : new Color3(0.72, 0.55, 0.32),
        0.14,
      );
      bottle.isPickable = false;
    }
  }

  // Slim service conduit tucked behind instruments (parked in rework).
  const rail = CreateBox('serviceRail', { width: 0.7, height: 0.05, depth: 0.05 }, scene);
  rail.parent = root;
  rail.position.set(1.35, 1.9, -0.55);
  rail.material = metal(scene, 'railMat', new Color3(0.4, 0.43, 0.46), 0.18);
  rail.isPickable = false;

  // Far-corner service panels only — mid-wall slabs were the left-wall grey mass.
  for (const [i, x] of [-3.5, 3.3].entries()) {
    const svc = CreateBox(`wallSvc_${i}`, { width: 0.32, height: 0.4, depth: 0.04 }, scene);
    svc.parent = root;
    svc.position.set(x, 1.7, -1.58);
    svc.material = matte(scene, `wallSvcMat_${i}`, COLORS.housing.scale(i ? 1.05 : 0.95), 0.04);
    svc.isPickable = false;
    const gauge = CreateCylinder(`wallGauge_${i}`, { diameter: 0.07, height: 0.022, tessellation: 12 }, scene);
    gauge.parent = root;
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(x, 1.78, -1.55);
    gauge.material = metal(scene, `wallGaugeMat_${i}`, new Color3(0.7, 0.74, 0.78), 0.3);
    gauge.isPickable = false;
  }

  // Sparse return grilles — one far left, one right of center (not a wall of grey boxes).
  const returnMat = hepaFaceMat(scene, 'wallReturnFace');
  for (const [i, x] of [-3.0, 1.8].entries()) {
    const grille = CreateBox(`wallReturn_${i}`, { width: 0.5, height: 0.32, depth: 0.03 }, scene);
    grille.parent = root;
    grille.position.set(x, 1.78, -1.58);
    grille.material = returnMat;
    grille.isPickable = false;
    const grilleFrame = CreateBox(`wallReturnFrame_${i}`, { width: 0.56, height: 0.36, depth: 0.022 }, scene);
    grilleFrame.parent = root;
    grilleFrame.position.set(x, 1.78, -1.6);
    grilleFrame.material = hepaFrameMat;
    grilleFrame.isPickable = false;
  }
  // Side-wall returns — both flanks so ¾ orbits don't show blank drywall or void
  for (const [si, sx] of [
    [0, -(WALL_X - 0.06)],
    [1, WALL_X - 0.06],
  ] as const) {
    const sideReturn = CreateBox(`sideReturn_${si}`, { width: 0.04, height: 0.45, depth: 0.9 }, scene);
    sideReturn.parent = root;
    sideReturn.position.set(sx, 1.7, -0.55);
    sideReturn.material = returnMat;
    sideReturn.isPickable = false;
  }
  // Wing-face return grille — on the far closer, not in rework near-plane.
  const wingReturn = CreateBox('wingReturn', { width: 0.04, height: 0.5, depth: 0.7 }, scene);
  wingReturn.parent = root;
  wingReturn.position.set(3.28, 1.95, -0.85);
  wingReturn.material = returnMat;
  wingReturn.isPickable = false;
  // Far-corner chase only (2 drops each side) — mid-height pipe forests ate left FOV.
  for (const [i, x] of [-(WALL_X - 0.35), WALL_X - 0.35].entries()) {
    for (const [j, y] of [1.1, 1.9].entries()) {
      const chase = CreateCylinder(`chase_${i}_${j}`, { diameter: 0.04, height: 0.45, tessellation: 8 }, scene);
      chase.parent = root;
      chase.position.set(x, y, -1.48);
      chase.material = metal(scene, `chaseMat_${i}`, new Color3(0.68, 0.52, 0.34), 0.28);
      chase.isPickable = false;
      const flange = CreateCylinder(`flange_${i}_${j}`, { diameter: 0.07, height: 0.016, tessellation: 10 }, scene);
      flange.parent = root;
      flange.position.set(x, y + 0.18, -1.48);
      flange.material = metal(scene, `flangeMat_${i}`, COLORS.wallTrim, 0.25);
      flange.isPickable = false;
    }
  }

  // Distant bay mass — readable cleanroom depth in inspection crop without occluding FOUP/wafer/stamps.
  // Parked far +Z / flanks so fog + cove sell atmosphere behind the hero triad.
  const farBayMat = enableShellFog(
    matteNoise(scene, 'farBayMat', COLORS.wall.scale(0.72), {
      variance: 16,
      speck: 0.06,
      size: 256,
      tileHint: 'coarse',
      blotch: 0.7,
      emissive: 0.025,
      uScale: 1.6,
      vScale: 1.3,
    }),
  );
  for (const [fi, fx, fz, fw, fd] of [
    // Flank mass beside the +Z niche — never park in front of inspectNiche* (z≈1.8).
    [0, -2.35, 1.85, 0.85, 0.55],
    [1, 2.35, 1.9, 0.85, 0.55],
    [2, -2.7, 3.05, 0.95, 0.6],
    [3, 2.7, 3.1, 0.9, 0.55],
  ] as const) {
    const mass = CreateBox(`farBayMass_${fi}`, { width: fw, height: 1.7, depth: fd }, scene);
    mass.parent = root;
    mass.position.set(fx, 0.9, fz);
    mass.material = farBayMat;
    mass.isPickable = false;
    const massCove = CreateBox(`farBayCove_${fi}`, { width: fw - 0.1, height: 0.08, depth: 0.08 }, scene);
    massCove.parent = root;
    massCove.position.set(fx, 1.65, fz - fd / 2 + 0.06);
    massCove.material = lamp(scene, `farBayCoveMat_${fi}`, new Color3(1, 0.9, 0.74), 0.95);
    massCove.isPickable = false;
  }
  // Soft haze well past niche back — never a grey slab filling the pocket opening.
  const haze = CreateBox('bayHazeBand', { width: 7.5, height: 0.7, depth: 0.04 }, scene);
  haze.parent = root;
  haze.position.set(0.2, 1.35, 3.35);
  const hazeMat = enableShellFog(matte(scene, 'bayHazeMat', new Color3(0.45, 0.42, 0.38), 0.02));
  hazeMat.alpha = 0.14;
  hazeMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  hazeMat.emissiveColor = new Color3(0.08, 0.07, 0.06);
  haze.material = hazeMat;
  haze.isPickable = false;
  haze.renderingGroupId = 0;

  // Left scenic mass — kills Iris left tan void beside FOUP (no Room/Workbench slabs).
  // Dark housing rack + wall return sit LEFT of FOUP (x≲−1.15), never in front of triad.
  const leftScenicMat = matteNoise(scene, 'leftScenicMat', new Color3(0.26, 0.28, 0.31), {
    variance: 14,
    speck: 0.07,
    size: 128,
    tileHint: 'fine',
    blotch: 0.55,
    emissive: 0.018,
    uScale: 2.0,
    vScale: 1.6,
  });
  // Wide return toward cam (−Z) + outboard (−X) — seals left FOV edge (was cream peek).
  // Parked further −X/−Z so RCA frontal orbit doesn't silhouette it as a left shelf/bracket.
  const leftReturn = CreateBox('leftWallReturn', { width: 0.85, height: 2.55, depth: 2.2 }, scene);
  leftReturn.parent = root;
  leftReturn.position.set(-1.95, 1.4, -0.45);
  leftReturn.material = leftScenicMat;
  leftReturn.isPickable = false;
  const leftReturnFill = CreateBox('leftWallReturnFill', { width: 1.15, height: 2.5, depth: 0.85 }, scene);
  leftReturnFill.parent = root;
  leftReturnFill.position.set(-2.25, 1.4, 0.2);
  leftReturnFill.material = leftScenicMat;
  leftReturnFill.isPickable = false;
  // Cam-plane seal — dark mass at left FOV edge so cream leftWing never peeks.
  const leftCamSeal = CreateBox('leftCamSeal', { width: 0.7, height: 2.4, depth: 0.55 }, scene);
  leftCamSeal.parent = root;
  leftCamSeal.position.set(-1.55, 1.35, -0.95);
  leftCamSeal.material = leftScenicMat;
  leftCamSeal.isPickable = false;
  const leftReturnCove = CreateBox('leftWallReturnCove', { width: 0.55, height: 0.1, depth: 2.1 }, scene);
  leftReturnCove.parent = root;
  leftReturnCove.position.set(-1.62, 1.98, -0.15);
  leftReturnCove.material = lamp(scene, 'leftWallReturnCoveMat', new Color3(1, 0.9, 0.74), 1.35);
  leftReturnCove.isPickable = false;
  // Near column left of FOUP — parked further −X so RCA cheek isn't flanked by a bracket gap.
  const leftCol = CreateBox('leftBayColumn', { width: 0.32, height: 1.85, depth: 0.42 }, scene);
  leftCol.parent = root;
  leftCol.position.set(-1.35, 1.2, 0.2);
  leftCol.material = matteNoise(scene, 'leftBayColumnMat', new Color3(0.3, 0.32, 0.35), {
    variance: 12,
    speck: 0.06,
    size: 96,
    blotch: 0.45,
    emissive: 0.022,
  });
  leftCol.isPickable = false;
  // Articulation on left mass — gauges/panels recessed on rack face (not cheek-adjacent
  // metal pins that silhouette as RCA left bracket hardware in Iris rework orbit).
  for (const [gi, gy] of [
    [0, 1.55],
    [1, 1.25],
    [2, 0.95],
  ] as const) {
    const gauge = CreateCylinder(`leftBayGauge_${gi}`, { diameter: 0.07, height: 0.016, tessellation: 12 }, scene);
    gauge.parent = root;
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(-1.35, gy, 0.28);
    gauge.material = metal(scene, `leftBayGaugeMat_${gi}`, new Color3(0.42, 0.46, 0.5), 0.22);
    gauge.isPickable = false;
  }
  const leftPanel = CreateBox('leftBayPanel', { width: 0.02, height: 0.48, depth: 0.22 }, scene);
  leftPanel.parent = root;
  leftPanel.position.set(-1.35, 1.15, 0.28);
  leftPanel.material = lamp(scene, 'leftBayPanelMat', new Color3(0.12, 0.35, 0.32), 0.35);
  leftPanel.isPickable = false;
  // Equipment rack mass — wider toward cam so Iris left band is hardware, not cream.
  const leftRack = CreateBox('leftBayRack', { width: 0.78, height: 1.65, depth: 0.62 }, scene);
  leftRack.parent = root;
  leftRack.position.set(-1.48, 1.02, 0.35);
  leftRack.material = matteNoise(scene, 'leftBayRackMat', COLORS.housing.scale(0.9), {
    variance: 12,
    speck: 0.06,
    size: 128,
    blotch: 0.5,
    emissive: 0.024,
    uScale: 1.8,
    vScale: 1.4,
  });
  leftRack.isPickable = false;
  // No outboard shelf — metal lip was the Iris RCA left bracket. Keep art-blend name buried inside rack.
  const leftRackShelf = CreateBox('leftBayRackShelf', { width: 0.4, height: 0.02, depth: 0.2 }, scene);
  leftRackShelf.parent = root;
  leftRackShelf.position.set(-1.55, 1.2, 0.4);
  leftRackShelf.material = matte(scene, 'leftBayRackShelfMat', new Color3(0.16, 0.17, 0.18), 0.004);
  leftRackShelf.isPickable = false;
  leftRackShelf.setEnabled(false);
  const leftRackFace = CreateBox('leftBayRackFace', { width: 0.66, height: 0.62, depth: 0.03 }, scene);
  leftRackFace.parent = root;
  leftRackFace.position.set(-1.48, 1.1, 0.05);
  leftRackFace.material = hepaMatShared;
  leftRackFace.isPickable = false;
  // Back-left wing — DARK housing (never cream wallMat) so −X FOV can't tan-peek.
  const leftWingMat = matteNoise(scene, 'leftWingMat', new Color3(0.28, 0.3, 0.33), {
    variance: 14,
    speck: 0.06,
    size: 256,
    tileHint: 'coarse',
    blotch: 0.65,
    emissive: 0.02,
    uScale: 1.8,
    vScale: 1.5,
  });
  const leftWing = CreateBox('leftWing', { width: 3.2, height: 2.9, depth: 0.14 }, scene);
  leftWing.parent = root;
  leftWing.position.set(-2.4, 1.45, -1.42);
  leftWing.material = leftWingMat;
  leftWing.isPickable = false;
  const leftWingCove = CreateBox('leftWingCove', { width: 2.9, height: 0.12, depth: 0.1 }, scene);
  leftWingCove.parent = root;
  leftWingCove.position.set(-2.4, 1.9, -1.32);
  leftWingCove.material = lamp(scene, 'leftWingCoveMat', new Color3(1, 0.9, 0.74), 1.15);
  leftWingCove.isPickable = false;

  // Inspection-crop wall recession on the +Z backdrop — FOUP-orbit sits on −Z looking +Z.
  // Deep bay alcove: NO fog on pocket mats (fog washed depth to tan flat). Thick jambs + long soffit.
  const nicheMat = matteNoise(scene, 'inspectNicheMat', new Color3(0.05, 0.045, 0.04), {
    variance: 18,
    speck: 0.07,
    size: 256,
    tileHint: 'fine',
    blotch: 0.7,
    emissive: 0.004,
    uScale: 2.0,
    vScale: 1.6,
  });
  nicheMat.fogEnabled = false;
  nicheMat.emissiveColor = new Color3(0.008, 0.007, 0.006);
  // Open bay pocket (shell only) — NEVER a solid air-volume box that swallows HEPA.
  // Mouth ≈ z1.08 → HEPA ≈ z2.22 → back ≈ z2.58 — real bay setback Iris can read.
  const nicheBack = CreateBox('inspectNicheBack', { width: 3.6, height: 2.45, depth: 0.14 }, scene);
  nicheBack.parent = root;
  nicheBack.position.set(0.0, 1.48, 2.58);
  nicheBack.material = nicheMat;
  nicheBack.isPickable = false;
  // Dark rear pocket plate behind HEPA — shadowed void, not a filled occlusion volume.
  const nichePocket = CreateBox('inspectNichePocket', { width: 2.35, height: 1.45, depth: 0.12 }, scene);
  nichePocket.parent = root;
  nichePocket.position.set(0.0, 1.42, 2.38);
  nichePocket.material = matteNoise(scene, 'inspectNichePocketMat', new Color3(0.022, 0.02, 0.018), {
    variance: 12,
    speck: 0.04,
    size: 128,
    blotch: 0.5,
    emissive: 0.001,
    uScale: 1.8,
    vScale: 1.4,
  });
  nichePocket.material.fogEnabled = false;
  nichePocket.isPickable = false;
  // Deep soffit spanning mouth→back — long underside plane sells real ceiling recession.
  const nicheSoffit = CreateBox('inspectNicheSoffit', { width: 2.55, height: 0.22, depth: 1.4 }, scene);
  nicheSoffit.parent = root;
  nicheSoffit.position.set(0.0, 2.3, 1.82);
  nicheSoffit.material = matte(scene, 'inspectNicheSoffitMat', new Color3(0.02, 0.02, 0.024), 0.005);
  nicheSoffit.material.fogEnabled = false;
  nicheSoffit.isPickable = false;
  // Stepped soffit underside — feel41 rear so midband gaps aren't capped by a bridging shelf.
  const nicheSoffitStep = CreateBox('inspectNicheSoffitStep', { width: 2.3, height: 0.14, depth: 0.55 }, scene);
  nicheSoffitStep.parent = root;
  nicheSoffitStep.position.set(0.0, 2.12, 1.9);
  nicheSoffitStep.material = matte(scene, 'inspectNicheSoffitStepMat', new Color3(0.015, 0.015, 0.018), 0.004);
  nicheSoffitStep.material.fogEnabled = false;
  nicheSoffitStep.isPickable = false;
  // Soffit lip — feel42 push rear (was a thick black midband rail behind SMIF gaps).
  const nicheSoffitLip = CreateBox('inspectNicheSoffitLip', { width: 2.2, height: 0.12, depth: 0.14 }, scene);
  nicheSoffitLip.parent = root;
  nicheSoffitLip.position.set(0.0, 2.18, 1.55);
  nicheSoffitLip.material = matte(scene, 'inspectNicheSoffitLipMat', new Color3(0.07, 0.07, 0.075), 0.012);
  nicheSoffitLip.material.fogEnabled = false;
  nicheSoffitLip.isPickable = false;
  // Literal pocket jambs — thick dark side walls + fat mouth returns (bay reveal, not stickers).
  const jambMat = matteNoise(scene, 'inspectNicheJambMat', new Color3(0.08, 0.075, 0.07), {
    variance: 12,
    speck: 0.05,
    size: 128,
    blotch: 0.5,
    emissive: 0.004,
    uScale: 1.6,
    vScale: 2.0,
  });
  jambMat.fogEnabled = false;
  // Keep reveal names for art-blend; dark housing face (warm lamp only on thin cove edge).
  const revealMat = jambMat;
  const pocketLinerMat = matte(scene, 'inspectNicheLinerMat', new Color3(0.028, 0.025, 0.022), 0.003);
  pocketLinerMat.fogEnabled = false;
  for (const [side, sx] of [
    ['L', -1],
    ['R', 1],
  ] as const) {
    // Deep side wall — camera sees the inner face going far back into the pocket.
    const sideWall = CreateBox(`inspectNicheReveal${side}`, { width: 0.42, height: 2.15, depth: 1.45 }, scene);
    sideWall.parent = root;
    sideWall.position.set(sx * 1.3, 1.48, 1.82);
    sideWall.material = revealMat;
    sideWall.isPickable = false;
    // Inner liner — darker face sells shadowed alcove volume.
    const liner = CreateBox(`inspectNicheLiner${side}`, { width: 0.1, height: 1.65, depth: 1.2 }, scene);
    liner.parent = root;
    liner.position.set(sx * 1.02, 1.4, 1.78);
    liner.material = pocketLinerMat;
    liner.isPickable = false;
    // Mouth return — thick forward face at pocket opening (jamb depth, not thin trim).
    const mouth = CreateBox(`inspectNicheMouth${side}`, { width: 0.44, height: 2.1, depth: 0.22 }, scene);
    mouth.parent = root;
    mouth.position.set(sx * 1.12, 1.48, 1.04);
    mouth.material = jambMat;
    mouth.isPickable = false;
  }
  // Thin warm cove — feel42 with soffit lip (rear); keep HEPA readable, no midband rail.
  const nicheCove = CreateBox('inspectNicheCove', { width: 1.9, height: 0.05, depth: 0.07 }, scene);
  nicheCove.parent = root;
  nicheCove.position.set(0.0, 2.08, 1.5);
  nicheCove.material = lamp(scene, 'inspectNicheCoveMat', new Color3(1, 0.9, 0.72), 1.15);
  nicheCove.isPickable = false;
  const nicheCoveFill = CreateBox('inspectNicheCoveFill', { width: 1.7, height: 0.03, depth: 0.05 }, scene);
  nicheCoveFill.parent = root;
  nicheCoveFill.position.set(0.0, 2.02, 1.56);
  nicheCoveFill.material = lamp(scene, 'inspectNicheCoveFillMat', new Color3(1, 0.86, 0.68), 0.7);
  nicheCoveFill.isPickable = false;
  // Niche HEPA bank — smaller + deeper so dark pocket surround reads as alcove mass.
  const nicheHepaMat = hepaFaceMat(scene, 'inspectNicheHepaFace');
  nicheHepaMat.emissiveColor = new Color3(0.09, 0.1, 0.115);
  nicheHepaMat.fogEnabled = false;
  for (const [ni, nx] of [
    [0, -0.55],
    [1, 0.0],
    [2, 0.55],
  ] as const) {
    const nicheHepa = CreateBox(`inspectNicheHepa_${ni}`, { width: 0.48, height: 0.4, depth: 0.06 }, scene);
    nicheHepa.parent = root;
    nicheHepa.position.set(nx, 1.48, 2.22);
    nicheHepa.material = nicheHepaMat;
    nicheHepa.isPickable = false;
    const nicheHepaFrame = CreateBox(`inspectNicheHepaFrame_${ni}`, {
      width: 0.54,
      height: 0.48,
      depth: 0.05,
    }, scene);
    nicheHepaFrame.parent = root;
    nicheHepaFrame.position.set(nx, 1.62, 2.26);
    nicheHepaFrame.material = hepaFrameMat;
    nicheHepaFrame.isPickable = false;
  }
  // Deep pocket frame — long inner jambs from mouth toward HEPA plane (visible flank mass).
  const pocketFrameMat = matte(scene, 'inspectNicheFrameMat', new Color3(0.04, 0.038, 0.035), 0.008);
  pocketFrameMat.fogEnabled = false;
  // feel42 — niche jambs outboard + deeper (were dark midband blocks between SMIF gaps).
  for (const [fi, fx] of [
    [0, -1.15],
    [1, 1.15],
  ] as const) {
    const frame = CreateBox(`inspectNicheInner_${fi}`, { width: 0.28, height: 1.35, depth: 0.85 }, scene);
    frame.parent = root;
    frame.position.set(fx, 1.4, 1.85);
    frame.material = pocketFrameMat;
    frame.isPickable = false;
    // Front mouth face — thickness cue so recession isn't sticker-flat.
    const face = CreateBox(`inspectNicheFrameFace_${fi}`, { width: 0.28, height: 1.2, depth: 0.14 }, scene);
    face.parent = root;
    face.position.set(fx, 1.4, 1.45);
    face.material = matte(scene, `inspectNicheFrameFaceMat_${fi}`, new Color3(0.1, 0.095, 0.09), 0.012);
    face.material.fogEnabled = false;
    face.isPickable = false;
  }
  // Dropped soffit shelf — feel41 push rear so it doesn't bridge Iris midband above SMIF gaps.
  const nicheSoffitShelf = CreateBox('inspectNicheSoffitShelf', { width: 1.7, height: 0.12, depth: 0.55 }, scene);
  nicheSoffitShelf.parent = root;
  nicheSoffitShelf.position.set(0.0, 1.9, 1.95);
  nicheSoffitShelf.material = matte(scene, 'inspectNicheSoffitShelfMat', new Color3(0.018, 0.018, 0.02), 0.004);
  nicheSoffitShelf.material.fogEnabled = false;
  nicheSoffitShelf.isPickable = false;
  // Rear shelf lip just ahead of HEPA — sells remaining setback as a dark pocket.
  const nicheHepaBrow = CreateBox('inspectNicheHepaBrow', { width: 1.7, height: 0.1, depth: 0.14 }, scene);
  nicheHepaBrow.parent = root;
  nicheHepaBrow.position.set(0.0, 1.76, 2.05);
  nicheHepaBrow.material = matte(scene, 'inspectNicheHepaBrowMat', new Color3(0.03, 0.03, 0.034), 0.006);
  nicheHepaBrow.material.fogEnabled = false;
  nicheHepaBrow.isPickable = false;
  const nicheWain = CreateBox('inspectNicheWain', { width: 2.15, height: 0.72, depth: 0.16 }, scene);
  nicheWain.parent = root;
  nicheWain.position.set(0.0, 0.8, 2.15);
  nicheWain.material = matteNoise(scene, 'inspectNicheWainMat', new Color3(0.07, 0.065, 0.06), {
    variance: 12,
    speck: 0.05,
    size: 128,
    blotch: 0.5,
    emissive: 0.005,
    uScale: 2.2,
    vScale: 1.1,
  });
  nicheWain.material.fogEnabled = false;
  nicheWain.isPickable = false;
  const nicheFloor = CreateBox('inspectNicheFloor', { width: 2.45, height: 0.05, depth: 1.35 }, scene);
  nicheFloor.parent = root;
  nicheFloor.position.set(0.0, 0.56, 1.8);
  nicheFloor.material = matte(scene, 'inspectNicheFloorMat', new Color3(0.04, 0.038, 0.035), 0.008);
  nicheFloor.material.fogEnabled = false;
  nicheFloor.isPickable = false;
  // Deep pocket occupant — faintly lit so Iris can read setback past HEPA (parallax proof).
  const nicheDeepMat = matteNoise(scene, 'inspectNicheDeepMat', new Color3(0.045, 0.04, 0.038), {
    variance: 10,
    speck: 0.04,
    size: 96,
    blotch: 0.4,
    emissive: 0.012,
  });
  nicheDeepMat.fogEnabled = false;
  const nicheDeepCab = CreateBox('inspectNicheDeepCab', { width: 0.55, height: 0.85, depth: 0.32 }, scene);
  nicheDeepCab.parent = root;
  nicheDeepCab.position.set(0.55, 1.05, 2.42);
  nicheDeepCab.material = nicheDeepMat;
  nicheDeepCab.isPickable = false;
  const nicheDeepCart = CreateBox('inspectNicheDeepCart', { width: 0.38, height: 0.55, depth: 0.28 }, scene);
  nicheDeepCart.parent = root;
  nicheDeepCart.position.set(-0.5, 0.9, 2.4);
  nicheDeepCart.material = nicheDeepMat;
  nicheDeepCart.isPickable = false;
  const nicheDeepRail = CreateBox('inspectNicheDeepRail', { width: 1.1, height: 0.04, depth: 0.06 }, scene);
  nicheDeepRail.parent = root;
  nicheDeepRail.position.set(0.05, 1.55, 2.45);
  nicheDeepRail.material = lamp(scene, 'inspectNicheDeepRailMat', new Color3(0.55, 0.5, 0.4), 0.35);
  nicheDeepRail.material.fogEnabled = false;
  nicheDeepRail.isPickable = false;

  // --- Mid-bay cleanroom mass (must land IN Iris inspection FOV) ---
  // Gap between FOUP (x≈−0.7) and stamps (x≈0.34) was a sparse wall corner.
  // Connected scrubber/metrology stack peeks behind wafer without covering heroes
  // or dressing Room/Workbench slabs.
  // Slightly lighter + emissive so mid-corridor silhouette reads against dark wall (not blends away).
  const bayEquipMat = matteNoise(scene, 'bayEquipMat', new Color3(0.4, 0.42, 0.46), {
    variance: 16,
    speck: 0.08,
    size: 128,
    blotch: 0.6,
    emissive: 0.045,
    uScale: 1.8,
    vScale: 1.4,
  });
  bayEquipMat.fogEnabled = false;
  const bayEquipDark = matte(scene, 'bayEquipDarkMat', new Color3(0.22, 0.24, 0.27), 0.04);
  bayEquipDark.fogEnabled = false;
  // feel28 — satin tool-steel uprights/shelves catch grazing light (vs powdercoat cassettes).
  const baySteel = metal(scene, 'bayEquipSteelMat', new Color3(0.66, 0.68, 0.72), 0.48);
  baySteel.fogEnabled = false;
  baySteel.environmentIntensity = 0.62;
  baySteel.specularIntensity = 0.78;
  // feel35/36 — quieter midbay rail steel (kill chalk-bright shelf bars; keep baySteel elsewhere).
  const midFabRailSteel = metal(scene, 'bayMidFabRailSteelMat', new Color3(0.28, 0.3, 0.33), 0.18);
  midFabRailSteel.fogEnabled = false;
  midFabRailSteel.environmentIntensity = 0.26;
  midFabRailSteel.specularIntensity = 0.22;
  midFabRailSteel.roughness = 0.62;

  // Tool cart — feel44 further +X/+Z (quiet Iris right crop; stamps stay hero).
  const toolCart = CreateBox('bayToolCart', { width: 0.42, height: 1.05, depth: 0.36 }, scene);
  toolCart.parent = root;
  toolCart.position.set(1.35, 1.1, 0.95);
  toolCart.material = bayEquipMat;
  toolCart.isPickable = false;
  const toolCartTop = CreateBox('bayToolCartTop', { width: 0.46, height: 0.045, depth: 0.4 }, scene);
  toolCartTop.parent = root;
  toolCartTop.position.set(1.35, 1.65, 0.95);
  toolCartTop.material = baySteel;
  toolCartTop.isPickable = false;
  for (const [wi, wy] of [
    [0, 0.85],
    [1, 1.1],
    [2, 1.35],
  ] as const) {
    const drawer = CreateBox(`bayToolCartDrawer_${wi}`, { width: 0.34, height: 0.1, depth: 0.03 }, scene);
    drawer.parent = root;
    drawer.position.set(1.35, wy, 0.78);
    drawer.material = bayEquipDark;
    drawer.isPickable = false;
  }
  const toolCartCove = CreateBox('bayToolCartCove', { width: 0.34, height: 0.045, depth: 0.08 }, scene);
  toolCartCove.parent = root;
  toolCartCove.position.set(1.35, 1.72, 0.82);
  toolCartCove.material = lamp(scene, 'bayToolCartCoveMat', new Color3(1, 0.88, 0.7), 1.35);
  toolCartCove.isPickable = false;

  // Wafer-return rack — feel42 push −X so FOUP polycarb isn't flanked by dark cart debris.
  const returnCart = CreateBox('bayReturnCart', { width: 0.4, height: 1.2, depth: 0.32 }, scene);
  returnCart.parent = root;
  returnCart.position.set(-1.28, 1.15, 0.65);
  returnCart.material = bayEquipMat;
  returnCart.isPickable = false;
  const returnShelf = CreateBox('bayReturnShelf', { width: 0.34, height: 0.03, depth: 0.26 }, scene);
  returnShelf.parent = root;
  returnShelf.position.set(-1.28, 1.5, 0.65);
  returnShelf.material = baySteel;
  returnShelf.isPickable = false;
  const returnBin = CreateBox('bayReturnBin', { width: 0.28, height: 0.14, depth: 0.2 }, scene);
  returnBin.parent = root;
  returnBin.position.set(-1.28, 1.65, 0.65);
  returnBin.material = matte(scene, 'bayReturnBinMat', new Color3(0.26, 0.38, 0.42), 0.06);
  returnBin.material.fogEnabled = false;
  returnBin.isPickable = false;
  const returnCove = CreateBox('bayReturnCove', { width: 0.32, height: 0.045, depth: 0.07 }, scene);
  returnCove.parent = root;
  returnCove.position.set(-1.28, 1.82, 0.55);
  returnCove.material = lamp(scene, 'bayReturnCoveMat', new Color3(1, 0.88, 0.7), 1.25);
  returnCove.isPickable = false;

  // ★ feel40/41 — DELETE residual midSpine / opaque slab from Iris FOV (was filling FOUP↔stamps).
  // Keep mesh names for legacy Iris probes; park+disable so FOV reads free-standing SMIF only.
  const parkMid = (m: { position: { set: (x: number, y: number, z: number) => void }; setEnabled: (v: boolean) => void; isPickable: boolean }) => {
    m.position.set(0, -8, 0);
    m.setEnabled(false);
    m.isPickable = false;
  };
  const midSpine = CreateBox('bayMidSpine', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midSpine.parent = root;
  midSpine.material = bayEquipMat;
  parkMid(midSpine);
  const midSpineCap = CreateBox('bayMidSpineCap', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midSpineCap.parent = root;
  midSpineCap.material = baySteel;
  parkMid(midSpineCap);
  const midSpineFace = CreateBox('bayMidSpineFace', { width: 0.2, height: 0.2, depth: 0.05 }, scene);
  midSpineFace.parent = root;
  midSpineFace.material = matteNoise(scene, 'bayMidSpineFaceMat', new Color3(0.26, 0.28, 0.31), {
    variance: 14,
    speck: 0.06,
    size: 96,
    blotch: 0.45,
    emissive: 0.02,
  });
  midSpineFace.material.fogEnabled = false;
  parkMid(midSpineFace);

  // PRIMARY mid-band mass — grounded cassette LIBRARY (slot depth + steel lips), not dither flat.
  // Heroes clear: FOUP x≈−0.7 z≈0.1 | wafer x≈−0.38 z≈0.16 | stamps x≈0.34 z≈0.26.
  // feel28/36 — metal variation; feel36 quiets rack-body specular (depth via pockets, not shine).
  const midFabMat = metal(scene, 'bayMidFabMat', new Color3(0.24, 0.26, 0.29), 0.28);
  midFabMat.environmentIntensity = 0.36;
  midFabMat.specularIntensity = 0.42;
  midFabMat.fogEnabled = false;
  const midFabDark = matte(scene, 'bayMidFabDarkMat', new Color3(0.08, 0.09, 0.1), 0);
  midFabDark.fogEnabled = false;
  // feel30 — deeper slot cavity (vs midFabDark) so pockets read as void, not grey paint.
  const midPocketDark = matte(scene, 'bayMidFabPocketDarkMat', new Color3(0.025, 0.028, 0.032), 0);
  midPocketDark.fogEnabled = false;
  // Cassette shells — anodized teal / satin grey / charcoal (keep slot library; enrich metal only).
  // feel36 — quieter cassette shells (hot grey faces were reading chalk next to labels).
  // feel38 — hotter metal catch on large SMIF pods (less painted-plastic chalk).
  const midCasTeal = metal(scene, 'bayMidFabCasTeal', new Color3(0.14, 0.34, 0.36), 0.38);
  midCasTeal.fogEnabled = false;
  midCasTeal.environmentIntensity = 0.52;
  midCasTeal.specularIntensity = 0.58;
  // feel42 — brighter mid SMIF so short pod reads as equipment, not dark midband debris.
  const midCasGray = metal(scene, 'bayMidFabCasGray', new Color3(0.48, 0.5, 0.54), 0.36);
  midCasGray.fogEnabled = false;
  midCasGray.environmentIntensity = 0.55;
  midCasGray.specularIntensity = 0.62;
  const midCasChar = metal(scene, 'bayMidFabCasChar', new Color3(0.12, 0.13, 0.15), 0.26);
  midCasChar.fogEnabled = false;
  midCasChar.environmentIntensity = 0.4;
  midCasChar.specularIntensity = 0.48;
  const midCasLip = metal(scene, 'bayMidFabCasLip', new Color3(0.36, 0.38, 0.41), 0.22);
  midCasLip.fogEnabled = false;
  midCasLip.environmentIntensity = 0.3;
  // feel29/35/36 — quieter lip; kill chrome-rail toy chalk.
  midCasLip.specularIntensity = 0.24;
  // Fine brushed grain on lips only — metal read without cassette X-sheet albedo.
  const midLipBrush = noiseAlbedo(scene, 'bayMidFabCasLipAlb', {
    size: 64,
    base: [88, 92, 98],
    variance: 10,
    speck: 0.04,
    blotch: 0.28,
    tileHint: 'fine',
  });
  midLipBrush.uScale = 4.5;
  midLipBrush.vScale = 0.7;
  midCasLip.albedoTexture = midLipBrush;
  // feel29/36 — face kit mats (opaque; don't touch wet chem / FOUP).
  const midCasFaceA = matte(scene, 'bayMidFabCasFaceA', new Color3(0.26, 0.28, 0.3), 0.015);
  midCasFaceA.fogEnabled = false;
  midCasFaceA.specularIntensity = 0.18;
  midCasFaceA.environmentIntensity = 0.2;
  const midCasFaceB = matte(scene, 'bayMidFabCasFaceB', new Color3(0.14, 0.15, 0.17), 0.01);
  midCasFaceB.fogEnabled = false;
  midCasFaceB.specularIntensity = 0.16;
  midCasFaceB.environmentIntensity = 0.18;
  const midCasWinWell = matte(scene, 'bayMidFabCasWinWell', new Color3(0.03, 0.035, 0.04), 0);
  midCasWinWell.fogEnabled = false;
  const midCasWinGlass = matte(scene, 'bayMidFabCasWinGlass', new Color3(0.18, 0.32, 0.36), 0.1);
  midCasWinGlass.fogEnabled = false;
  const midCasHandleWell = matte(scene, 'bayMidFabCasHandleWell', new Color3(0.05, 0.055, 0.06), 0);
  midCasHandleWell.fogEnabled = false;
  const midCasVent = matte(scene, 'bayMidFabCasVent', new Color3(0.08, 0.09, 0.1), 0);
  midCasVent.fogEnabled = false;
  // feel36 — worn dirty cream (was chalk-hot 0.9 sticker).
  const midCasBar = matte(scene, 'bayMidFabCasBar', new Color3(0.58, 0.56, 0.48), 0.04);
  midCasBar.fogEnabled = false;
  midCasBar.specularIntensity = 0.14;
  // feel30/35/36 — raised lot-plate body (worn fab cardstock, not hot cream sticker).
  const midCasLotBody = matte(scene, 'bayMidFabCasLotBody', new Color3(0.52, 0.5, 0.44), 0.02);
  midCasLotBody.fogEnabled = false;
  midCasLotBody.specularIntensity = 0.12;
  midCasLotBody.environmentIntensity = 0.16;
  const midCasLotBevel = matte(scene, 'bayMidFabCasLotBevel', new Color3(0.36, 0.34, 0.3), 0.015);
  midCasLotBevel.fogEnabled = false;
  midCasLotBevel.specularIntensity = 0.14;
  // feel36 — shell edge chamfer mat (break LEGO brick silhouette; no chem/wet touch).
  const midCasShellBevel = matte(scene, 'bayMidFabCasShellBevel', new Color3(0.1, 0.11, 0.13), 0.01);
  midCasShellBevel.fogEnabled = false;
  // feel30/38 — unique lot IDs for SMIF pods (subset placed; keep C-25 for art-blend).
  const casLotIds = [
    ['C-01', 'LOT A12'],
    ['C-02', 'LOT A18'],
    ['C-03', 'LOT B02'],
    ['C-04', 'LOT B11'],
    ['C-05', 'LOT B19'],
    ['C-06', 'LOT C03'],
    ['C-07', 'LOT C14'],
    ['C-08', 'LOT C21'],
    ['C-09', 'LOT D05'],
    ['C-10', 'LOT D12'],
    ['C-11', 'LOT D20'],
    ['C-12', 'LOT E01'],
    ['C-13', 'LOT E08'],
    ['C-14', 'LOT E16'],
    ['C-15', 'LOT F04'],
    ['C-16', 'LOT F11'],
    ['C-17', 'LOT F22'],
    ['C-18', 'LOT G07'],
    ['C-19', 'LOT G15'],
    ['C-20', 'LOT G23'],
    ['C-21', 'LOT H02'],
    ['C-22', 'LOT H09'],
    ['C-23', 'LOT H18'],
    ['C-24', 'LOT J06'],
    ['C-25', 'LOT J14'],
  ] as const;
  // ★ feel40 — NO continuous midGapFill / opaque slab in Iris FOV (park legacy names).
  const midGapFill = CreateBox('bayMidGapFill', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midGapFill.parent = root;
  midGapFill.material = midFabMat;
  parkMid(midGapFill);
  // Legacy name kept; feel40 uses per-gap wall patches only (never a full-width opaque face).
  const midOpaqueFace = CreateBox('bayMidOpaqueFace', { width: 0.2, height: 0.2, depth: 0.05 }, scene);
  midOpaqueFace.parent = root;
  midOpaqueFace.material = midPocketDark;
  parkMid(midOpaqueFace);
  const midGapDoor = CreateBox('bayMidGapDoor', { width: 0.2, height: 0.2, depth: 0.02 }, scene);
  midGapDoor.parent = root;
  midGapDoor.position.set(-0.2, -5, 0);
  midGapDoor.setEnabled(false);
  midGapDoor.isPickable = false;
  // Continuous plinth/kick parked — each SMIF cabinet owns its own toe.
  const midFabPlinth = CreateBox('bayMidFabPlinth', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midFabPlinth.parent = root;
  midFabPlinth.material = baySteel;
  parkMid(midFabPlinth);
  const midFabKick = CreateBox('bayMidFabKick', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midFabKick.parent = root;
  midFabKick.material = midFabDark;
  parkMid(midFabKick);
  // ★ feel40 — 2–3 distinct free-standing SMIF cabinets FORWARD in Iris FOV.
  // Strong H/D contrast + visible bay-wall BETWEEN them. Heroes clear. chemBand 0.15–0.30 neonHot≈0.

  /** feel31 — thicker plate step: deep well + chunky body + inset face + fat bevel lips. */
  const mountLotPlate = (
    tagName: string,
    casX: number,
    faceZ: number,
    py: number,
    pw: number,
    ph: number,
    lines: readonly [string, string] | readonly [string],
    compact: boolean,
  ) => {
    const well = CreateBox(`${tagName}Well`, { width: pw + 0.014, height: ph + 0.014, depth: 0.02 }, scene);
    well.parent = root;
    well.position.set(casX, py, faceZ - 0.002);
    well.material = midCasWinWell;
    well.isPickable = false;
    const body = CreateBox(`${tagName}Body`, { width: pw, height: ph, depth: 0.03 }, scene);
    body.parent = root;
    body.position.set(casX, py, faceZ - 0.016);
    body.material = midCasLotBody;
    body.isPickable = false;
    const step = CreateBox(`${tagName}Step`, { width: pw - 0.006, height: ph - 0.006, depth: 0.01 }, scene);
    step.parent = root;
    step.position.set(casX, py, faceZ - 0.028);
    step.material = midCasLotBevel;
    step.isPickable = false;
    const face = CreateBox(tagName, { width: pw - 0.014, height: ph - 0.014, depth: 0.007 }, scene);
    face.parent = root;
    face.position.set(casX, py, faceZ - 0.036);
    face.isPickable = false;
    applyLabel(face, scene, {
      width: 256,
      height: compact ? 64 : 128,
      font: compact ? 'bold 28px monospace' : 'bold 40px monospace',
      lineHeight: compact ? 32 : 46,
      fill: '#9a9280',
      ink: '#1a222c',
      align: 'center',
      lines: [...lines],
    });
    const bz = faceZ - 0.02;
    const bevelSpecs: Array<[string, number, number, number, number]> = [
      ['T', pw - 0.002, 0.01, 0, ph * 0.5 - 0.002],
      ['B', pw - 0.002, 0.01, 0, -(ph * 0.5 - 0.002)],
      ['L', 0.01, ph - 0.002, -(pw * 0.5 - 0.002), 0],
      ['R', 0.01, ph - 0.002, pw * 0.5 - 0.002, 0],
    ];
    for (const [suf, bw, bh, ox, oy] of bevelSpecs) {
      const bevel = CreateBox(`${tagName}Bevel${suf}`, { width: bw, height: bh, depth: 0.016 }, scene);
      bevel.parent = root;
      bevel.position.set(casX + ox, py + oy, bz);
      bevel.material = midCasLotBevel;
      bevel.isPickable = false;
    }
  };

  // ★ feel41 — DELETE residual midband fill between uprights (WallGap / Face were bridging Iris FOV).
  // Keep mesh names for art-blend + Iris probes; park so gaps open to FAR bay wall only.
  const midGapWallLit = matte(scene, 'bayMidFabWallGapLitMat', new Color3(0.18, 0.2, 0.22), 0.03);
  midGapWallLit.fogEnabled = false;
  for (const gi of [0, 1] as const) {
    const wallGap = CreateBox(`bayMidFabWallGap_${gi}`, { width: 0.2, height: 0.2, depth: 0.2 }, scene);
    wallGap.parent = root;
    wallGap.material = midPocketDark;
    parkMid(wallGap);
    const wallGapFace = CreateBox(`bayMidFabWallGapFace_${gi}`, { width: 0.2, height: 0.2, depth: 0.05 }, scene);
    wallGapFace.parent = root;
    wallGapFace.material = midGapWallLit;
    parkMid(wallGapFace);
  }

  // Three free-standing SMIF cabinets — separate grounded masses, different H/D.
  // Mesh names keep bayMidFabCas_{si}_{ci} for Iris/art-blend probes.
  type MidPod = {
    si: number;
    ci: number;
    x: number;
    y: number;
    w: number;
    h: number;
    d: number;
    lotIdx: number;
    faceKind: number;
  };
  // Heroes: FOUP x≈−0.7 z≈0.1 | wafer x≈−0.38 z≈0.16 | stamps x≈0.34 z≈0.26.
  // ★ feel42 — 3 free-standing SMIF deep behind triad (lips/z never invade FOUP/stamp plane).
  const midPods: readonly MidPod[] = [
    // Left teal — FOUP-right corridor, recessed; distinct pod not debris.
    { si: 0, ci: 0, x: -0.24, y: 1.08, w: 0.17, h: 0.78, d: 0.24, lotIdx: 0, faceKind: 0 },
    // Mid GRAY — readable short pod (not a dark fill brick between uprights).
    { si: 0, ci: 1, x: -0.02, y: 1.0, w: 0.15, h: 0.7, d: 0.2, lotIdx: 5, faceKind: 1 },
    // Right teal — clear of stamp bank x≈0.34.
    { si: 1, ci: 2, x: 0.18, y: 1.1, w: 0.15, h: 0.82, d: 0.26, lotIdx: 18, faceKind: 0 },
  ];

  for (const pod of midPods) {
    const { si, ci, x: casX, y: casY, w: casW, h: casH, d: casD, lotIdx, faceKind } = pod;
    const lot = casLotIds[lotIdx]!;
    // feel42/43 — z≫0.55 so door lips stay behind stamp/FOUP faces; open air to niche wall.
    const zPush = 0.58 + (ci % 3) * 0.035 + Math.max(0, casD - 0.18) * 0.04;
    // ★ feel43 — slim toe + soft contact only (no chunky plinth/kick rails under Iris midband).
    const cabPlinth = CreateBox(`bayMidFabCabPlinth_${si}_${ci}`, {
      width: casW + 0.02,
      height: 0.035,
      depth: casD + 0.02,
    }, scene);
    cabPlinth.parent = root;
    cabPlinth.position.set(casX, casY - casH * 0.5 - 0.018, zPush + 0.01);
    cabPlinth.material = baySteel;
    cabPlinth.isPickable = false;
    // Keep kick name for art-blend/Iris; tiny dark lip instead of shadow-slab kick.
    const cabKick = CreateBox(`bayMidFabCabKick_${si}_${ci}`, {
      width: casW + 0.01,
      height: 0.02,
      depth: casD * 0.55,
    }, scene);
    cabKick.parent = root;
    cabKick.position.set(casX, casY - casH * 0.5 - 0.04, zPush + 0.02);
    cabKick.material = midFabDark;
    cabKick.isPickable = false;
    // Soft contact blob under each SMIF — grounds pod without a dark rail across gaps.
    const cabBlob = CreateBox(`bayMidFabCabBlob_${si}_${ci}`, {
      width: casW + 0.08,
      height: 0.004,
      depth: casD + 0.06,
    }, scene);
    cabBlob.parent = root;
    cabBlob.position.set(casX, casY - casH * 0.5 - 0.055, zPush + 0.01);
    cabBlob.material = contactBlobMat(scene, `bayMidFabCabBlobMat_${si}_${ci}`, {
      soft: 0.9,
      core: 0.04,
      strength: 0.92,
    });
    cabBlob.isPickable = false;
    // ★ feel42 — park rear shadow pockets (were dirtying gap silhouette as dark midband debris).
    const pocket = CreateBox(`bayMidFabPocket_${si}_${ci}`, { width: 0.1, height: 0.1, depth: 0.05 }, scene);
    pocket.parent = root;
    pocket.material = midPocketDark;
    parkMid(pocket);
    // Lit cheek — free-standing box edge vs open bay air.
    const cheekLit = CreateBox(`bayMidFabCasCheekLit_${si}_${ci}`, {
      width: 0.022,
      height: casH * 0.88,
      depth: casD * 0.5,
    }, scene);
    cheekLit.parent = root;
    cheekLit.position.set(casX - casW * 0.52, casY, zPush);
    cheekLit.material = midGapWallLit;
    cheekLit.isPickable = false;
    const cas = CreateBox(`bayMidFabCas_${si}_${ci}`, { width: casW, height: casH, depth: casD }, scene);
    cas.parent = root;
    cas.position.set(casX, casY, zPush);
    cas.material = faceKind % 3 === 0 ? midCasTeal : faceKind % 3 === 1 ? midCasGray : midCasChar;
    cas.isPickable = false;
    // Per-cabinet crown — never a continuous crossbeam fascia.
    const cabCrown = CreateBox(`bayMidFabCabCrown_${si}_${ci}`, {
      width: casW + 0.04,
      height: 0.06,
      depth: casD * 0.7,
    }, scene);
    cabCrown.parent = root;
    cabCrown.position.set(casX, casY + casH * 0.5 + 0.02, zPush);
    cabCrown.material = midFabRailSteel;
    cabCrown.isPickable = false;
    const lip = CreateBox(`bayMidFabCasLip_${si}_${ci}`, {
      width: casW + 0.03,
      height: casH + 0.03,
      depth: 0.036,
    }, scene);
    lip.parent = root;
    lip.position.set(casX, casY, zPush - casD * 0.42);
    lip.material = midCasLip;
    lip.isPickable = false;
    const cheek = CreateBox(`bayMidFabCasCheek_${si}_${ci}`, {
      width: 0.028,
      height: casH,
      depth: casD * 0.9,
    }, scene);
    cheek.parent = root;
    cheek.position.set(casX + casW * 0.52, casY, zPush);
    cheek.material = midCasLip;
    cheek.isPickable = false;
    const frontZ = zPush - casD * 0.48;
    const doorFrame = CreateBox(`bayMidFabCasDoorFrame_${si}_${ci}`, {
      width: casW * 0.88,
      height: casH * 0.88,
      depth: 0.05,
    }, scene);
    doorFrame.parent = root;
    doorFrame.position.set(casX, casY, frontZ - 0.01);
    doorFrame.material = midCasLip;
    doorFrame.isPickable = false;
    const faceZ = frontZ - 0.042;
    const facePlate = CreateBox(`bayMidFabCasFace_${si}_${ci}`, {
      width: casW * 0.62,
      height: casH * 0.62,
      depth: 0.034,
    }, scene);
    facePlate.parent = root;
    facePlate.position.set(casX, casY, faceZ);
    facePlate.material = faceKind % 2 === 0 ? midCasFaceA : midCasFaceB;
    facePlate.isPickable = false;
    const cut = Math.min(casW, casH) * 0.18;
    for (const [bi, sxb, syb] of [
      [0, -1, 1],
      [1, 1, 1],
      [2, -1, -1],
      [3, 1, -1],
    ] as const) {
      const shellBevel = CreateBox(`bayMidFabCasShellBevel_${si}_${ci}_${bi}`, {
        width: cut,
        height: 0.024,
        depth: cut,
      }, scene);
      shellBevel.parent = root;
      shellBevel.position.set(
        casX + sxb * (casW * 0.48 - cut * 0.22),
        casY + syb * (casH * 0.48 - cut * 0.22),
        frontZ - 0.002,
      );
      shellBevel.rotation.z = Math.PI / 4;
      shellBevel.material = midCasShellBevel;
      shellBevel.isPickable = false;
    }
    if (faceKind === 1 || faceKind === 2) {
      const latch = CreateCylinder(`bayMidFabCasLatch_${si}_${ci}`, {
        diameter: 0.032,
        height: 0.02,
        tessellation: 10,
      }, scene);
      latch.parent = root;
      latch.rotation.x = Math.PI / 2;
      latch.position.set(casX + casW * 0.28, casY + casH * 0.22, faceZ - 0.022);
      latch.material = midCasLip;
      latch.isPickable = false;
    }

    if (faceKind === 0) {
      const winWell = CreateBox(`bayMidFabCasWinWell_${si}_${ci}`, {
        width: Math.min(0.16, casW * 0.55),
        height: Math.min(0.1, casH * 0.35),
        depth: 0.02,
      }, scene);
      winWell.parent = root;
      winWell.position.set(casX, casY + casH * 0.12, faceZ - 0.004);
      winWell.material = midCasWinWell;
      winWell.isPickable = false;
      const winPane = CreateBox(`bayMidFabCasWin_${si}_${ci}`, {
        width: Math.min(0.14, casW * 0.48),
        height: Math.min(0.084, casH * 0.28),
        depth: 0.01,
      }, scene);
      winPane.parent = root;
      winPane.position.set(casX, casY + casH * 0.12, faceZ - 0.014);
      winPane.material = midCasWinGlass;
      winPane.isPickable = false;
      mountLotPlate(
        `bayMidFabCasTag_${si}_${ci}`,
        casX,
        faceZ,
        casY - casH * 0.28,
        Math.min(0.16, casW * 0.7),
        0.042,
        [lot[0], lot[1]],
        true,
      );
    } else if (faceKind === 1) {
      mountLotPlate(
        `bayMidFabCasTag_${si}_${ci}`,
        casX,
        faceZ,
        casY - casH * 0.05,
        Math.min(0.18, casW * 0.72),
        0.072,
        [lot[0], lot[1]],
        false,
      );
      const tagRail = CreateBox(`bayMidFabCasTagRail_${si}_${ci}`, {
        width: Math.min(0.2, casW * 0.8),
        height: 0.014,
        depth: 0.014,
      }, scene);
      tagRail.parent = root;
      tagRail.position.set(casX, casY + casH * 0.28, faceZ - 0.012);
      tagRail.material = midCasLip;
      tagRail.isPickable = false;
    } else if (faceKind === 2) {
      const handleWell = CreateBox(`bayMidFabCasHandleWell_${si}_${ci}`, {
        width: Math.min(0.16, casW * 0.65),
        height: 0.05,
        depth: 0.024,
      }, scene);
      handleWell.parent = root;
      handleWell.position.set(casX, casY + casH * 0.1, faceZ - 0.004);
      handleWell.material = midCasHandleWell;
      handleWell.isPickable = false;
      const handlePull = CreateBox(`bayMidFabCasHandle_${si}_${ci}`, {
        width: Math.min(0.12, casW * 0.5),
        height: 0.014,
        depth: 0.016,
      }, scene);
      handlePull.parent = root;
      handlePull.position.set(casX, casY + casH * 0.1, faceZ - 0.018);
      handlePull.material = midCasLip;
      handlePull.isPickable = false;
      mountLotPlate(
        `bayMidFabCasTag_${si}_${ci}`,
        casX,
        faceZ,
        casY - casH * 0.28,
        Math.min(0.14, casW * 0.62),
        0.038,
        [lot[0], lot[1]],
        true,
      );
    } else if (faceKind === 3) {
      for (let vi = 0; vi < 3; vi++) {
        const vent = CreateBox(`bayMidFabCasVent_${si}_${ci}_${vi}`, {
          width: Math.min(0.14, casW * 0.7),
          height: 0.022,
          depth: 0.012,
        }, scene);
        vent.parent = root;
        vent.position.set(casX - 0.01, casY + casH * 0.22 - vi * 0.04, faceZ - 0.01);
        vent.material = midCasVent;
        vent.isPickable = false;
      }
      const badge = CreateBox(`bayMidFabCasBadge_${si}_${ci}`, {
        width: 0.032,
        height: Math.min(0.14, casH * 0.55),
        depth: 0.01,
      }, scene);
      badge.parent = root;
      badge.position.set(casX + casW * 0.32, casY + 0.02, faceZ - 0.01);
      badge.material = midCasWinGlass;
      badge.isPickable = false;
      mountLotPlate(
        `bayMidFabCasTag_${si}_${ci}`,
        casX,
        faceZ,
        casY - casH * 0.3,
        Math.min(0.14, casW * 0.6),
        0.036,
        [lot[0]],
        true,
      );
    } else {
      const comboWell = CreateBox(`bayMidFabCasComboWell_${si}_${ci}`, {
        width: 0.09,
        height: 0.09,
        depth: 0.018,
      }, scene);
      comboWell.parent = root;
      comboWell.position.set(casX - casW * 0.12, casY + casH * 0.14, faceZ - 0.004);
      comboWell.material = midCasWinWell;
      comboWell.isPickable = false;
      const comboWin = CreateBox(`bayMidFabCasComboWin_${si}_${ci}`, {
        width: 0.072,
        height: 0.072,
        depth: 0.01,
      }, scene);
      comboWin.parent = root;
      comboWin.position.set(casX - casW * 0.12, casY + casH * 0.14, faceZ - 0.014);
      comboWin.material = midCasWinGlass;
      comboWin.isPickable = false;
      const barWell = CreateBox(`bayMidFabCasBarcode_${si}_${ci}Well`, {
        width: Math.min(0.18, casW * 0.78),
        height: 0.05,
        depth: 0.02,
      }, scene);
      barWell.parent = root;
      barWell.position.set(casX, casY - casH * 0.26, faceZ - 0.002);
      barWell.material = midCasWinWell;
      barWell.isPickable = false;
      const barBody = CreateBox(`bayMidFabCasBarcode_${si}_${ci}Body`, {
        width: Math.min(0.168, casW * 0.72),
        height: 0.042,
        depth: 0.03,
      }, scene);
      barBody.parent = root;
      barBody.position.set(casX, casY - casH * 0.26, faceZ - 0.016);
      barBody.material = midCasLotBody;
      barBody.isPickable = false;
      const barStep = CreateBox(`bayMidFabCasBarcode_${si}_${ci}Step`, {
        width: Math.min(0.156, casW * 0.66),
        height: 0.032,
        depth: 0.01,
      }, scene);
      barStep.parent = root;
      barStep.position.set(casX, casY - casH * 0.26, faceZ - 0.028);
      barStep.material = midCasLotBevel;
      barStep.isPickable = false;
      const bar = CreateBox(`bayMidFabCasBarcode_${si}_${ci}`, {
        width: Math.min(0.14, casW * 0.6),
        height: 0.026,
        depth: 0.008,
      }, scene);
      bar.parent = root;
      bar.position.set(casX, casY - casH * 0.26, faceZ - 0.036);
      bar.isPickable = false;
      applyLabel(bar, scene, {
        width: 256,
        height: 64,
        font: 'bold 26px monospace',
        lineHeight: 32,
        fill: '#968e7c',
        ink: '#141c24',
        align: 'center',
        lines: [`║║║ ${lot[0]} ║║║`],
      });
      for (const [suf, bw, bh, ox, oy] of [
        ['T', Math.min(0.164, casW * 0.7), 0.01, 0, 0.018],
        ['B', Math.min(0.164, casW * 0.7), 0.01, 0, -0.018],
        ['L', 0.01, 0.038, -Math.min(0.08, casW * 0.34), 0],
        ['R', 0.01, 0.038, Math.min(0.08, casW * 0.34), 0],
      ] as const) {
        const bevel = CreateBox(`bayMidFabCasBarcode_${si}_${ci}Bevel${suf}`, {
          width: bw,
          height: bh,
          depth: 0.016,
        }, scene);
        bevel.parent = root;
        bevel.position.set(casX + ox, casY - casH * 0.26 + oy, faceZ - 0.02);
        bevel.material = midCasLotBevel;
        bevel.isPickable = false;
      }
      mountLotPlate(
        `bayMidFabCasTag_${si}_${ci}`,
        casX + casW * 0.12,
        faceZ,
        casY + casH * 0.02,
        0.1,
        0.04,
        [lot[0], lot[1]],
        true,
      );
    }
  }
  // ★ feel41 — PARK end-cap uprights (were reading as Iris pillars flanking an opaque midband slab).
  // Keep literal mesh names for art-blend + Iris probes; park so midband is SMIF-only with open gaps.
  for (const side of ['L', 'R'] as const) {
    const eh = side === 'L' ? 0.95 : 0.85;
    const ey = side === 'L' ? 0.95 : 0.9;
    const endCapName = side === 'L' ? 'bayMidFabEndCapL' : 'bayMidFabEndCapR';
    const endCap = CreateBox(endCapName, { width: 0.16, height: eh, depth: 0.28 }, scene);
    endCap.parent = root;
    endCap.material = midFabMat;
    parkMid(endCap);
    const noseName = side === 'L' ? 'bayMidFabEndCapLNose' : 'bayMidFabEndCapRNose';
    const endNose = CreateBox(noseName, { width: 0.12, height: eh * 0.55, depth: 0.045 }, scene);
    endNose.parent = root;
    endNose.material = midFabRailSteel;
    parkMid(endNose);
    const fasciaName = side === 'L' ? 'bayMidFabEndCapLFascia' : 'bayMidFabEndCapRFascia';
    const endFascia = CreateBox(fasciaName, { width: 0.14, height: 0.08, depth: 0.06 }, scene);
    endFascia.parent = root;
    endFascia.material = midFabRailSteel;
    parkMid(endFascia);
    const screenName = side === 'L' ? 'bayMidFabEndCapLScreen' : 'bayMidFabEndCapRScreen';
    const endScreen = CreateBox(screenName, { width: 0.09, height: 0.11, depth: 0.02 }, scene);
    endScreen.parent = root;
    endScreen.material = midCasWinGlass;
    parkMid(endScreen);
    const ventYs =
      side === 'L'
        ? [ey + 0.15, ey - 0.05, ey - 0.28]
        : [ey + 0.2, ey + 0.02, ey - 0.16, ey - 0.32];
    for (let vi = 0; vi < ventYs.length; vi++) {
      const ventName = side === 'L' ? `bayMidFabEndCapLVent_${vi}` : `bayMidFabEndCapRVent_${vi}`;
      const vent = CreateBox(ventName, {
        width: 0.09 + (vi % 2) * 0.025,
        height: 0.024 + vi * 0.005,
        depth: 0.018,
      }, scene);
      vent.parent = root;
      vent.material = midPocketDark;
      parkMid(vent);
    }
    const raceName = side === 'L' ? 'bayMidFabEndCapLRace' : 'bayMidFabEndCapRRace';
    const endRace = CreateBox(raceName, { width: 0.045, height: eh * 0.75, depth: 0.05 }, scene);
    endRace.parent = root;
    endRace.material = baySteel;
    parkMid(endRace);
    const lampName = side === 'L' ? 'bayMidFabEndCapLLamp' : 'bayMidFabEndCapRLamp';
    const lampMatName = side === 'L' ? 'bayMidFabEndCapLLampMat' : 'bayMidFabEndCapRLampMat';
    const endLamp = CreateBox(lampName, { width: 0.05, height: 0.035, depth: 0.04 }, scene);
    endLamp.parent = root;
    endLamp.material = lamp(scene, lampMatName, new Color3(0.55, 0.95, 0.7), 1.15);
    parkMid(endLamp);
  }
  // ★ feel41 — PARK local midFabBackdrop (was reading as opaque fill slab between SMIF uprights).
  // Gaps must open to FAR niche bay wall (inspectNicheBack z≈2.58), not a midband brick.
  const midFabBackdropLit = matteNoise(scene, 'bayMidFabBackdropLitMat', new Color3(0.38, 0.4, 0.44), {
    variance: 14,
    speck: 0.05,
    size: 96,
    blotch: 0.4,
    emissive: 0.05,
  });
  midFabBackdropLit.fogEnabled = false;
  const midFabBackdrop = CreateBox('bayMidFabBackdrop', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midFabBackdrop.parent = root;
  midFabBackdrop.material = midFabBackdropLit;
  parkMid(midFabBackdrop);
  for (const bi of [0, 1, 2] as const) {
    const seam = CreateBox(`bayMidFabBackdropSeam_${bi}`, { width: 0.05, height: 0.05, depth: 0.05 }, scene);
    seam.parent = root;
    seam.material = midPocketDark;
    parkMid(seam);
  }
  // Park legacy bridge/cheek/corridor/wing/plinth slabs that filled Iris midband as one upright wall.
  const midFabBridgeL = CreateBox('bayMidFabBridgeL', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midFabBridgeL.parent = root;
  midFabBridgeL.material = midFabMat;
  parkMid(midFabBridgeL);
  const midFabCheekL = CreateBox('bayMidFabCheekL', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midFabCheekL.parent = root;
  midFabCheekL.material = midFabMat;
  parkMid(midFabCheekL);
  const midFabCheekR = CreateBox('bayMidFabCheekR', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midFabCheekR.parent = root;
  midFabCheekR.material = midFabMat;
  parkMid(midFabCheekR);
  const midCorridor = CreateBox('bayMidCorridor', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midCorridor.parent = root;
  midCorridor.material = bayEquipMat;
  parkMid(midCorridor);
  const midSpineWingL = CreateBox('bayMidSpineWingL', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midSpineWingL.parent = root;
  midSpineWingL.material = bayEquipMat;
  parkMid(midSpineWingL);
  const midSpineWingR = CreateBox('bayMidSpineWingR', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midSpineWingR.parent = root;
  midSpineWingR.material = bayEquipMat;
  parkMid(midSpineWingR);
  const midDeckBridge = CreateBox('bayMidDeckBridge', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midDeckBridge.parent = root;
  midDeckBridge.material = baySteel;
  parkMid(midDeckBridge);
  const midSpinePlinth = CreateBox('bayMidSpinePlinth', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midSpinePlinth.parent = root;
  midSpinePlinth.material = baySteel;
  parkMid(midSpinePlinth);
  const midSpineKick = CreateBox('bayMidSpineKick', { width: 0.2, height: 0.05, depth: 0.2 }, scene);
  midSpineKick.parent = root;
  midSpineKick.material = bayEquipDark;
  parkMid(midSpineKick);
  // Door inlays / rails — park (were continuous corridor face in Iris FOV).
  for (let pi = 0; pi < 9; pi++) {
    const panel = CreateBox(`bayMidSpinePanel_${pi}`, { width: 0.1, height: 0.1, depth: 0.02 }, scene);
    panel.parent = root;
    panel.material =
      pi % 3 === 1
        ? matte(scene, `bayMidSpineDoorMat_${pi}`, new Color3(0.24, 0.28, 0.3), 0.02)
        : bayEquipDark;
    panel.material.fogEnabled = false;
    parkMid(panel);
  }
  for (let ri = 0; ri < 3; ri++) {
    const rail = CreateBox(`bayMidSpineRail_${ri}`, { width: 0.1, height: 0.02, depth: 0.02 }, scene);
    rail.parent = root;
    rail.material = baySteel;
    parkMid(rail);
  }
  // Keep art-blend names from feel15 — park so they don't rebuild the midband slab.
  const gapConsole = CreateBox('bayGapConsole', { width: 0.2, height: 0.1, depth: 0.1 }, scene);
  gapConsole.parent = root;
  gapConsole.material = bayEquipDark;
  parkMid(gapConsole);
  const gapConsoleTier = CreateBox('bayGapConsoleTier', { width: 0.2, height: 0.05, depth: 0.1 }, scene);
  gapConsoleTier.parent = root;
  gapConsoleTier.material = baySteel;
  parkMid(gapConsoleTier);
  const gapScreen = CreateBox('bayGapScreen', { width: 0.1, height: 0.05, depth: 0.02 }, scene);
  gapScreen.parent = root;
  gapScreen.material = lamp(scene, 'bayGapScreenMat', new Color3(0.1, 0.22, 0.2), 0.28);
  parkMid(gapScreen);
  const gapCassette0 = CreateBox('bayGapCassette_0', { width: 0.1, height: 0.04, depth: 0.08 }, scene);
  gapCassette0.parent = root;
  gapCassette0.material = matte(scene, 'bayGapCassetteMat_0', new Color3(0.24, 0.3, 0.32), 0.04);
  gapCassette0.material.fogEnabled = false;
  parkMid(gapCassette0);
  const gapCasFrame = CreateBox('bayGapCasFrame', { width: 0.05, height: 0.2, depth: 0.08 }, scene);
  gapCasFrame.parent = root;
  gapCasFrame.material = baySteel;
  parkMid(gapCasFrame);
  const gapCartStub = CreateBox('bayGapCartStub', { width: 0.15, height: 0.2, depth: 0.12 }, scene);
  gapCartStub.parent = root;
  gapCartStub.material = bayEquipDark;
  parkMid(gapCartStub);

  // ★ feel42 — park metrology head (was dark midband debris over SMIF gaps).
  const midHead = CreateBox('bayMidHead', { width: 0.2, height: 0.1, depth: 0.1 }, scene);
  midHead.parent = root;
  midHead.material = baySteel;
  parkMid(midHead);
  const midHeadLens = CreateCylinder('bayMidHeadLens', { diameter: 0.05, height: 0.03, tessellation: 10 }, scene);
  midHeadLens.parent = root;
  midHeadLens.material = lamp(scene, 'bayMidHeadLensMat', new Color3(0.35, 0.5, 0.55), 0.4);
  parkMid(midHeadLens);

  // ★ feel41/42 — park midBulk (midband slab behind SMIF gaps).
  const midBulk = CreateBox('bayMidBulk', { width: 0.2, height: 0.2, depth: 0.2 }, scene);
  midBulk.parent = root;
  midBulk.material = bayEquipMat;
  parkMid(midBulk);
  // feel40/41 — park forward bulk face (was the opaque slab filling Iris FOV at z≈0.42).
  const midBulkFace = CreateBox('bayMidBulkFace', { width: 0.2, height: 0.2, depth: 0.05 }, scene);
  midBulkFace.parent = root;
  midBulkFace.material = matteNoise(scene, 'bayMidBulkFaceMat', new Color3(0.4, 0.42, 0.46), {
    variance: 14,
    speck: 0.06,
    size: 96,
    blotch: 0.45,
    emissive: 0.055,
  });
  midBulkFace.material.fogEnabled = false;
  parkMid(midBulkFace);
  const midBulkLamp = CreateBox('bayMidBulkLamp', { width: 0.2, height: 0.05, depth: 0.05 }, scene);
  midBulkLamp.parent = root;
  midBulkLamp.material = lamp(scene, 'bayMidBulkLampMat', new Color3(1, 0.9, 0.72), 1.05);
  parkMid(midBulkLamp);

  // Side racks — park (were fused into spine flanks / midband upright wall).
  for (let ri = 0; ri < 2; ri++) {
    const rack = CreateBox(`baySideRack_${ri}`, { width: 0.15, height: 0.2, depth: 0.15 }, scene);
    rack.parent = root;
    rack.material = bayEquipMat;
    parkMid(rack);
    const rackFace = CreateBox(`baySideRackFace_${ri}`, { width: 0.1, height: 0.15, depth: 0.02 }, scene);
    rackFace.parent = root;
    rackFace.material = matte(scene, `baySideRackFaceMat_${ri}`, new Color3(0.26, 0.3, 0.32), 0.025);
    rackFace.material.fogEnabled = false;
    parkMid(rackFace);
  }

  // ★ feel42 — park overhead conduit + hangs (horizontal rails dirtying Iris midband behind SMIF).
  const conduitRun = CreateBox('bayConduitRun', { width: 0.1, height: 0.08, depth: 0.2 }, scene);
  conduitRun.parent = root;
  conduitRun.material = baySteel;
  parkMid(conduitRun);
  const conduitRun2 = CreateBox('bayConduitRun2', { width: 0.08, height: 0.06, depth: 0.2 }, scene);
  conduitRun2.parent = root;
  conduitRun2.material = metal(scene, 'bayConduitRun2Mat', new Color3(0.46, 0.49, 0.54), 0.22);
  conduitRun2.material.fogEnabled = false;
  parkMid(conduitRun2);
  for (const ci of [0, 1, 2, 3] as const) {
    const hang = CreateCylinder(`bayConduitHang_${ci}`, { diameter: 0.04, height: 0.1, tessellation: 8 }, scene);
    hang.parent = root;
    hang.material = bayEquipDark;
    parkMid(hang);
  }
  // Utility column — feel44 further outboard (Iris +X quiet).
  const utilCol = CreateBox('bayUtilCol', { width: 0.26, height: 1.55, depth: 0.26 }, scene);
  utilCol.parent = root;
  utilCol.position.set(1.55, 1.25, 1.25);
  utilCol.material = bayEquipMat;
  utilCol.isPickable = false;
  const utilPanel = CreateBox('bayUtilPanel', { width: 0.2, height: 0.45, depth: 0.04 }, scene);
  utilPanel.parent = root;
  utilPanel.position.set(1.55, 1.42, 1.12);
  utilPanel.material = matte(scene, 'bayUtilPanelMat', new Color3(0.26, 0.3, 0.32), 0.03);
  utilPanel.material.fogEnabled = false;
  utilPanel.isPickable = false;

  // Distant FFU — feel42 deep niche only (was a midband horizontal slab behind SMIF).
  const farFfu = CreateBox('bayFarFfu', { width: 1.4, height: 0.14, depth: 0.4 }, scene);
  farFfu.parent = root;
  farFfu.position.set(0.05, 2.05, 2.15);
  farFfu.material = hepaFrameMat;
  farFfu.isPickable = false;
  const farFfuFace = CreateBox('bayFarFfuFace', { width: 1.2, height: 0.055, depth: 0.32 }, scene);
  farFfuFace.parent = root;
  farFfuFace.position.set(0.05, 1.95, 2.15);
  farFfuFace.material = hepaMatShared;
  farFfuFace.isPickable = false;

  // Side-wall return grille — feel44 push +X (was busy mass next to stamps in Iris).
  const midReturn = CreateBox('bayMidReturn', { width: 0.5, height: 0.45, depth: 0.05 }, scene);
  midReturn.parent = root;
  midReturn.position.set(1.55, 1.45, 0.85);
  midReturn.material = returnMat;
  midReturn.material.fogEnabled = false;
  midReturn.isPickable = false;
  const midReturnFrame = CreateBox('bayMidReturnFrame', { width: 0.56, height: 0.5, depth: 0.04 }, scene);
  midReturnFrame.parent = root;
  midReturnFrame.position.set(1.55, 1.45, 0.88);
  midReturnFrame.material = hepaFrameMat;
  midReturnFrame.isPickable = false;

  // --- Workbench ------------------------------------------------------------
  // Thinner deck + perimeter chamfers — same top plane (~0.995), less brick edge.
  const bench = CreateBox('workbench', { width: 2.6, height: 0.04, depth: 1.15 }, scene);
  bench.parent = root;
  bench.position.set(0, 0.975, 0.2);
  // Cool epoxy laminate — lab bench, not warm wood plank. Richer ORM so deck isn't a floaty plane.
  const benchMat = laminate(scene, 'benchMat', new Color3(0.42, 0.43, 0.45), {
    variance: 26,
    speck: 0.14,
    size: 256,
    tileHint: 'fine',
    blotch: 0.7,
    emissive: 0.012,
    uScale: 4.2,
    vScale: 2.2,
    polish: 0.38,
  });
  bench.material = benchMat;
  bench.receiveShadows = true;
  bench.isPickable = false;
  lighting?.addCaster(bench);

  // Dark matte deck trim — prior metal wallTrim lit up as RCA left bracket rails in Iris.
  const benchEdgeMat = matte(scene, 'benchEdgeMat', new Color3(0.14, 0.13, 0.12), 0.01);
  for (const [ei, w, d, x, z] of [
    [0, 2.5, 0.01, 0, -0.37],
    [1, 2.5, 0.01, 0, 0.77],
    // Left/right edges inset — never stick past RCA cheek as a thin furniture rail.
    [2, 0.01, 1.05, -1.2, 0.2],
    [3, 0.01, 1.05, 1.2, 0.2],
  ] as const) {
    const edge = CreateBox(`benchEdge${ei}`, { width: w, height: 0.01, depth: d }, scene);
    edge.parent = root;
    edge.position.set(x, 0.988, z);
    edge.material = benchEdgeMat;
    edge.isPickable = false;
  }
  // Narrow/dark undercut — prior wide mid-grey lip read as RCA left horizontal bracket.
  const benchUndercut = CreateBox('benchUndercut', { width: 2.2, height: 0.012, depth: 0.95 }, scene);
  benchUndercut.parent = root;
  benchUndercut.position.set(0.05, 0.946, 0.22);
  benchUndercut.material = matte(scene, 'benchUndercutMat', new Color3(0.08, 0.075, 0.07), 0.004);
  benchUndercut.isPickable = false;

  const apron = CreateBox('benchApron', { width: 2.6, height: 0.12, depth: 0.04 }, scene);
  apron.parent = root;
  apron.position.set(0, 0.86, 0.76);
  apron.material = matteNoise(scene, 'apronMat', new Color3(0.36, 0.34, 0.32), {
    variance: 14,
    speck: 0.07,
    size: 128,
    tileHint: 'fine',
    blotch: 0.45,
    emissive: 0.025,
    uScale: 2.6,
    vScale: 1.2,
  });
  apron.isPickable = false;

  // Cheap contact shadow strips — AO feel without post cost / lighting spam.
  const deckContact = CreateBox('deckContact', { width: 2.55, height: 0.012, depth: 0.08 }, scene);
  deckContact.parent = root;
  deckContact.position.set(0, 0.938, 0.74);
  deckContact.material = matte(scene, 'deckContactMat', new Color3(0.06, 0.05, 0.045), 0);
  deckContact.isPickable = false;
  deckContact.receiveShadows = true;
  const deckContactBack = CreateBox('deckContactBack', { width: 2.5, height: 0.01, depth: 0.05 }, scene);
  deckContactBack.parent = root;
  deckContactBack.position.set(0, 0.948, -0.34);
  deckContactBack.material = matte(scene, 'deckContactBackMat', new Color3(0.07, 0.06, 0.055), 0);
  deckContactBack.isPickable = false;

  const legMeshes: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh[] = [];
  // Heavy under-bench service mass — kills thin furniture-leg desk read in Iris crop.
  const underMass = CreateBox('benchUnderMass', { width: 2.45, height: 0.72, depth: 0.95 }, scene);
  underMass.parent = root;
  underMass.position.set(0, 0.4, 0.18);
  underMass.material = matteNoise(scene, 'benchUnderMassMat', new Color3(0.28, 0.3, 0.32), {
    variance: 12,
    speck: 0.06,
    size: 128,
    blotch: 0.45,
    emissive: 0.02,
    uScale: 2.2,
    vScale: 1.4,
  });
  underMass.isPickable = false;
  legMeshes.push(underMass);
  const legs = [
    [-1.15, 0.55],
    [1.15, 0.55],
    [-1.15, -0.2],
    [1.15, -0.2],
  ] as const;
  for (const [x, z] of legs) {
    const leg = CreateBox(`leg_${x}_${z}`, { width: 0.06, height: 0.93, depth: 0.06 }, scene);
    leg.parent = root;
    leg.position = new Vector3(x, 0.465, z);
    leg.material = metal(scene, `legMat_${x}_${z}`, COLORS.bench.scale(0.7), 0.14);
    leg.isPickable = false;
    legMeshes.push(leg);
  }

  // Under-bench shelf
  const shelf = CreateBox('underShelf', { width: 2.4, height: 0.03, depth: 0.9 }, scene);
  shelf.parent = root;
  shelf.position.set(0, 0.28, 0.15);
  shelf.material = matte(scene, 'shelfMat', COLORS.bench.scale(0.75));
  shelf.isPickable = false;

  // ESD mat under closed FOUP + extracted wafer — rubber grain + thickness so it isn't a pasted black card.
  const esd = CreateBox('esdMat', { width: 0.95, height: 0.014, depth: 0.55 }, scene);
  esd.parent = root;
  esd.position.set(-0.55, 1.003, -0.02);
  const esdMat = rubber(scene, 'esdMat', new Color3(0.1, 0.12, 0.14), {
    noise: true,
    variance: 16,
    speck: 0.2,
    contactAo: true,
    uScale: 3.6,
    vScale: 2.6,
  });
  esd.material = esdMat;
  esd.receiveShadows = true;
  esd.isPickable = false;
  // Beveled ESD lip — reads as a real mat edge, not a zero-thickness decal.
  const esdLip = CreateBox('esdLip', { width: 0.97, height: 0.006, depth: 0.57 }, scene);
  esdLip.parent = root;
  esdLip.position.set(-0.55, 0.993, -0.02);
  esdLip.material = rubber(scene, 'esdLipMat', new Color3(0.07, 0.08, 0.09));
  esdLip.isPickable = false;
  // Soft contact pool under FOUP/ESD so the pod doesn't float on the deck.
  const esdContact = CreateBox('esdContact', { width: 1.02, height: 0.008, depth: 0.62 }, scene);
  esdContact.parent = root;
  esdContact.position.set(-0.55, 0.99, -0.02);
  esdContact.material = matte(scene, 'esdContactMat', new Color3(0.035, 0.03, 0.028), 0);
  esdContact.isPickable = false;
  esdContact.receiveShadows = true;
  // Radial contact blob under FOUP footprint — grounds shell without FOUP mesh churn.
  const foupBlob = CreateBox('foupContactBlob', { width: 0.62, height: 0.005, depth: 0.54 }, scene);
  foupBlob.parent = root;
  foupBlob.position.set(-0.7, 1.013, 0.02);
  foupBlob.material = contactBlobMat(scene, 'foupContactBlobMat', { soft: 0.92, core: 0.03, strength: 0.98 });
  foupBlob.isPickable = false;
  foupBlob.receiveShadows = true;
  // Harder ring under FOUP pedestal — readable contact even when Iris SSAO is soft.
  const foupRing = CreateBox('foupContactRing', { width: 0.48, height: 0.005, depth: 0.44 }, scene);
  foupRing.parent = root;
  foupRing.position.set(-0.7, 1.009, 0.02);
  foupRing.material = matte(scene, 'foupContactRingMat', new Color3(0.015, 0.012, 0.01), 0);
  foupRing.isPickable = false;
  // Secondary soft pool under wafer stage seat.
  const waferBlob = CreateBox('waferContactBlob', { width: 0.46, height: 0.005, depth: 0.4 }, scene);
  waferBlob.parent = root;
  waferBlob.position.set(-0.28, 1.011, 0.18);
  waferBlob.material = contactBlobMat(scene, 'waferContactBlobMat', { soft: 0.86, core: 0.05, strength: 0.94 });
  waferBlob.isPickable = false;

  // Diegetic FOUP lot plate — angled upright at FOUP feet so Iris reads cassette ID.
  const lotPlate = CreateBox('foupLotPlate', { width: 0.26, height: 0.07, depth: 0.008 }, scene);
  lotPlate.parent = root;
  lotPlate.position.set(-0.7, 1.045, 0.32);
  lotPlate.rotation.x = -0.55;
  {
    const lotTex = new DynamicTexture('foupLotTex', { width: 320, height: 128 }, scene, false);
    const ctx = lotTex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = '#0a1218';
    ctx.fillRect(0, 0, 320, 128);
    ctx.fillStyle = '#7fe0b4';
    ctx.font = 'bold 32px monospace';
    ctx.fillText('FOUP 300mm', 20, 48);
    ctx.fillStyle = '#d0e0f0';
    ctx.font = '24px monospace';
    ctx.fillText('LOT D200 · SEATED', 20, 92);
    lotTex.update();
    const lotMat = new PBRMaterial('foupLotMat', scene);
    lotMat.albedoTexture = lotTex;
    lotMat.emissiveTexture = lotTex;
    lotMat.emissiveColor = new Color3(0.28, 0.34, 0.3);
    lotMat.metallic = 0.08;
    lotMat.roughness = 0.5;
    lotMat.environmentIntensity = 0.18;
    lotMat.fogEnabled = false;
    lotPlate.material = lotMat;
  }
  lotPlate.isPickable = false;

  // ★ feel44 — bench deck clutter tucked deep +X (was IPA/kimwipe noise next to stamps in Iris).
  const wipeBox = CreateBox('kimwipeBox', { width: 0.14, height: 0.08, depth: 0.1 }, scene);
  wipeBox.parent = root;
  wipeBox.position.set(1.28, 1.02, 0.95);
  wipeBox.material = matte(scene, 'kimwipeMat', new Color3(0.55, 0.56, 0.58), 0.04);
  wipeBox.isPickable = false;
  const wipeLid = CreateBox('kimwipeLid', { width: 0.14, height: 0.012, depth: 0.1 }, scene);
  wipeLid.parent = root;
  wipeLid.position.set(1.28, 1.07, 0.95);
  wipeLid.material = matte(scene, 'kimwipeLidMat', new Color3(0.35, 0.42, 0.48), 0.06);
  wipeLid.isPickable = false;

  const tweezers = CreateBox('tweezers', { width: 0.012, height: 0.008, depth: 0.14 }, scene);
  tweezers.parent = root;
  tweezers.position.set(1.18, 0.995, 0.88);
  tweezers.rotation.y = 0.35;
  tweezers.material = metal(scene, 'tweezersMat', new Color3(0.55, 0.56, 0.58), 0.35);
  tweezers.isPickable = false;

  const ipa = CreateCylinder('ipaBottle', { diameter: 0.05, height: 0.12, tessellation: 12 }, scene);
  ipa.parent = root;
  ipa.position.set(1.22, 1.04, 0.92);
  ipa.material = matte(scene, 'ipaMat', new Color3(0.28, 0.32, 0.3), 0.03);
  ipa.isPickable = false;
  const ipaCap = CreateCylinder('ipaCap', { diameter: 0.035, height: 0.025, tessellation: 10 }, scene);
  ipaCap.parent = root;
  ipaCap.position.set(1.22, 1.12, 0.92);
  ipaCap.material = metal(scene, 'ipaCapMat', COLORS.wallTrim, 0.25);
  ipaCap.isPickable = false;

  // Compact SOP placard parked far-left on the back wall (was mid-left grey mass).
  const placard = CreateBox('sopPlacard', { width: 0.42, height: 0.28, depth: 0.015 }, scene);
  placard.parent = root;
  placard.position.set(-2.85, 1.95, -1.55);
  const placardTex = new DynamicTexture('sopTex', { width: 512, height: 320 }, scene, false);
  {
    const ctx = placardTex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = '#1a3040';
    ctx.fillRect(0, 0, 512, 320);
    ctx.fillStyle = '#7fd9b0';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('CLEANROOM SOP', 28, 48);
    ctx.fillStyle = '#c8d8e8';
    ctx.font = '22px monospace';
    const lines = [
      '1. Read traveler before stamp',
      '2. Run required metrology',
      '3. Disposition: Accept/Reject/Rework',
      '4. FOUP load only when armed',
    ];
    let y = 100;
    for (const line of lines) {
      ctx.fillText(line, 28, y);
      y += 42;
    }
    placardTex.update();
  }
  const placardMat = new PBRMaterial('sopMat', scene);
  placardMat.albedoTexture = placardTex;
  placardMat.emissiveTexture = placardTex;
  placardMat.emissiveColor = new Color3(0.22, 0.26, 0.24);
  placardMat.metallic = 0;
  placardMat.roughness = 0.85;
  placardMat.environmentIntensity = 0.15;
  placardMat.fogEnabled = false;
  placard.material = placardMat;
  placard.isPickable = false;

  // Slim overhead cable tray — prior wide boom read as another grey scaffold beam.
  const boom = CreateBox('toolBoom', { width: 1.4, height: 0.035, depth: 0.05 }, scene);
  boom.parent = root;
  boom.position.set(0.35, 2.2, 0.15);
  boom.material = matte(scene, 'boomMat', new Color3(0.38, 0.4, 0.42), 0.03);
  boom.isPickable = false;

  const station = new TransformNode('station', scene);
  station.parent = root;

  const stage = new WaferStage(scene, station);
  const foup = new Foup(scene, station);
  const instruments = new InstrumentCluster(scene, tools, station);
  const traveler = new Traveler(scene, station);
  const stamps = new StampBank(scene, station);
  const boards = new PhaseBoards(scene, root);

  lighting?.addCaster(stage.wafer);
  lighting?.addCaster(foup.body);

  /**
   * Deck furniture removed when a rework cabinet occupies the slot.
   * Legs + service rail included — otherwise they read as grey scaffold beams.
   */
  const parkables = [
    bench,
    apron,
    deckContact,
    deckContactBack,
    esd,
    esdLip,
    esdContact,
    foupBlob,
    foupRing,
    waferBlob,
    lotPlate,
    shelf,
    boom,
    rail,
    wipeBox,
    wipeLid,
    tweezers,
    ipa,
    ipaCap,
    ...legMeshes,
  ];
  /** Content GLBs registered after dress — fully hidden with the deck (no ghost slabs). */
  const scenicPark: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh[] = [];

  return {
    root,
    stage,
    foup,
    instruments,
    traveler,
    stamps,
    boards,
    scenicShells: {
      bench,
      backWall: back,
      foupBody: foup.body,
      foupShell: foup.scenicShells(),
      instrumentChassis: instruments.scenicChassis(),
    },
    parkScenicProps(meshes) {
      scenicPark.length = 0;
      scenicPark.push(...meshes);
    },
    setStationVisible(visible) {
      // Hard-hide the inspection station during rework. Visibility 0.2 ghosts
      // were the large grey deck occluder in RCA/CMP/silicide screenshots.
      // Room shell (walls/floor/cove/HEPA) stays up so framing reads as a bay.
      station.setEnabled(visible);
      station.position.set(0, 0, 0);
      back.setEnabled(true);
      left.setEnabled(true);
      right.setEnabled(true);
      front.setEnabled(true);
      floor.setEnabled(true);
      ceiling.setEnabled(true);
      kick.setEnabled(true);
      coveBack.setEnabled(true);
      coveFront.setEnabled(true);
      for (const m of parkables) {
        // Skip shells permanently replaced by a content GLB (Workbench etc.).
        if (visible && m.metadata?.propReplaced) continue;
        m.setEnabled(visible);
        m.visibility = visible ? 1 : 0;
      }
      for (const m of scenicPark) {
        m.setEnabled(visible);
        if (!visible) m.visibility = 0;
        else m.visibility = 1;
      }
    },
  };
}
