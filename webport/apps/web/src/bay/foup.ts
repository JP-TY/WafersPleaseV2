import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { COLORS, matte, matteNoise, metal, lamp, rubber, quartz } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel, type LabelOptions } from './labels.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';

/** Cheap chamfer read — stacked edge strips, not a real bevel mesh. */
function edgeStrip(
  scene: Scene,
  name: string,
  parent: TransformNode,
  opts: { w: number; h: number; d: number; x: number; y: number; z: number; mat: AbstractMesh['material'] },
): void {
  const m = CreateBox(name, { width: opts.w, height: opts.h, depth: opts.d }, scene);
  m.parent = parent;
  m.position.set(opts.x, opts.y, opts.z);
  m.material = opts.mat;
  m.isPickable = false;
}

/** FOUP cassette — lot intake control (GDD asset inventory P0). */
export class Foup {
  readonly root: TransformNode;
  readonly body: AbstractMesh;
  readonly button: AbstractMesh;
  private readonly statusLamp: AbstractMesh;
  private readonly door: AbstractMesh;
  private labelTex: DynamicTexture;
  private remaining = 0;
  private armed = false;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('foup', scene);
    if (parent) this.root.parent = parent;
    // Hero seat — slightly +Z so back-wall niche/cove/HEPA read behind the triad.
    this.root.position = new Vector3(-0.7, 1.16, 0.1);

    const shellMat = matteNoise(scene, 'foupMat', COLORS.foup, {
      variance: 12,
      speck: 0.05,
      size: 128,
      tileHint: 'fine',
      blotch: 0.35,
      emissive: 0.08,
      uScale: 2.2,
      vScale: 2.0,
    });
    const shellDark = matte(scene, 'foupDarkMat', COLORS.foup.scale(0.88), 0.04);
    const trimMat = metal(scene, 'foupTrimMat', COLORS.wallTrim, 0.35);
    const steelMat = metal(scene, 'foupSteelMat', new Color3(0.5, 0.55, 0.6), 0.45);
    const gasketMat = rubber(scene, 'foupGasketMat', new Color3(0.12, 0.14, 0.16));

    // Thin pedestal + undercut bevel (was a fat 80 mm slab).
    const pedestal = CreateBox('foupPedestal', { width: 0.4, height: 0.04, depth: 0.36 }, scene);
    pedestal.parent = this.root;
    pedestal.position.y = -0.27;
    pedestal.material = metal(scene, 'foupPedMat', COLORS.bench, 0.25);
    pedestal.isPickable = false;
    edgeStrip(scene, 'foupPedBevel', this.root, {
      w: 0.42,
      h: 0.012,
      d: 0.38,
      x: 0,
      y: -0.292,
      z: 0,
      mat: metal(scene, 'foupPedBevelMat', COLORS.bench.scale(0.85), 0.2),
    });

    // Kinematic coupling pins on the load port
    for (const [i, x, z] of [
      [0, -0.12, 0.1],
      [1, 0.12, 0.1],
      [2, 0, -0.12],
    ] as const) {
      const pin = CreateCylinder(`foupKinematic${i}`, { diameter: 0.022, height: 0.028, tessellation: 12 }, scene);
      pin.parent = this.root;
      pin.position.set(x, -0.245, z);
      pin.material = metal(scene, `foupKinMat${i}`, COLORS.wallTrim, 0.4);
      pin.isPickable = false;
      const seat = CreateCylinder(`foupKinSeat${i}`, { diameter: 0.034, height: 0.006, tessellation: 12 }, scene);
      seat.parent = this.root;
      seat.position.set(x, -0.255, z);
      seat.material = trimMat;
      seat.isPickable = false;
    }

    // Slightly smaller core so wall skins + edge chamfers read as thin shell, not a toy brick.
    this.body = CreateBox('foupBody', { width: 0.36, height: 0.48, depth: 0.32 }, scene);
    this.body.parent = this.root;
    this.body.material = shellMat;
    this.body.isPickable = false;

    // Recessed side panels — break the flat slab faces.
    for (const sx of [-1, 1] as const) {
      const panel = CreateBox(`foupSidePanel${sx}`, { width: 0.006, height: 0.36, depth: 0.24 }, scene);
      panel.parent = this.root;
      panel.position.set(sx * 0.185, 0.01, -0.01);
      panel.material = shellDark;
      panel.isPickable = false;
    }
    const rearPanel = CreateBox('foupRearPanel', { width: 0.3, height: 0.36, depth: 0.006 }, scene);
    rearPanel.parent = this.root;
    rearPanel.position.set(0, 0.01, -0.165);
    rearPanel.material = shellDark;
    rearPanel.isPickable = false;

