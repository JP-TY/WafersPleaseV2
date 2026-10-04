/**
 * Physical props and materials — the difference between a screen and an object.
 *
 * Everything in this game was an emissive quad with a Canvas2D texture painted on
 * it. That reads as a television showing a picture of a clipboard, not as a
 * clipboard. Three things make an object diegetic, and all three are missing from
 * a textured quad:
 *
 *  1. IT IS LIT. Paper is diffuse. It catches the room light, receives shadow,
 *     and goes dark when the lights go down. An emissive quad cannot, which is
 *     why a glowing "printed form" looks wrong in a way that is hard to name.
 *  2. IT HAS AFFORDANCES. A knob rotates. A switch throws. A button depresses.
 *     A canvas that repaints when you click a rectangle inside it is a GUI wearing
 *     a costume.
 *  3. IT HAS WEAR. Screws, seams, vents, nameplates, fingerprints on a bezel,
 *     a cable that droops. Absence of detail is what makes CG props read as
 *     untextured geometry.
 *
 * Everything here is procedural: no texture downloads, and the props are cheap
 * primitives with enough variation to stop reading as a kitbash.
 */

import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { painted, rubber, steel } from './lighting.js';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * Paper.
 *
 * Diffuse and lit, NOT emissive. This is the single most important material in
 * the file: the traveler, the quiz board and the training record are all printed
 * forms, and a printed form glows only because a monitor is behind it.
 *
 * `albedoTexture` carries the ink; a faint sheen stands in for the slight gloss of
 * a coated print, which is what stops it reading as matte cardboard.
 */
export function paper(scene: Scene, name: string, texture: DynamicTexture): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoTexture = texture;
  // Paper is a dielectric with a broad, weak specular.
  m.metallic = 0;
  m.roughness = 0.82;
  m.environmentIntensity = 0.8;
  m.specularIntensity = 0.35;
  return m;
}

/** Greyboard backing, visible along the edge of a paper sheet. */
export function cardboard(scene: Scene, name: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = new Color3(0.28, 0.25, 0.21);
  m.metallic = 0;
  m.roughness = 0.94;
  m.environmentIntensity = 0.6;
  return m;
}

/** Injection-moulded instrument housing: slightly textured, semi-gloss. */
export function housing(scene: Scene, name: string, color = '#2c313a'): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = 0;
  m.roughness = 0.46;
  m.environmentIntensity = 0.85;
  return m;
}

/** Anodised aluminium, for faceplates and bezels. */
export function anodised(scene: Scene, name: string, color = '#6a727c'): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = Color3.FromHexString(color);
  m.metallic = 0.85;
  m.roughness = 0.38;
  m.environmentIntensity = 1;
  return m;
}

/** Screen glass: a faint reflective sheen over whatever is behind it. */
export function screenGlass(scene: Scene, name: string): PBRMaterial {
  const m = new PBRMaterial(name, scene);
  m.albedoColor = new Color3(0.02, 0.025, 0.035);
  m.metallic = 0.1;
  m.roughness = 0.08;
  m.environmentIntensity = 1.4;
  m.alpha = 0.12;
  m.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  return m;
}

/**
 * A lit indicator lamp.
 *
 * The small detail that sells an instrument as powered: a green "RUN" lamp that
 * is dark until the tool is actually running.
 */
export function indicator(scene: Scene, name: string, color: string, on: boolean): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.Black();
  m.specularColor = new Color3(0.4, 0.4, 0.4);
  const c = Color3.FromHexString(color);
  m.emissiveColor = on ? c.scale(1.6) : c.scale(0.09);
  m.disableLighting = false;
  return m;
}

// ---------------------------------------------------------------------------
// Fasteners and trim
// ---------------------------------------------------------------------------

/** A panel screw. Four per bezel is the detail that sells "manufactured". */
export function screws(
  scene: Scene,
  parent: TransformNode,
  name: string,
  halfW: number,
  halfH: number,
  z: number,
  count = 4,
): void {
  const mat = steel(scene, `${name}-mat`, '#9aa4b0');
  const positions: Array<[number, number]> =
    count === 4
      ? [
          [-halfW, -halfH],
          [halfW, -halfH],
          [-halfW, halfH],
          [halfW, halfH],
        ]
      : [
          [-halfW, 0],
          [halfW, 0],
        ];
  positions.forEach(([x, y], i) => {
    const s = CreateCylinder(`${name}-${i}`, { diameter: 0.009, height: 0.004, tessellation: 8 }, scene);
    s.parent = parent;
    s.rotation.x = Math.PI / 2;
    s.position = new Vector3(x, y, z);
    s.material = mat;
  });
}

