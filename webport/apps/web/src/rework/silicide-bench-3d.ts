/**
 * The selective silicide wet etch bench, as a physical object.
 *
 * GDD §8B: "the operator triggers an ultrasonic agitation wash during the
 * intermediate, high-resistance C49 phase. This strips unreacted pathway metals
 * while leaving the contact points intact... Proceeding without this wash locks in
 * a permanent Silicide Bridge."
 *
 * That is a TIMING puzzle, and timing puzzles drawn as a bar chart are the least
 * legible thing in the game. So the mechanic is built as the instrument an
 * operator would actually use:
 *
 *   - an ultrasonic bath with a transducer at the bottom, so "washing" is
 *     something you see happening in the liquid rather than a boolean;
 *   - a SWEEP DIAL whose pointer crosses a marked arc as the anneal runs, with
 *     the strippable C49 window painted on the arc itself. The player watches a
 *     needle approach a zone and has to act before it leaves. That single object
 *     teaches the whole mechanic: the window is visible, finite, and about to
 *     close.
 *   - a four-point probe on a carriage, reporting sheet resistance on a real
 *     meter face, because Rs is how the operator knows the phase at all;
 *   - a contact-thickness gauge whose needle visibly falls as you over-wash,
 *     which is the second failure mode the Unity version did not have.
 *
 * The three GDD §8B failure modes are all reachable by looking at the bench:
 * wash too late and the strippable zone has gone; never wash and the bridge
 * locks; wash too long and the contact gauge drops toward open-circuit.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';

import { C, MONO, Panel, hline, label, plate, trace, value, type PanelCtx } from '../ui/panel.js';
import { mountBench, type BenchMount, BENCH_Y } from '../ui/bench.js';
import { frameStation, housing, nameplate, pushButton, screws, telltales } from '../scene/physical.js';
import { steel } from '../scene/lighting.js';
import { WAFER_RADIUS } from '../inspection/wafer-stage.js';
import {
  PROCESS,
  type SilicideAction,
  type SilicideEtchState,
  type ReworkMinigame,
} from '@wafers/sim';

const W = 880;
const H = 420;

const TANK_R = 0.13;
const TANK_H = 0.2;

/** NH4OH:H2O2:H2O — the alkaline peroxide bath selective for titanium. */
const ETCHANT = '#c8d98a';

/** Rs band edges in µΩ·cm, from the literature values the sim uses. */
const RS_HIGH = PROCESS.silicide.resistivityC49MicroOhmCm;
const RS_LOW = PROCESS.silicide.resistivityC54MicroOhmCm;

/**
 * The sweep dial.
 *
 * A pointer that crosses a 270-degree arc, with the strippable C49 window drawn
 * on the arc. This is the whole minigame in one object: the window is a place on
 * a dial, so "did I act in time" becomes something you can see rather than
 * something you have to remember.
 */
class SweepDial {
  readonly root: TransformNode;
  private readonly pointer: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
  private readonly arcTex: DynamicTexture;

  /** Fraction of the way through the conversion, 0..1. */
  setProgress(f: number): void {
    this.pointer.rotation.z = SWEEP_START + Math.max(0, Math.min(1, f)) * SWEEP_ARC;
  }