    // 12-edge chamfer strips — denser silhouette without real bevel topology.
    const bevelMat = matte(scene, 'foupBevelMat', COLORS.foup.scale(0.78), 0.03);
    for (const [i, w, h, d, x, y, z] of [
      // vertical front corners
      [0, 0.012, 0.48, 0.012, -0.186, 0, 0.166],
      [1, 0.012, 0.48, 0.012, 0.186, 0, 0.166],
      // vertical rear corners
      [2, 0.012, 0.48, 0.012, -0.186, 0, -0.166],
      [3, 0.012, 0.48, 0.012, 0.186, 0, -0.166],
      // top edges
      [4, 0.36, 0.01, 0.012, 0, 0.245, 0.166],
      [5, 0.36, 0.01, 0.012, 0, 0.245, -0.166],
      [6, 0.012, 0.01, 0.32, -0.186, 0.245, 0],
      [7, 0.012, 0.01, 0.32, 0.186, 0.245, 0],
      // bottom edges
      [8, 0.36, 0.01, 0.012, 0, -0.245, 0.166],
      [9, 0.36, 0.01, 0.012, 0, -0.245, -0.166],
      [10, 0.012, 0.01, 0.32, -0.186, -0.245, 0],
      [11, 0.012, 0.01, 0.32, 0.186, -0.245, 0],
    ] as const) {
      edgeStrip(scene, `foupBevel${i}`, this.root, { w, h, d, x, y, z, mat: bevelMat });
    }

    // Thin stiffener ribs (was chunky 18×40 mm).
    for (const sx of [-1, 1] as const) {
      for (let i = 0; i < 4; i++) {
        const rib = CreateBox(`foupRib${sx}_${i}`, { width: 0.008, height: 0.4, depth: 0.018 }, scene);
        rib.parent = this.root;
        rib.position.set(sx * 0.192, 0, -0.1 + i * 0.07);
        rib.material = shellDark;
        rib.isPickable = false;
      }
    }

    // Thin top cap + perimeter lip (was 40 mm thick).
    const topCap = CreateBox('foupTopCap', { width: 0.38, height: 0.016, depth: 0.34 }, scene);
    topCap.parent = this.root;
    topCap.position.y = 0.252;
    topCap.material = matte(scene, 'foupTopMat', COLORS.foup.scale(0.92), 0.05);
    topCap.isPickable = false;
    edgeStrip(scene, 'foupTopLip', this.root, {
      w: 0.39,
      h: 0.008,
      d: 0.35,
      x: 0,
      y: 0.262,
      z: 0,
      mat: shellDark,
    });

    // Carry handle — posts + turned grip (not a fat box bar).
    for (const sx of [-1, 1] as const) {
      const post = CreateCylinder(`foupHandlePost${sx}`, { diameter: 0.014, height: 0.055, tessellation: 12 }, scene);
      post.parent = this.root;
      post.position.set(sx * 0.09, 0.285, 0.02);
      post.material = steelMat;
      post.isPickable = false;
      const collar = CreateCylinder(`foupHandleCollar${sx}`, { diameter: 0.022, height: 0.008, tessellation: 12 }, scene);
      collar.parent = this.root;
      collar.position.set(sx * 0.09, 0.262, 0.02);
      collar.material = trimMat;
      collar.isPickable = false;
    }
    const grip = CreateCylinder('foupHandle', { diameter: 0.022, height: 0.2, tessellation: 16 }, scene);
    grip.parent = this.root;
    grip.rotation.z = Math.PI / 2;
    grip.position.set(0, 0.312, 0.02);
    grip.material = steelMat;
    grip.isPickable = false;
    // Front latch finger-pull on the door face.
    const pull = CreateBox('foupPull', { width: 0.1, height: 0.014, depth: 0.018 }, scene);
    pull.parent = this.root;
    pull.position.set(0, -0.14, 0.188);
    pull.material = steelMat;
    pull.isPickable = false;

    this.door = CreateBox('foupDoor', { width: 0.28, height: 0.34, depth: 0.012 }, scene);
    this.door.parent = this.root;
    this.door.position.set(0, 0.02, 0.172);
    const doorMat = metal(scene, 'foupDoorMat', COLORS.foupDoor, 0.12);
    doorMat.roughness = 0.62;
    doorMat.specularIntensity = 0.28;
    doorMat.environmentIntensity = 0.18;
    this.door.material = doorMat;
    this.door.isPickable = false;

    // Door frame (U-channel) — thinner wall read around the aperture.
    for (const [i, w, h, x, y] of [
      [0, 0.3, 0.014, 0, 0.2],
      [1, 0.3, 0.014, 0, -0.16],
      [2, 0.014, 0.36, -0.157, 0.02],
      [3, 0.014, 0.36, 0.157, 0.02],
    ] as const) {
      const frame = CreateBox(`foupDoorFrame${i}`, { width: w, height: h, depth: 0.016 }, scene);
      frame.parent = this.root;
      frame.position.set(x, y, 0.168);
      frame.material = shellDark;
      frame.isPickable = false;
    }