/** Ventilation slots in a housing — thin recessed dark strips. */
export function vents(
  scene: Scene,
  parent: TransformNode,
  name: string,
  count: number,
  spacing: number,
  size: { width: number; height: number; depth: number },
  origin: Vector3,
): void {
  const mat = painted(scene, `${name}-mat`, '#12151a', 0.8);
  for (let i = 0; i < count; i++) {
    const v = CreateBox(`${name}-${i}`, size, scene);
    v.parent = parent;
    v.position = origin.add(new Vector3(i * spacing, 0, 0));
    v.material = mat;
  }
}

/**
 * A printed nameplate on the faceplate.
 *
 * Small, but it is the difference between "a screen" and "the Ellipsometry
 * station": a real instrument has its name silkscreened on it.
 */
export function nameplate(
  scene: Scene,
  parent: TransformNode,
  name: string,
  text: string,
  width: number,
  origin: Vector3,
): AbstractMesh {
  const tex = new DynamicTexture(`${name}-tex`, { width: 512, height: 64 }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#1a1e24';
  ctx.fillRect(0, 0, 512, 64);
  ctx.fillStyle = '#c9d4e0';
  ctx.font = '700 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 34);
  tex.update();

  const m = new PBRMaterial(`${name}-mat`, scene);
  m.albedoTexture = tex;
  m.emissiveTexture = tex;
  m.emissiveColor = new Color3(0.16, 0.17, 0.2);
  m.metallic = 0;
  m.roughness = 0.5;

  const plate = CreatePlane(`${name}`, { width, height: width / 8 }, scene);
  plate.parent = parent;
  plate.position = origin;
  plate.material = m;
  return plate;
}

// ---------------------------------------------------------------------------
// Controls — the part that makes it a device rather than a picture of one
// ---------------------------------------------------------------------------

/**
 * A rotary control.
 *
 * The pointer line is on the cap and the cap rotates, so the player can see which
 * way it is turned. `setValue` clamps and snaps the visual to the real value, so a
 * knob can never disagree with the state it represents.
 */
export class Knob {
  readonly mesh: AbstractMesh;
  private readonly pointer: AbstractMesh;
  private readonly cap: AbstractMesh;

  constructor(
    scene: Scene,
    parent: TransformNode,
    name: string,
    origin: Vector3,
    opts: { radius?: number; colour?: string; pointerColour?: string } = {},
  ) {
    const r = opts.radius ?? 0.026;
    const root = new TransformNode(`${name}-root`, scene);
    root.parent = parent;
    root.position = origin;
    // Tilt the knob toward the operator so its pointer is readable.
    root.rotation.x = -0.5;

    // Skirt, so the knob does not look like it is floating on the panel.
    const skirt = CreateCylinder(`${name}-skirt`, { diameter: r * 2.3, height: 0.006, tessellation: 20 }, scene);
    skirt.parent = root;
    skirt.material = anodised(scene, `${name}-skirt-mat`, '#3c424b');

    this.cap = CreateCylinder(
      `${name}-cap`,
      { diameterTop: r * 1.75, diameterBottom: r * 2, height: 0.018, tessellation: 24 },
      scene,
    );
    this.cap.parent = root;
    this.cap.position = new Vector3(0, 0.012, 0);
    this.cap.material = rubber(scene, `${name}-cap-mat`, opts.colour ?? '#1b1e23');

    this.pointer = CreateBox(`${name}-pointer`, { width: 0.004, height: 0.003, depth: r * 1.5 }, scene);
    this.pointer.parent = this.cap;
    this.pointer.position = new Vector3(0, 0.01, -r * 0.45);
    const pm = new StandardMaterial(`${name}-pointer-mat`, scene);
    pm.diffuseColor = Color3.Black();
    pm.emissiveColor = Color3.FromHexString(opts.pointerColour ?? '#e8e2d0');
    pm.disableLighting = true;
    this.pointer.material = pm;

    this.mesh = this.cap;
    this.setValue(0);
  }

  /** `t` in [0,1]; the knob sweeps 300 degrees, like a real pot. */
  setValue(t: number): void {
    const f = Math.max(0, Math.min(1, t));
    this.cap.rotation.y = (0.5 - f) * (Math.PI * 5 / 3);
    this.pointer.parent = this.cap;
  }
}

/**
 * A toggle switch.
 *
 * A bat handle that physically throws between two positions, with a chrome bat.
 */
export class ToggleSwitch {
  readonly mesh: AbstractMesh;
  private readonly bat: AbstractMesh;
  private readonly flag: StandardMaterial;
  private state = false;

  constructor(
    scene: Scene,
    parent: TransformNode,
    name: string,
    origin: Vector3,
    onColour = '#5fd68a',
  ) {
    const root = new TransformNode(`${name}-root`, scene);
    root.parent = parent;
    root.position = origin;

    const base = CreateCylinder(`${name}-base`, { diameter: 0.019, height: 0.008, tessellation: 14 }, scene);
    base.parent = root;
    base.material = steel(scene, `${name}-base-mat`, '#8f99a5');

    this.bat = CreateCylinder(
      `${name}-bat`,
      { diameterTop: 0.005, diameterBottom: 0.009, height: 0.024, tessellation: 12 },
      scene,
    );
    this.bat.parent = root;
    this.bat.position = new Vector3(0, 0.014, 0);
    this.bat.material = steel(scene, `${name}-bat-mat`, '#c8d2de');

    // A small illuminated flag on the panel next to it.
    const lampMat = new StandardMaterial(`${name}-flag-mat`, scene);
    lampMat.diffuseColor = Color3.Black();
    lampMat.specularColor = Color3.Black();
    lampMat.emissiveColor = Color3.FromHexString(onColour).scale(0.08);
    lampMat.disableLighting = true;
    this.flag = lampMat;

    const lamp = CreateSphere(`${name}-flag`, { diameter: 0.008, segments: 8 }, scene);
    lamp.parent = root;
    lamp.position = new Vector3(0.016, 0.004, 0);
    lamp.material = lampMat;

    this.mesh = this.bat;
    this.set(false);
  }

  set(on: boolean): void {
    this.state = on;
    this.bat.rotation.x = on ? -0.5 : 0.5;
    this.flag.emissiveColor = Color3.FromHexString('#5fd68a').scale(on ? 1.4 : 0.08);
  }

  get value(): boolean {
    return this.state;
  }
}

/** A rectangular illuminated pushbutton, like an instrument's RUN key. */
export function pushButton(
  scene: Scene,
  parent: TransformNode,
  name: string,
  origin: Vector3,
  size: { width: number; height: number } = { width: 0.07, height: 0.026 },
): { mesh: AbstractMesh; setPressed(p: boolean): void } {
  const root = new TransformNode(`${name}-root`, scene);
  root.parent = parent;
  root.position = origin;
  root.rotation.x = -0.35;

  const bezelMat = anodised(scene, `${name}-bezel-mat`, '#3a4048');
  const surround = CreateBox(
    `${name}-surround`,
    { width: size.width + 0.008, height: 0.006, depth: size.height + 0.008 },
    scene,
  );
  surround.parent = root;
  surround.material = bezelMat;

  const capMat = new StandardMaterial(`${name}-cap-mat`, scene);
  capMat.diffuseColor = Color3.FromHexString('#3d434c');
  capMat.specularColor = new Color3(0.2, 0.2, 0.2);
  capMat.emissiveColor = Color3.FromHexString('#5ec8d8').scale(0.12);
  const cap = CreateBox(`${name}-cap`, { width: size.width, height: 0.006, depth: size.height }, scene);
  cap.parent = root;
  cap.position = new Vector3(0, 0.005, 0);
  cap.material = capMat;

  return {
    mesh: cap,
    setPressed(pressed: boolean) {
      cap.position.y = pressed ? 0.001 : 0.005;
      capMat.emissiveColor = Color3.FromHexString('#5ec8d8').scale(pressed ? 1.1 : 0.12);
    },
  };
}

/** A stack of indicator lamps: the classic instrument tell-tale row. */
export function telltales(
  scene: Scene,
  parent: TransformNode,
  name: string,
  origin: Vector3,
  specs: ReadonlyArray<{ label: string; colour: string }>,
): { set(index: number, on: boolean): void; mesh: AbstractMesh } {
  const root = new TransformNode(`${name}-root`, scene);
  root.parent = parent;
  root.position = origin;

  const mats: StandardMaterial[] = [];
  specs.forEach((spec, i) => {
    const x = i * 0.034;
    const lamp = CreateCylinder(`${name}-lamp-${i}`, { diameter: 0.012, height: 0.006, tessellation: 12 }, scene);
    lamp.parent = root;
    lamp.rotation.x = Math.PI / 2;
    lamp.position = new Vector3(x, 0, 0);
    const m = indicator(scene, `${name}-lamp-mat-${i}`, spec.colour, false);
    mats.push(m);
    lamp.material = m;

    // Etched legend under each lamp.
    const tex = new DynamicTexture(`${name}-tx-${i}`, { width: 64, height: 24 }, scene, true);
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 24);
    ctx.fillStyle = '#8e99a6';
    ctx.font = '600 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(spec.label, 32, 13);
    tex.update();
    const lm = new StandardMaterial(`${name}-lm-mat-${i}`, scene);
    lm.diffuseTexture = tex;
    lm.emissiveTexture = tex;
    lm.emissiveColor = new Color3(0.2, 0.21, 0.24);
    lm.specularColor = Color3.Black();
    const legend = CreatePlane(`${name}-lg-${i}`, { width: 0.03, height: 0.011 }, scene);
    legend.parent = root;
    legend.position = new Vector3(x, -0.011, 0.001);
    legend.material = lm;
  });

  return {
    mesh: root as unknown as AbstractMesh,
    set(index: number, on: boolean) {
      const m = mats[index];
      if (!m) return;
      const c = Color3.FromHexString(specs[index]!.colour);
      m.emissiveColor = on ? c.scale(1.7) : c.scale(0.08);
    },
  };
}

