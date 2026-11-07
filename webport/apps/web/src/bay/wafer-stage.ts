import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { COLORS, metal, silicon } from '../bootstrap/materials.js';

/** Die-grid wafer face — readable silicon plate, not a flat blue disc. */
function waferSurfaceMat(scene: Scene): PBRMaterial {
  const tex = new DynamicTexture('waferDieTex', { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  // Cool silicon base + dual-scale grain (NullEngine-safe: rects only).
  const hash = (x: number, y: number) => {
    let n = (x * 374761393 + y * 668265263) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  for (let y = 0; y < 512; y += 2) {
    for (let x = 0; x < 512; x += 2) {
      const d = (hash(x, y) - 0.5) * 32;
      const blotch = (hash((x / 20) | 0, (y / 20) | 0) - 0.5) * 22;
      const r = Math.max(0, Math.min(255, Math.round(98 + d * 0.5 + blotch * 0.4)));
      const g = Math.max(0, Math.min(255, Math.round(126 + d * 0.65 + blotch * 0.55)));
      const b = Math.max(0, Math.min(255, Math.round(172 + d + blotch * 0.7)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  // Soft vignette via concentric rects (WebGL + NullEngine safe).
  ctx.fillStyle = 'rgba(154,176,208,0.28)';
  ctx.fillRect(96, 96, 320, 320);
  for (let r = 0; r < 40; r++) {
    const inset = r * 3;
    if (inset >= 250) break;
    ctx.fillStyle = `rgba(40,52,72,${0.015 + r * 0.004})`;
    ctx.fillRect(inset, inset, 512 - inset * 2, 4);
    ctx.fillRect(inset, 512 - inset - 4, 512 - inset * 2, 4);
    ctx.fillRect(inset, inset, 4, 512 - inset * 2);
    ctx.fillRect(512 - inset - 4, inset, 4, 512 - inset * 2);
  }
  // Die streets — high-contrast so the plate reads at inspection distance.
  ctx.strokeStyle = 'rgba(8,12,22,0.78)';
  ctx.lineWidth = 2;
  const pitch = 28;
  for (let i = 0; i <= 512; i += pitch) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }
  // Sparse die fills for pattern read
  ctx.fillStyle = 'rgba(200,230,255,0.22)';
  for (let y = 2; y < 18; y++) {
    for (let x = 2; x < 18; x++) {
      if ((x + y) % 3 === 0) ctx.fillRect(x * pitch + 3, y * pitch + 3, pitch - 6, pitch - 6);
    }
  }
  // Notch / flat orientation cue (rect — NullEngine canvas lacks arc())
  ctx.fillStyle = 'rgba(8,10,16,0.82)';
  ctx.fillRect(238, 474, 36, 28);
  // Lot laser mark stub
  ctx.fillStyle = 'rgba(240,248,255,0.55)';
  ctx.font = 'bold 22px monospace';
  ctx.fillText('D200', 210, 40);
  tex.update();

  const m = new PBRMaterial('waferDieMat', scene);
  m.albedoTexture = tex;
  m.albedoColor = new Color3(0.92, 0.96, 1);
  // Specular silicon plate — edge/specular punch under real GL (not chalk disc).
  m.metallic = 0.58;
  m.roughness = 0.14;
  m.environmentIntensity = 0.92;
  m.specularIntensity = 0.98;
  m.directIntensity = 1.12;
  // Cool lift so die streets stay readable under task/key.
  m.emissiveColor = new Color3(0.12, 0.16, 0.26);
  m.fogEnabled = false;
  return m;
}

export class WaferStage {
  readonly root: TransformNode;
  readonly wafer: AbstractMesh;
  readonly mount: AbstractMesh;
  private tiltX = 0;
  private tiltZ = 0;
  private readonly waferMat: PBRMaterial;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('waferStage', scene);
    if (parent) this.root.parent = parent;
    // Extracted beside closed FOUP window — clear of cavity, still associated.
    this.root.position = new Vector3(-0.38, 1.16, 0.16);

    // Slim collar only — chunky chuck rings stole the FOUP/window hero read.
    const collar = CreateCylinder('chuckCollar', { diameter: 0.22, height: 0.02, tessellation: 24 }, scene);
    collar.parent = this.root;
    collar.position.y = -0.012;
    collar.material = metal(scene, 'chuckCollarMat', COLORS.housing, 0.22);
    collar.isPickable = false;

    this.mount = CreateCylinder('waferMount', { diameter: 0.18, height: 0.028, tessellation: 28 }, scene);
    this.mount.parent = this.root;
    this.mount.material = metal(scene, 'mountMat', COLORS.bench, 0.35);
    this.mount.isPickable = false;

    this.waferMat = waferSurfaceMat(scene);
    this.wafer = CreateCylinder('waferDisk', { diameter: 0.3, height: 0.005, tessellation: 64 }, scene);
    this.wafer.parent = this.root;
    this.wafer.position.y = 0.04;
    this.wafer.material = this.waferMat;
    this.wafer.isPickable = true;
    this.wafer.metadata = { interact: 'wafer' };
    // Steeper pitch — circular specular disc reads as pulled from FOUP slots.
    this.tiltX = 0.62;
    this.wafer.rotation.x = this.tiltX;

    // Beveled edge ring — brighter silicon catchlight on the perimeter.
    const rim = CreateTorus('waferRim', { diameter: 0.295, thickness: 0.01, tessellation: 56 }, scene);
    rim.parent = this.wafer;
    rim.position.y = 0.0015;
    rim.rotation.x = Math.PI / 2;
    const rimMat = silicon(scene, 'waferRimMat', COLORS.waferLit);
    rimMat.metallic = 0.72;
    rimMat.roughness = 0.1;
    rimMat.specularIntensity = 1.05;
    rimMat.environmentIntensity = 1.0;
    // Quiet silicon edge — high emissive read as a cheap wireframe gizmo.
    rimMat.emissiveColor = COLORS.waferLit.scale(0.08);
    rim.material = rimMat;
    rim.isPickable = false;

    // Flat edge (wafer notch) for orientation readability
    const flat = CreateBox('waferFlat', { width: 0.07, height: 0.006, depth: 0.014 }, scene);
    flat.parent = this.wafer;
    flat.position.set(0, 0, -0.145);
    flat.material = this.waferMat;
    flat.isPickable = false;
  }

  setPresent(present: boolean): void {
    this.wafer.setEnabled(present);
  }

  /** Visual hint from evidence — out of spec brightens the wafer. */
  setEvidenceTone(outOfSpec: boolean, killer: boolean): void {
    if (killer) this.waferMat.emissiveColor = COLORS.fault.scale(0.45);
    else if (outOfSpec) this.waferMat.emissiveColor = COLORS.warn.scale(0.35);
    else this.waferMat.emissiveColor = new Color3(0.12, 0.15, 0.22);
  }

  /** Mouse-drag tilt under cross-lighting (GDD §4 desktop). */
  nudgeTilt(dx: number, dy: number): void {
    this.tiltZ = Math.max(-0.45, Math.min(0.45, this.tiltZ + dx * 0.004));
    this.tiltX = Math.max(-0.45, Math.min(0.45, this.tiltX + dy * 0.004));
    this.wafer.rotation.x = this.tiltX;
    this.wafer.rotation.z = this.tiltZ;
  }

  resetTilt(): void {
    // Rest pose: extracted disc facing the orbit (matches closed FOUP hero).
    this.tiltX = 0.62;
    this.tiltZ = 0;
    this.wafer.rotation.set(this.tiltX, 0, 0);
  }
}