    // Thin gasket as perimeter rails, not a solid rubber slab.
    for (const [i, w, h, x, y] of [
      [0, 0.3, 0.008, 0, 0.195],
      [1, 0.3, 0.008, 0, -0.155],
      [2, 0.008, 0.35, -0.152, 0.02],
      [3, 0.008, 0.35, 0.152, 0.02],
    ] as const) {
      const gasket = CreateBox(`foupDoorGasket${i}`, { width: w, height: h, depth: 0.006 }, scene);
      gasket.parent = this.root;
      gasket.position.set(x, y, 0.164);
      gasket.material = gasketMat;
      gasket.isPickable = false;
    }

    // Latch bar + dual cams + hinge knuckles — readable mechanical silhouette.
    const latch = CreateBox('foupLatch', { width: 0.2, height: 0.014, depth: 0.016 }, scene);
    latch.parent = this.root;
    latch.position.set(0, -0.12, 0.186);
    latch.material = trimMat;
    latch.isPickable = false;
    for (const sx of [-1, 1] as const) {
      const cam = CreateCylinder(`foupLatchCam${sx}`, { diameter: 0.028, height: 0.012, tessellation: 14 }, scene);
      cam.parent = this.root;
      cam.rotation.x = Math.PI / 2;
      cam.position.set(sx * 0.08, -0.12, 0.196);
      cam.material = steelMat;
      cam.isPickable = false;
      const knuckle = CreateCylinder(`foupHinge${sx}`, { diameter: 0.016, height: 0.04, tessellation: 10 }, scene);
      knuckle.parent = this.root;
      knuckle.position.set(sx * 0.145, -0.02 + (sx === 1 ? 0.08 : -0.08), 0.178);
      knuckle.material = trimMat;
      knuckle.isPickable = false;
    }
    // Manual latch lever
    const lever = CreateBox('foupLatchLever', { width: 0.05, height: 0.01, depth: 0.028 }, scene);
    lever.parent = this.root;
    lever.position.set(0.06, -0.135, 0.2);
    lever.material = steelMat;
    lever.isPickable = false;

    // Large polycarb window into wafer stack (classic closed FOUP silhouette).
    const window = CreateBox('foupWindow', { width: 0.22, height: 0.26, depth: 0.006 }, scene);
    window.parent = this.root;
    window.position.set(0, 0.06, 0.184);
    const winMat = quartz(scene, 'foupWinMat', new Color3(0.55, 0.78, 0.86));
    winMat.alpha = 0.24;
    winMat.indexOfRefraction = 1.58;
    winMat.roughness = 0.08;
    winMat.specularIntensity = 0.78;
    window.material = winMat;
    window.isPickable = false;
    for (const [i, w, h, x, y] of [
      [0, 0.235, 0.01, 0, 0.195],
      [1, 0.235, 0.01, 0, -0.075],
      [2, 0.01, 0.28, -0.118, 0.06],
      [3, 0.01, 0.28, 0.118, 0.06],
    ] as const) {
      const winFrame = CreateBox(`foupWinFrame${i}`, { width: w, height: h, depth: 0.01 }, scene);
      winFrame.parent = this.root;
      winFrame.position.set(x, y, 0.186);
      winFrame.material = trimMat;
      winFrame.isPickable = false;
    }

    // Circular wafer discs behind the window (not vent bars).
    for (let i = 0; i < 5; i++) {
      const disc = CreateCylinder(`foupSlot${i}`, { diameter: 0.2, height: 0.005, tessellation: 28 }, scene);
      disc.parent = this.root;
      disc.rotation.x = Math.PI / 2;
      disc.position.set(0, -0.06 + i * 0.055, 0.06);
      disc.material = metal(scene, `foupSlotMat${i}`, COLORS.wafer.scale(0.95), 0.12);
      disc.isPickable = false;
    }

    // Info RFID / lot tag plate on the side
    const sideTag = CreateBox('foupSideTag', { width: 0.008, height: 0.09, depth: 0.14 }, scene);
    sideTag.parent = this.root;
    sideTag.position.set(0.195, 0.08, 0);
    applyLabel(sideTag, scene, {
      width: 192,
      height: 128,
      fill: '#102028',
      ink: '#9fd8c0',
      align: 'center',
      font: 'bold 22px monospace',
      lines: ['FOUP', '300mm'],
      lineHeight: 36,
    });
    sideTag.isPickable = false;