  /**
   * Repaint the strippable window on the dial face.
   *
   * `from` and `to` are fractions of the conversion; the zone between them is
   * where the film is still C49 and can be lifted.
   */
  setWindow(from: number, to: number): void {
    const ctx = this.arcTex.getContext() as CanvasRenderingContext2D;
    const size = this.arcTex.getSize().width;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.4;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#151a21';
    ctx.fillRect(0, 0, size, size);

    // Dial face ticks.
    ctx.strokeStyle = 'rgba(150,170,195,0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const a = SWEEP_START + (i / 10) * SWEEP_ARC;
      const c = Math.cos(a);
      const s = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + c * r * 0.82, cy + s * r * 0.82);
      ctx.lineTo(cx + c * r * 0.94, cy + s * r * 0.94);
      ctx.stroke();
    }

    // The strippable zone, painted green on the arc.
    const a0 = SWEEP_START + Math.max(0, Math.min(1, from)) * SWEEP_ARC;
    const a1 = SWEEP_START + Math.max(0, Math.min(1, to)) * SWEEP_ARC;
    ctx.strokeStyle = '#5fd68a';
    ctx.lineWidth = size * 0.055;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -a0, -a1, true);
    ctx.stroke();

    // Legend.
    ctx.fillStyle = '#5fd68a';
    ctx.font = `700 ${Math.round(size * 0.045)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('C49 STRIPPABLE', cx, cy - r * 0.42);
    ctx.fillStyle = '#7d8b9c';
    ctx.font = `600 ${Math.round(size * 0.036)}px monospace`;
    ctx.fillText('C54 LOCKED', cx, cy + r * 0.5);

    this.arcTex.update();
  }

  constructor(scene: Scene, parent: TransformNode, name: string, origin: Vector3) {
    this.root = new TransformNode(`${name}-root`, scene);
    this.root.parent = parent;
    this.root.position = origin;
    this.root.rotation.x = -0.62;

    const case_ = CreateCylinder(`${name}-case`, { diameter: 0.17, height: 0.05, tessellation: 48 }, scene);
    case_.parent = this.root;
    case_.rotation.x = Math.PI / 2;
    case_.material = housing(scene, `${name}-case-mat`, '#2b303a');

    this.arcTex = new DynamicTexture(`${name}-face`, { width: 512, height: 512 }, scene, true);
    const face = CreateDisc(`${name}-face`, { radius: 0.078, tessellation: 48 }, scene);
    face.parent = this.root;
    face.position = new Vector3(0, 0, 0.026);
    const faceMat = new StandardMaterial(`${name}-face-mat`, scene);
    faceMat.diffuseColor = Color3.Black();
    faceMat.specularColor = new Color3(0.1, 0.1, 0.1);
    faceMat.emissiveTexture = this.arcTex;
    faceMat.emissiveColor = new Color3(0.7, 0.7, 0.7);
    faceMat.disableLighting = true;
    face.material = faceMat;

    // Pointer: a needle from the hub, rotating in the dial's plane.
    const needleMat = new StandardMaterial(`${name}-needle-mat`, scene);
    needleMat.diffuseColor = Color3.Black();
    needleMat.emissiveColor = Color3.FromHexString('#e8e2d0');
    needleMat.disableLighting = true;
    this.pointer = CreateBox(`${name}-needle`, { width: 0.006, height: 0.062, depth: 0.003 }, scene);
    this.pointer.parent = this.root;
    this.pointer.position = new Vector3(0, 0, 0.03);
    this.pointer.material = needleMat;
    // The box is drawn pointing up; shift it so it pivots about the hub.
    this.pointer.setPivotPoint(new Vector3(0, -0.031, 0));

    const hub = CreateCylinder(`${name}-hub`, { diameter: 0.016, height: 0.008, tessellation: 16 }, scene);
    hub.parent = this.root;
    hub.rotation.x = Math.PI / 2;
    hub.position = new Vector3(0, 0, 0.032);
    hub.material = steel(scene, `${name}-hub-mat`, '#c2ccd8');

    this.setProgress(0);
    this.setWindow(0, 0.05);
  }

  /** Pixels per metre on the dial face, for hit-testing later. */
  static readonly RADIUS = 0.078;
}

/** Dial geometry: a 270-degree sweep starting at the lower left. */
const SWEEP_ARC = Math.PI * 1.5;
const SWEEP_START = Math.PI * 0.75;

export class SilicideBench3D {
  private readonly root: TransformNode;
  private readonly panel: Panel;
  private readonly readout: BenchMount;
  private readonly sim: ReworkMinigame<SilicideEtchState, SilicideAction>;

  private readonly bathLiquid: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
  private readonly bathSurface: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
  private readonly transducer: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;
  private readonly transducerMat: StandardMaterial;
  private readonly holder: TransformNode;
  private readonly dial: SweepDial;
  private readonly washLamp: (on: boolean) => void;
  private readonly probe: TransformNode;
  private readonly contactGaugeMat: StandardMaterial;
  private readonly run: { mesh: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh; setPressed(p: boolean): void };

  private readonly history: number[] = [];
  private ripplePhase = 0;

  constructor(scene: Scene, sim: ReworkMinigame<SilicideEtchState, SilicideAction>) {
    this.sim = sim;
    this.root = new TransformNode('silicide-bench', scene);
    this.root.position = new Vector3(0, BENCH_Y, 0);

    // --- deck ---------------------------------------------------------------
    const deck = CreateBox('sil-deck', { width: 0.9, height: 0.035, depth: 0.4 }, scene);
    deck.parent = this.root;
    deck.position = new Vector3(0, 0, 0);
    deck.material = steel(scene, 'sil-deck-mat', '#79828f');
    for (const z of [0.2, -0.2]) {
      const lip = CreateBox('sil-deck-lip', { width: 0.92, height: 0.045, depth: 0.012 }, scene);
      lip.parent = this.root;
      lip.position = new Vector3(0, 0.008, z);
      lip.material = steel(scene, 'sil-deck-lip-mat', '#98a2ae');
    }

    // --- ultrasonic bath ----------------------------------------------------
    const bathX = -0.2;
    const wallMat = new PBRMaterial('sil-bath-wall-mat', scene);
    wallMat.albedoColor = new Color3(0.84, 0.88, 0.92);
    wallMat.metallic = 0;
    wallMat.roughness = 0.2;
    wallMat.environmentIntensity = 1.4;

    const wall = CreateCylinder(
      'sil-bath-wall',
      { diameter: TANK_R * 2, height: TANK_H, tessellation: 48, cap: 0 },
      scene,
    );
    wall.parent = this.root;
    wall.position = new Vector3(bathX, TANK_H / 2 + 0.02, 0);
    wall.material = wallMat;

    const rim = CreateTorus('sil-bath-rim', { diameter: TANK_R * 2, thickness: 0.006, tessellation: 48 }, scene);
    rim.parent = this.root;
    rim.position = new Vector3(bathX, TANK_H + 0.02, 0);
    rim.material = steel(scene, 'sil-bath-rim-mat', '#b0bac6');

    const liquidMat = new PBRMaterial('sil-liquid-mat', scene);
    liquidMat.albedoColor = Color3.FromHexString(ETCHANT);
    liquidMat.metallic = 0;
    liquidMat.roughness = 0.1;
    liquidMat.emissiveColor = Color3.FromHexString(ETCHANT).scale(0.2);
    liquidMat.environmentIntensity = 1.5;
    this.bathLiquid = CreateCylinder('sil-liquid', { diameter: TANK_R * 1.93, height: 1, tessellation: 40 }, scene);
    this.bathLiquid.parent = this.root;
    this.bathLiquid.material = liquidMat;
    this.bathLiquid.position = new Vector3(bathX, 0.1, 0);

    const surfMat = new StandardMaterial('sil-surface-mat', scene);
    surfMat.diffuseColor = Color3.Black();
    surfMat.emissiveColor = Color3.FromHexString(ETCHANT).scale(0.8);
    surfMat.alpha = 0.9;
    surfMat.disableLighting = true;
    this.bathSurface = CreateCylinder('sil-surface', { diameter: TANK_R * 1.93, height: 0.0015, tessellation: 40 }, scene);
    this.bathSurface.parent = this.bathLiquid;
    this.bathSurface.position = new Vector3(0, 0.5, 0);
    this.bathSurface.material = surfMat;

    // Ultrasonic transducer under the bath. Lit while running, which is what
    // makes "the ultrasonic wash" visible instead of a boolean.
    this.transducerMat = new StandardMaterial('sil-transducer-mat', scene);
    this.transducerMat.diffuseColor = Color3.Black();
    this.transducerMat.emissiveColor = new Color3(0.03, 0.06, 0.03);
    this.transducerMat.disableLighting = true;
    this.transducer = CreateCylinder('sil-transducer', { diameter: TANK_R * 1.2, height: 0.012, tessellation: 32 }, scene);
    this.transducer.parent = this.root;
    this.transducer.position = new Vector3(bathX, 0.024, 0);
    this.transducer.material = this.transducerMat;

    // --- wafer holder -------------------------------------------------------
    this.holder = new TransformNode('sil-holder', scene);
    this.holder.parent = this.root;
    const armMat = steel(scene, 'sil-arm-mat', '#c2ccd8');
    const arm = CreateBox('sil-arm', { width: 0.03, height: 0.008, depth: 0.3 }, scene);
    arm.parent = this.holder;
    arm.position = new Vector3(bathX, 0.23, 0.12);
    arm.material = armMat;
    const post = CreateCylinder('sil-post', { diameter: 0.016, height: 0.24, tessellation: 12 }, scene);
    post.parent = this.holder;
    post.position = new Vector3(bathX + 0.02, 0.13, 0.24);
    post.material = armMat;
    const cross = CreateBox('sil-cross', { width: 0.014, height: 0.008, depth: 0.22 }, scene);
    cross.parent = this.holder;
    cross.position = new Vector3(bathX, 0.215, 0.02);
    cross.material = armMat;

    const wafer = CreateCylinder('sil-wafer', { diameter: WAFER_RADIUS * 2, height: 0.0008, tessellation: 48 }, scene);
    wafer.parent = this.holder;
    wafer.position = new Vector3(bathX, 0.206, 0);
    const waferMat = new PBRMaterial('sil-wafer-mat', scene);
    waferMat.albedoColor = new Color3(0.12, 0.13, 0.16);
    waferMat.metallic = 0.68;
    waferMat.roughness = 0.3;
    wafer.material = waferMat;

    // --- four-point probe on a carriage -------------------------------------
    // Rs is how the operator knows the phase, so the probe is a real object
    // sitting over the wafer rather than a number on a screen.
    this.probe = new TransformNode('sil-probe', scene);
    this.probe.parent = this.root;
    const probeMat = steel(scene, 'sil-probe-mat', '#d0dae6');
    for (const dz of [-0.05, 0.05]) {
      const pin = CreateCylinder('sil-probe-pin', { diameter: 0.004, height: 0.06, tessellation: 8 }, scene);
      pin.parent = this.probe;
      pin.position = new Vector3(bathX, 0.235, dz);
      pin.material = probeMat;
    }
    const probeBar = CreateBox('sil-probe-bar', { width: 0.02, height: 0.01, depth: 0.14 }, scene);
    probeBar.parent = this.probe;
    probeBar.position = new Vector3(bathX, 0.262, 0);
    probeBar.material = probeMat;

    // --- sweep dial ---------------------------------------------------------
    this.dial = new SweepDial(scene, this.root, 'sil-dial', new Vector3(0.22, 0.2, 0.02));

    // --- contact thickness gauge -------------------------------------------
    // The over-wash failure mode: the Ti contact thins and its resistance climbs.
    const gaugeTex = new DynamicTexture('sil-gauge-tex', { width: 384, height: 96 }, scene, true);
    this.contactGaugeMat = new StandardMaterial('sil-gauge-mat', scene);
    this.contactGaugeMat.diffuseColor = Color3.Black();
    this.contactGaugeMat.specularColor = Color3.Black();
    this.contactGaugeMat.emissiveTexture = gaugeTex;
    this.contactGaugeMat.emissiveColor = new Color3(0.85, 0.85, 0.85);
    this.contactGaugeMat.disableLighting = true;
    const gaugeFace = CreatePlane('sil-gauge-face', { width: 0.17, height: 0.05 }, scene);
    gaugeFace.material = this.contactGaugeMat;
    gaugeFace.parent = this.root;
    gaugeFace.position = new Vector3(0.22, 0.075, 0.163);
    gaugeFace.rotation.x = -0.5;
    const gaugeCase = CreateBox('sil-gauge-case', { width: 0.19, height: 0.07, depth: 0.03 }, scene);
    gaugeCase.parent = this.root;
    gaugeCase.position = new Vector3(0.22, 0.06, 0.175);
    gaugeCase.material = housing(scene, 'sil-gauge-case-mat', '#2b303a');

    // --- controls -----------------------------------------------------------
    this.run = pushButton(scene, this.root, 'sil-wash', new Vector3(0.22, 0.02, -0.14), { width: 0.09, height: 0.03 });
    const telltale = telltales(scene, this.root, 'sil-lamps', new Vector3(0.3, 0.02, -0.14), [
      { label: 'US', colour: '#5ec8d8' },
    ]);
    this.washLamp = (on: boolean) => telltale.set(0, on);

    // Task light on a gooseneck, behind and above, raked forward over the bath.
    const lampArmMat = steel(scene, 'sil-lamp-arm-mat', '#8f99a5');
    const baseDisc = CreateCylinder('sil-lamp-base', { diameter: 0.05, height: 0.014, tessellation: 20 }, scene);
    baseDisc.parent = this.root;
    baseDisc.position = new Vector3(-0.02, 0.008, -0.17);
    baseDisc.material = lampArmMat;
    const gooseneck = CreateCylinder('sil-lamp-neck', { diameter: 0.01, height: 0.3, tessellation: 10 }, scene);
    gooseneck.parent = this.root;
    gooseneck.position = new Vector3(-0.02, 0.16, -0.17);
    gooseneck.material = lampArmMat;
    const shade = CreateCylinder(
      'sil-lamp-shade',
      { diameterTop: 0.05, diameterBottom: 0.1, height: 0.06, tessellation: 24 },
      scene,
    );
    shade.parent = this.root;
    shade.position = new Vector3(-0.02, 0.31, -0.15);
    shade.rotation.x = 0.9;
    shade.material = housing(scene, 'sil-lamp-shade-mat', '#2b303a');
    const bulb = new SpotLight('sil-task-lamp', Vector3.Zero(), Vector3.Up(), 2.1, 2, scene);
    bulb.intensity = 11;
    bulb.diffuse = new Color3(1, 0.98, 0.93);
    // MUST be parented: a Light lives in the scene, not in the transform graph,
    // so without this its position is WORLD space and the lamp ends up on the
    // floor beneath the bench.
    bulb.parent = this.root;
    bulb.position = new Vector3(-0.02, 0.3, -0.13);
    bulb.direction = new Vector3(0, -0.5, 0.86).normalize();

    nameplate(scene, this.root, 'sil-nameplate', 'SELECTIVE SILICIDE WET ETCH  ·  NH4OH:H2O2:H2O', 0.4, new Vector3(0, 0.022, 0.208));
    screws(scene, this.root, 'sil-screw', 0.4, 0.17, 0.024, 4);

    // --- instrument readout --------------------------------------------------
    this.panel = new Panel('sil-readout', { width: W, height: H, scale: 1.5 });
    this.readout = mountBench(scene, 'sil-readout', this.panel);
    this.readout.root.position = new Vector3(0, 0, -0.3);

    this.bindInput(scene);
  }

  private bindInput(scene: Scene): void {
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERUP) return;
      // The WASH key is the primary affordance; holding it is the mechanic.
      if (this.run.mesh.isPickable && this.hit(scene, this.run.mesh)) {
        const action: SilicideAction = this.sim.state.washing ? { type: 'stopWash' } : { type: 'startWash' };
        this.sim.act(action);
        return;
      }
      // Clicking the wafer commits, so the whole bench is operable by hand.
      if (this.hit(scene, this.holder.getChildMeshes().find((m) => m.name === 'sil-wafer')!)) {
        this.sim.act({ type: 'commit' });
      }
    });
  }

  private hit(scene: Scene, mesh: import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh): boolean {
    return scene.pick(scene.pointerX, scene.pointerY, (m) => m === mesh)?.hit === true;
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
    this.readout.setVisible(visible);
  }

  /** Frame the bench from a seated operator. Owned by the bench, limits included. */
  frameCamera(camera: import('@babylonjs/core/Cameras/arcRotateCamera.js').ArcRotateCamera): void {
    frameStation(camera, {
      // Between the bath and the dial: both have to be readable at once.
      target: new Vector3(0, BENCH_Y + 0.16, 0),
      alpha: -Math.PI / 2 - 0.12,
      beta: 1.12,
      radius: 0.72,
    });
  }

  update(dt: number): void {
    const s = this.sim.state;

    // Bath agitation: the surface lifts and the transducer glows while running.
    const running = s.washing && !s.finished;
    this.ripplePhase += dt * (running ? 26 : 2);
    const lift = 0.008 + (running ? 0.004 * Math.sin(this.ripplePhase) : 0);
    this.bathLiquid.scaling.y = Math.max(0.02, 0.155 + lift);
    this.bathLiquid.position.y = 0.026 + this.bathLiquid.scaling.y / 2;
    this.transducerMat.emissiveColor = running
      ? new Color3(0.3, 0.85, 0.95)
      : new Color3(0.03, 0.06, 0.03);
    this.washLamp(running);
    this.run.setPressed(running);

    // The holder dips only while the wash runs, so the wafer is IN the bath when
    // the ultrasonic is on and clear of it otherwise.
    const targetY = running ? 0.08 : 0.2;
    this.holder.position.y += (targetY - this.holder.position.y) * Math.min(1, dt * 5);
    this.probe.position.y = this.holder.position.y;

    // The dial: pointer at the conversion, window painted where C49 survives.
    const f = phaseFraction(s);
    this.dial.setProgress(f);
    this.dial.setWindow(0, 0.05);

    // Contact gauge.
    this.paintGauge(s.contactNm);

    this.history.push(s.reading.sheetResistanceMicroOhmCm);
    if (this.history.length > 200) this.history.shift();

    this.panel.flush((c) => this.paint(c, s));
  }

  private paintGauge(contactNm: number): void {
    const tex = (this.contactGaugeMat.emissiveTexture ?? null) as unknown as DynamicTexture | null;
    if (!tex) return;
    const ctx = tex.getContext() as CanvasRenderingContext2D;
    const w = 384;
    const h = 96;
    ctx.fillStyle = '#12161c';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7d8b9c';
    ctx.font = '600 15px monospace';
    ctx.fillText('Ti CONTACT', 12, 24);
    ctx.fillStyle = contactNm < 40 ? '#e8574a' : contactNm < 70 ? '#e8b552' : '#5fd68a';
    ctx.font = '800 34px monospace';
    ctx.fillText(`${contactNm.toFixed(0)} nm`, 12, 62);
    ctx.font = '600 13px monospace';
    ctx.fillStyle = '#7d8b9c';
    ctx.fillText('BARS = OPEN CIRCUIT', 12, 84);
    tex.update();
  }

  // -------------------------------------------------------------------------
  // Readout
  // -------------------------------------------------------------------------

  private paint(c: PanelCtx, s: SilicideEtchState): void {
    plate(c, 5);
    const r = s.reading;
    label(c, 'SILICIDE ETCH  ·  Rs MONITOR', 16, 22, { size: 15, color: C.text, weight: '800', font: MONO });
    label(c, `PHASE ${r.phase.toUpperCase()}`, c.w - 16, 22, {
      size: 14,
      color: r.phase === 'C49' ? C.good : r.phase === 'Transition' ? C.warn : C.bad,
      align: 'right',
      font: MONO,
      weight: '800',
    });
    hline(c, 34);

    // Sheet resistance, the number the operator actually reads.
    const rsT = (r.sheetResistanceMicroOhmCm - RS_LOW) / (RS_HIGH - RS_LOW);
    label(c, 'Rs', 16, 60, { size: 12, color: C.textDim, font: MONO, weight: '700' });
    value(c, `${r.sheetResistanceMicroOhmCm.toFixed(1)} µΩ·cm`, 200, 60, {
      size: 22,
      color: r.phase === 'C49' ? C.trace : C.warn,
      align: 'right',
    });
    // C54 on the left, C49 on the right — the physics runs that way round.
    label(c, `C54 ${RS_LOW}`, 16, 84, { size: 11, color: C.textDim, font: MONO });
    label(c, `C49 ${RS_HIGH}`, 200, 84, { size: 11, color: C.textDim, align: 'right', font: MONO });
    c.ctx.fillStyle = C.panel;
    c.ctx.fillRect(16, 94, 184, 10);
    c.ctx.fillStyle = C.trace;
    c.ctx.fillRect(16 + 184 * Math.max(0, Math.min(1, 1 - rsT)), 94, 184 * Math.max(0, Math.min(1, rsT)), 10);

    // Conversion trace.
    graticuleBand(c, 126, 104);
    const pts: number[] = [];
    const n = this.history.length;
    for (let i = 0; i < n; i++) {
      const v = (this.history[i]! - RS_LOW) / (RS_HIGH - RS_LOW);
      pts.push(16 + (i / Math.max(1, n - 1)) * (c.w - 32), 126 + 104 - v * 104);
    }
    trace(c, pts, C.trace, 2);
    label(c, 'Rs vs TIME', 16, 126, { size: 11, color: C.textDim, font: MONO });

    // Wash window and verdict.
    label(c, 'ULTRASONIC WASH', 16, 258, { size: 12, color: C.textDim, font: MONO, weight: '700' });
    value(c, `${s.washSeconds.toFixed(1)}s`, 200, 258, { size: 18, color: s.washing ? C.accent : C.text, align: 'right' });

    const strippable = r.strippable;
    const prompt = s.finished
      ? s.result?.success
        ? 'STRINGER STRIPPED — WAFER SALVAGED'
        : 'BRIDGE LOCKED IN — WAFER SCRAPPED'
      : s.washing
        ? strippable
          ? 'WASHING IN THE C49 WINDOW — CORRECT'
          : 'TOO LATE — THE LATTICE HAS CONVERTED'
        : strippable
          ? 'WINDOW OPEN — FIRE THE WASH'
          : 'WINDOW CLOSED';
    label(c, prompt, c.w / 2, c.h - 24, {
      size: 15,
      color: s.finished ? (s.result?.success ? C.good : C.bad) : strippable ? C.good : C.bad,
      align: 'center',
      weight: '800',
      font: MONO,
    });
  }
}

function graticuleBand(c: PanelCtx, y: number, h: number): void {
  c.ctx.save();
  c.ctx.strokeStyle = C.grid;
  c.ctx.lineWidth = 1;
  c.ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const gy = Math.round(y + (i / 4) * h) + 0.5;
    c.ctx.moveTo(16, gy);
    c.ctx.lineTo(c.w - 16, gy);
  }
  c.ctx.stroke();
  c.ctx.restore();
}

/** Fraction of the C49 -> C54 conversion completed, 0..1. */
function phaseFraction(s: SilicideEtchState): number {
  return Math.max(0, Math.min(1, s.elapsedSeconds / Math.max(1e-6, s.tauSeconds * 1.6)));
}

export { RS_HIGH, RS_LOW };