/** A drooping cable between two points — small, but it removes the CG emptiness. */
export function cable(
  scene: Scene,
  from: Vector3,
  to: Vector3,
  sag = 0.06,
  name = 'cable',
): AbstractMesh {
  const SEGMENTS = 14;
  const pts: Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS;
    const p = Vector3.Lerp(from, to, t);
    // Parabolic droop, plus a little lateral noise so it is not a perfect arc.
    p.y -= Math.sin(t * Math.PI) * sag;
    p.x += Math.sin(t * Math.PI * 2.3) * sag * 0.12;
    pts.push(p);
  }
  // A swept tube is the honest way to draw this, but it needs a path builder; a
  // segmented cylinder chain reads the same at this scale and costs far less.
  const segs: AbstractMesh[] = [];
  for (let i = 0; i < SEGMENTS; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d = b.subtract(a);
    const len = d.length();
    if (len < 1e-5) continue;
    const seg = CreateCylinder(`${name}-${i}`, { diameter: 0.005, height: len, tessellation: 6 }, scene);
    seg.position = a.add(b).scale(0.5);
    // Point the cylinder's +Y along the segment.
    const axis = Vector3.Cross(Vector3.Up(), d.normalize());
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(Vector3.Up(), d.normalize()))));
    if (axis.lengthSquared() > 1e-8) {
      seg.rotationQuaternion = quatFromAxisAngle(axis.normalize(), angle);
    }
    seg.material = rubber(scene, `${name}-mat`, '#1a1d22');
    segs.push(seg);
  }
  return segs[0]!;
}