    this.button = CreateCylinder('foupLoad', { diameter: 0.12, height: 0.028, tessellation: 28 }, scene);
    this.button.parent = this.root;
    this.button.position.set(0.0, -0.02, 0.21);
    this.button.rotation.x = Math.PI / 2;
    this.button.material = lamp(scene, 'foupBtnMat', COLORS.accent, 0.35);
    this.button.isPickable = true;
    this.button.metadata = { interact: 'foup' };

    const btnBezel = CreateTorus('foupBtnBezel', { diameter: 0.14, thickness: 0.01, tessellation: 20 }, scene);
    btnBezel.parent = this.root;
    btnBezel.position.set(0, -0.02, 0.21);
    btnBezel.rotation.x = Math.PI / 2;
    btnBezel.material = metal(scene, 'foupBtnBezelMat', COLORS.housing, 0.3);
    btnBezel.isPickable = false;

    const pickProxy = CreateBox('foupPickProxy', { width: 0.32, height: 0.2, depth: 0.1 }, scene);
    pickProxy.parent = this.root;
    pickProxy.position.set(0, -0.02, 0.21);
    pickProxy.visibility = 0.001;
    pickProxy.isPickable = true;
    pickProxy.metadata = { interact: 'foup' };

    this.statusLamp = CreateCylinder('foupStatus', { diameter: 0.04, height: 0.016, tessellation: 16 }, scene);
    this.statusLamp.parent = this.root;
    this.statusLamp.position.set(0.12, 0.2, 0.178);
    this.statusLamp.rotation.x = Math.PI / 2;
    this.statusLamp.material = lamp(scene, 'foupStatusMat', COLORS.bench, 0.15);
    this.statusLamp.isPickable = false;

    const face = CreateBox('foupFace', { width: 0.28, height: 0.1, depth: 0.008 }, scene);
    face.parent = this.root;
    face.position.set(0, 0.155, 0.182);
    this.labelTex = applyLabel(face, scene, this.labelOpts());
  }

  private labelOpts(): LabelOptions {
    return {
      width: 320,
      height: 140,
      font: 'bold 26px monospace',
      align: 'center',
      fill: '#101820',
      ink: this.armed ? '#7dffb8' : '#c8d4e0',
      lineHeight: 32,
      lines: this.armed
        ? ['FOUP READY', `${this.remaining} WAFER(S)`, '▶ PRESS LOAD']
        : ['FOUP CASSETTE', this.remaining > 0 ? `${this.remaining} REMAINING` : 'EMPTY', '—'],
    };
  }

  setState(remaining: number, armed: boolean): void {
    this.remaining = remaining;
    this.armed = armed;
    rewriteLabel(this.labelTex, this.labelOpts());
    const btn = this.button.material as ReturnType<typeof lamp>;
    btn.emissiveColor = armed ? COLORS.accent.scale(0.95) : COLORS.bench.scale(0.12);
    btn.diffuseColor = armed ? COLORS.accent : COLORS.bench;
    const status = this.statusLamp.material as ReturnType<typeof lamp>;
    status.emissiveColor = armed
      ? COLORS.accent.scale(1.1)
      : remaining > 0
        ? COLORS.warn.scale(0.5)
        : COLORS.bench.scale(0.1);
    status.diffuseColor = armed ? COLORS.accent : remaining > 0 ? COLORS.warn : COLORS.bench;
    const door = this.door.material as ReturnType<typeof metal>;
    door.emissiveColor = armed ? COLORS.accent.scale(0.08) : COLORS.foupDoor.scale(0.03);
  }

  /** Brief load flash — button depress + status pop so FOUP seat feels responsive. */
  flashLoad(): void {
    const btn = this.button.material as ReturnType<typeof lamp>;
    const status = this.statusLamp.material as ReturnType<typeof lamp>;
    const restZ = this.button.position.z;
    this.button.position.z = restZ - 0.012;
    this.button.scaling.set(1.08, 1.08, 0.75);
    btn.emissiveColor = COLORS.accent.scale(1.4);
    status.emissiveColor = COLORS.accent.scale(1.55);
    const restore = () => {
      this.button.position.z = restZ;
      this.button.scaling.setAll(1);
      this.setState(this.remaining, this.armed);
    };
    if (typeof window !== 'undefined') window.setTimeout(restore, 180);
    else restore();
  }

  /**
   * Procedural FOUP silhouette safe to hide when Foup.glb takes the primary role.
   * Keeps load affordance + status/label overlays (true interactables / feedback).
   */
  scenicShells(): AbstractMesh[] {
    // Keep only load affordance when authored Foup.glb dresses the pod.
    // Hide foupFace/status — they read as a fake "crate label" over the real door.
    const keep = new Set(['foupLoad', 'foupPickProxy', 'foupBtnBezel']);
    return this.root.getChildMeshes(false).filter((m) => !keep.has(m.name));
  }
}