function quatFromAxisAngle(axis: Vector3, angle: number): Quaternion {
  const s = Math.sin(angle / 2);
  return new Quaternion(axis.x * s, axis.y * s, axis.z * s, Math.cos(angle / 2));
}

/**
 * Deterministic camera framing for a bench.
 *
 * The previous RCA attempt failed because the framing was done by hand from the
 * console: the camera's `lowerRadiusLimit` was 0.8 m, set for the room-wide
 * inspection view, so every attempt to move in closer was silently CLAMPED back
 * to 0.8 m and the tanks were never framed the way the screenshots assumed. The
 * limit has to move with the framing.
 *
 * `frameStation` therefore sets the limits as well as the angles, and each bench
 * calls it rather than relying on whoever is driving the camera to get it right.
 */
export function frameStation(
  camera: import('@babylonjs/core/Cameras/arcRotateCamera.js').ArcRotateCamera,
  opts: { target: Vector3; alpha?: number; beta?: number; radius: number; minRadius?: number; maxRadius?: number },
): void {
  const alpha = opts.alpha ?? -Math.PI / 2;
  const beta = opts.beta ?? 1.16;
  // A seated operator looking down at a bench. 1.16 rad is ~24 degrees above
  // horizontal, which is roughly where a pair of eyes sit over a wet bench.
  camera.setTarget(opts.target);
  camera.alpha = alpha;
  camera.beta = beta;
  // Limits FIRST: assigning a radius outside the old limits is clamped.
  camera.lowerRadiusLimit = opts.minRadius ?? Math.max(0.18, opts.radius * 0.6);
  camera.upperRadiusLimit = opts.maxRadius ?? opts.radius * 2.6;
  camera.radius = opts.radius;
}

/**
 * Clearance check used by the tests.
 *
 * A bench is only readable if its working parts are not inside the bench top, so
 * this is worth asserting in code rather than discovering it in a screenshot: a
 * previous build drove half the clipboard sheet through the bench surface and the
 * protruding wedge read as a stray object.
 */
export function clearanceAbove(
  benchTopY: number,
  partCentreY: number,
  halfHeight: number,
): number {
  return partCentreY - halfHeight - benchTopY;
}
