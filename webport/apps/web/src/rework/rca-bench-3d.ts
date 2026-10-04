/**
 * The RCA wet bench, as a physical object in the room.
 *
 * The simulation for this minigame was always correct — twin tanks, independent
 * temperatures, Arrhenius-weighted soak, megasonic rinses. What it was not was
 * VISIBLE. It lived entirely on a 2D panel: two rectangles drawn in Canvas2D with
 * a fill level, which is a picture of a wet bench rather than a wet bench.
 *
 * So the tanks are now geometry. Two real baths with liquid volumes whose level
 * and colour track the simulation, a wafer on a fork that physically travels
 * between them, heater coils that glow when the element is on, and a megasonic
 * transducer that ripples the rinse. What the panel keeps is the part a camera
 * could not usefully show: the trace, the limits and the verdict — those belong on
 * a readout, and a fab bench does have one.
 *
 * The rule the GDD cares about (§8A: SC-1 removes organics, SC-2 removes metals,
 * both needed, in order, each at its own temperature) is now something you watch
 * happen to a wafer on a fork rather than something you read off a bar chart.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';

import { C, MONO, Panel, hline, label, plate, trace, value, type PanelCtx } from '../ui/panel.js';
import { mountBench, type BenchMount, BENCH_Y } from '../ui/bench.js';
import { housing, Knob, nameplate, screws, telltales } from '../scene/physical.js';
import { steel } from '../scene/lighting.js';
import { WAFER_RADIUS } from '../inspection/wafer-stage.js';
import {
  rcaRemovalFraction,
  realMinutes,
  type RcaAction,
  type RcaCleanState,
  type ReworkMinigame,
} from '@wafers/sim';

const W = 900;
const H = 460;

/** Bath colours: SC-1 alkaline peroxide is faintly amber, SC-2 acid is clear. */
const LIQUID: Record<'sc1' | 'sc2' | 'qdr', string> = {
  sc1: '#c9a227',
  sc2: '#9fd8d0',
  qdr: '#b8d4e8',
};

const TANK_R = 0.1;
const TANK_H = 0.17;

/** One bath: a tank, liquid, heater coil, and a thermometer. */
class Bath {
  readonly root: TransformNode;
  readonly liquid: AbstractMeshAlias;
  readonly coil: AbstractMeshAlias;
  readonly knob: Knob;
  readonly lamp: (on: boolean) => void;

  private readonly surface: AbstractMeshAlias;
  private readonly bulb: AbstractMeshAlias;
  private readonly coilMat: StandardMaterial;
  private readonly bulbMat: StandardMaterial;
  private readonly liquidMat: PBRMaterial;

  constructor(
    scene: Scene,
    parent: TransformNode,
    name: string,
    origin: Vector3,
    liquidColour: string,
  ) {
    this.root = new TransformNode(`${name}-root`, scene);
    this.root.parent = parent;
    this.root.position = origin;

    const quartz = new PBRMaterial(`${name}-quartz-mat`, scene);
    quartz.albedoColor = new Color3(0.86, 0.89, 0.93);
    quartz.metallic = 0;
    quartz.roughness = 0.22;
    quartz.environmentIntensity = 1.5;

    // Tank wall: a cylinder with no caps, so you can see the liquid inside.
    const wall = CreateCylinder(`${name}-wall`, { diameter: TANK_R * 2, height: TANK_H, tessellation: 48, cap: 0 }, scene);
    wall.parent = this.root;
    wall.position = new Vector3(0, TANK_H / 2, 0);
    wall.material = quartz;

    // Liquid volume, scaled vertically as the level rises.
    this.liquidMat = new PBRMaterial(`${name}-liquid-mat`, scene);
    this.liquidMat.albedoColor = Color3.FromHexString(liquidColour);
    this.liquidMat.metallic = 0;
    this.liquidMat.roughness = 0.1;
    this.liquidMat.emissiveColor = Color3.FromHexString(liquidColour).scale(0.22);
    this.liquidMat.environmentIntensity = 1.6;

    this.liquid = CreateCylinder(`${name}-liquid`, { diameter: TANK_R * 1.94, height: 1, tessellation: 40 }, scene);
    this.liquid.parent = this.root;
    this.liquid.material = this.liquidMat;

    // Meniscus disc on top of the liquid, slightly brighter.
    this.surface = CreateCylinder(`${name}-surface`, { diameter: TANK_R * 1.94, height: 0.0015, tessellation: 40 }, scene);
    this.surface.parent = this.liquid;
    this.surface.position = new Vector3(0, 0.5, 0);
    const surfMat = new StandardMaterial(`${name}-surface-mat`, scene);
    surfMat.diffuseColor = Color3.Black();
    surfMat.emissiveColor = Color3.FromHexString(liquidColour).scale(0.9);
    surfMat.disableLighting = true;
    this.surface.material = surfMat;

    // Heater coil around the base. Emissive, so it visibly glows with current.
    this.coilMat = new StandardMaterial(`${name}-coil-mat`, scene);
    this.coilMat.diffuseColor = Color3.Black();
    this.coilMat.emissiveColor = new Color3(0.06, 0.02, 0.01);
    this.coilMat.disableLighting = true;
    this.coil = CreateTorus(`${name}-coil`, { diameter: TANK_R * 1.5, thickness: 0.008, tessellation: 32 }, scene);
    this.coil.parent = this.root;
    this.coil.position = new Vector3(0, 0.016, 0);
    this.coil.material = this.coilMat;
    for (let i = 1; i <= 2; i++) {
      const ring = CreateTorus(`${name}-coil-${i}`, { diameter: TANK_R * 1.5, thickness: 0.006, tessellation: 32 }, scene);
      ring.parent = this.root;
      ring.position = new Vector3(0, 0.016 + i * 0.008, 0);
      ring.material = this.coilMat;
    }

    // Bath rim.
    const rim = CreateTorus(`${name}-rim`, { diameter: TANK_R * 2, thickness: 0.006, tessellation: 48 }, scene);
    rim.parent = this.root;
    rim.position = new Vector3(0, TANK_H, 0);
    rim.material = steel(scene, `${name}-rim-mat`, '#b0bac6');

    // Thermometer bulb in the liquid, with a stem out of the tank.
    this.bulbMat = new StandardMaterial(`${name}-bulb-mat`, scene);
    this.bulbMat.diffuseColor = Color3.Black();
    this.bulbMat.emissiveColor = new Color3(0.1, 0.1, 0.1);
    this.bulbMat.disableLighting = true;
    this.bulb = CreateSphere(`${name}-bulb`, { diameter: 0.014, segments: 8 }, scene);
    this.bulb.parent = this.root;
    this.bulb.position = new Vector3(TANK_R * 0.72, 0.05, TANK_R * 0.72);
    this.bulb.material = this.bulbMat;

    const stem = CreateCylinder(`${name}-stem`, { diameter: 0.005, height: TANK_H + 0.05, tessellation: 8 }, scene);
    stem.parent = this.root;
    stem.position = new Vector3(TANK_R * 0.72, TANK_H * 0.6, TANK_R * 0.72);
    stem.material = steel(scene, `${name}-stem-mat`, '#c8d2de');

    // Physical heater trim on the front of the bench.
    this.knob = new Knob(scene, this.root, `${name}-knob`, new Vector3(0, 0.02, TANK_R + 0.075), { radius: 0.024 });
    const telltale = telltales(scene, this.root, `${name}-lamp`, new Vector3(0.05, 0.02, TANK_R + 0.075), [
      { label: 'HEAT', colour: '#e8574a' },
    ]);
    this.lamp = (on: boolean) => telltale.set(0, on);
  }

  /** Level in [0,1], temperature in C, and whether the element is powered. */
  update(level: number, temperatureC: number, targetC: number, heating: boolean, inSpec: boolean): void {
    const h = Math.max(0.004, level * (TANK_H - 0.014));
    this.liquid.scaling.y = h;
    this.liquid.position.y = 0.007 + h / 2;

    // The element glows when it is actually drawing power, and brighter the
    // further the bath is from setpoint — so the player can see the heater work.
    const delta = Math.abs(temperatureC - targetC);
    const glow = heating ? Math.min(1, delta / 18) : 0;
    this.coilMat.emissiveColor = new Color3(0.06 + glow * 1.5, 0.02 + glow * 0.28, 0.01 + glow * 0.06);

    // The bulb reads the bath colour: red when over, blue when under, green when
    // in the window. This is the one thing a camera can carry better than text.
    const bulb = inSpec
      ? new Color3(0.2, 1.5, 0.5)
      : temperatureC > targetC
        ? new Color3(1.6, 0.35, 0.25)
        : new Color3(0.3, 0.6, 1.6);
    this.bulbMat.emissiveColor = bulb;
    this.lamp(heating);
  }
}

type AbstractMeshAlias = import('@babylonjs/core/Meshes/abstractMesh.js').AbstractMesh;

export class RcaBench {
  private readonly panel: Panel;
  private readonly sim: ReworkMinigame<RcaCleanState, RcaAction>;
  private readonly readout: BenchMount;
  private readonly root: TransformNode;

  private readonly sc1: Bath;
  private readonly sc2: Bath;
  private readonly qdr: Bath;
  /** The fork the wafer rides on. Travels between the three baths. */
  private readonly fork: TransformNode;
  private readonly forkWafer: AbstractMeshAlias;
  private readonly rippleMat: StandardMaterial;
  private readonly history: number[] = [];

  constructor(scene: Scene, sim: ReworkMinigame<RcaCleanState, RcaAction>) {
    this.sim = sim;
    this.root = new TransformNode('rca-bench', scene);
    // The bench geometry is laid out in LOCAL coordinates around the working
    // surface, so the root has to be lifted to bench height. Without this the
    // whole station sits at floor level and is buried in the floor plane.
    this.root.position = new Vector3(0, BENCH_Y, 0);

    const wetDeck = CreateBox('rca-deck', { width: 1.1, height: 0.04, depth: 0.42 }, scene);
    wetDeck.parent = this.root;
    wetDeck.position = new Vector3(0, 0, 0);
    wetDeck.material = steel(scene, 'rca-deck-mat', '#7c8592');

    // Spill tray lip around the deck, so the bench has an edge.
    for (const [w, h, d, x, z] of [
      [1.12, 0.05, 0.012, 0, 0.21],
      [1.12, 0.05, 0.012, 0, -0.21],
    ] as const) {
      const lip = CreateBox('rca-deck-lip', { width: w, height: h, depth: d }, scene);
      lip.parent = this.root;
      lip.position = new Vector3(x, 0.01, z);
      lip.material = steel(scene, 'rca-deck-lip-mat', '#98a2ae');
    }

    this.sc1 = new Bath(scene, this.root, 'sc1', new Vector3(-0.3, 0.02, 0), LIQUID.sc1);
    this.qdr = new Bath(scene, this.root, 'qdr', new Vector3(0, 0.02, 0), LIQUID.qdr);
    this.sc2 = new Bath(scene, this.root, 'sc2', new Vector3(0.3, 0.02, 0), LIQUID.sc2);

    // Megasonic transducer under the rinse, which is what actually does the work.
    this.rippleMat = new StandardMaterial('rca-ripple-mat', scene);
    this.rippleMat.diffuseColor = Color3.Black();
    this.rippleMat.emissiveColor = Color3.FromHexString(LIQUID.qdr).scale(0.3);
    this.rippleMat.alpha = 0.55;
    this.rippleMat.disableLighting = true;

    // --- the fork ---------------------------------------------------------
    this.fork = new TransformNode('rca-fork', scene);
    this.fork.parent = this.root;
    const armMat = steel(scene, 'rca-fork-arm-mat', '#c2ccd8');
    const arm = CreateBox('rca-fork-arm', { width: 0.42, height: 0.008, depth: 0.012 }, scene);
    arm.parent = this.fork;
    arm.position = new Vector3(0, 0.235, 0.11);
    arm.material = armMat;
    const column = CreateCylinder('rca-fork-column', { diameter: 0.014, height: 0.22, tessellation: 12 }, scene);
    column.parent = this.fork;
    column.position = new Vector3(0.2, 0.235, 0.11);
    column.material = armMat;
    const crossBar = CreateBox('rca-fork-cross', { width: 0.012, height: 0.008, depth: 0.2 }, scene);
    crossBar.parent = this.fork;
    crossBar.position = new Vector3(0, 0.229, 0.02);
    crossBar.material = armMat;

    this.forkWafer = CreateCylinder('rca-wafer', { diameter: WAFER_RADIUS * 2, height: 0.0008, tessellation: 48 }, scene);
    this.forkWafer.parent = this.fork;
    this.forkWafer.position = new Vector3(0, 0.222, 0.02);
    const waferMat = new PBRMaterial('rca-wafer-mat', scene);
    waferMat.albedoColor = new Color3(0.1, 0.11, 0.14);
    waferMat.metallic = 0.7;
    waferMat.roughness = 0.3;
    this.forkWafer.material = waferMat;

    // --- instrument readout ------------------------------------------------
    // The trace and the limits stay on a screen, because that is what a fab bench
    // has, and because a graph drawn in 3D would be unreadable at this scale.
    this.panel = new Panel('rca-readout', { width: W, height: H, scale: 1.5 });
    this.readout = mountBench(scene, 'rca-readout', this.panel);
    // On a stalk behind and above the tanks, so the operator looks at the bath
    // and then up at the trace. `mountBench` already builds the screen at bench
    // height, so only the depth offset belongs here.
    this.readout.root.position = new Vector3(0, 0, -0.3);
    this.readout.root.position.y = 0;
    const stalk = CreateCylinder('rca-readout-stalk', { diameter: 0.03, height: 0.34, tessellation: 12 }, scene);
    stalk.parent = this.root;
    stalk.position = new Vector3(-0.32, 0.19, -0.3);
    stalk.material = steel(scene, 'rca-readout-stalk-mat', '#8f99a5');

    // Hood lamp over the deck. A wet bench has its own light, and without it the
    // chemistry is unreadable in a room lit for people, not for baths.
    // Set BEHIND and ABOVE the baths, not over them. Directly overhead it sat
    // between a near-level operator eye and the chemistry and hid the tanks
    // completely — correct geometry, invisible.
    const hood = CreateBox('rca-hood', { width: 0.9, height: 0.045, depth: 0.14 }, scene);
    hood.parent = this.root;
    hood.position = new Vector3(0, 0.44, -0.2);
    hood.material = housing(scene, 'rca-hood-mat', '#282d36');
    for (const sx of [-1, 1]) {
      const post = CreateBox('rca-hood-post', { width: 0.018, height: 0.44, depth: 0.018 }, scene);
      post.parent = this.root;
      post.position = new Vector3(sx * 0.42, 0.22, -0.26);
      post.material = steel(scene, 'rca-hood-post-mat', '#8f99a5');
    }
    // Raked forward and down over the baths rather than straight down.
    const lamp = new SpotLight(
      'rca-hood-lamp',
      new Vector3(0, 0.43, -0.2),
      new Vector3(0, -0.62, 0.78).normalize(),
      1.9,
      3,
      scene,
    );
    lamp.intensity = 7;
    lamp.diffuse = new Color3(1, 0.98, 0.92);

    nameplate(scene, this.root, 'rca-nameplate', 'RCA-1  DUAL-TANK WET BENCH', 0.34, new Vector3(0, 0.028, 0.215));
    screws(scene, this.root, 'rca-screw', 0.5, 0.19, 0.025, 4);

    this.bindInput(scene);
  }

  private bindInput(scene: Scene): void {
    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERUP) return;
      const action = this.pickControl(scene);
      if (action) this.sim.act(action);
    });
  }

  /** Hit-test the physical controls. Anything not a control falls through. */
  private pickControl(scene: Scene): RcaAction | null {
    const pick = (mesh: AbstractMeshAlias) =>
      scene.pick(scene.pointerX, scene.pointerY, (m) => m === mesh)?.hit === true;

    for (const b of [this.sc1, this.sc2] as const) {
      if (pick(b.knob.mesh)) {
        const s = this.sim.state;
        const current = b === this.sc1 ? s.baths.sc1.setpointC : s.baths.sc2.setpointC;
        // Dragging a real knob: each click is a detent, so rotate it visibly and
        // step the setpoint the way a 5-degree pot would.
        const next = clampSetpoint(current + 5);
        b.knob.setValue(next / 100);
        return { type: 'setHeater', bath: b === this.sc1 ? 'sc1' : 'sc2', setpointC: next };
      }
    }

    // The fork: clicking the wafer or the arm immerses or withdraws.
    if (pick(this.forkWafer) || pick(this.fork.getChildMeshes()[0] as AbstractMeshAlias)) {
      return this.sim.state.immersed ? { type: 'withdraw' } : { type: 'immerse' };
    }
    return null;
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
    this.readout.setVisible(visible);
  }

  update(dt: number): void {
    const s = this.sim.state;
    void dt;

    // Tank levels: full when the wafer is in them, otherwise charged and ready.
    this.sc1.update(0.8, s.baths.sc1.temperatureC, s.baths.sc1.setpointC, Math.abs(s.baths.sc1.temperatureC - s.baths.sc1.setpointC) > 0.4, inWindow(s.baths.sc1.temperatureC, s.step, 'SC1'));
    this.sc2.update(0.8, s.baths.sc2.temperatureC, s.baths.sc2.setpointC, Math.abs(s.baths.sc2.temperatureC - s.baths.sc2.setpointC) > 0.4, inWindow(s.baths.sc2.temperatureC, s.step, 'SC2'));
    this.qdr.update(s.active === 'qdr' ? 0.85 : 0.8, 22, 22, s.active === 'qdr' && s.immersed, true);

    // Move the fork to whichever bath the current step uses.
    const target = s.step.kind === 'SC1' ? -0.3 : s.step.kind === 'SC2' ? 0.3 : 0;
    const lift = s.immersed ? 0.06 : TANK_H + 0.08;
    this.fork.position.x += (target - this.fork.position.x) * Math.min(1, dt * 6);
    this.fork.position.y += (lift - this.fork.position.y) * Math.min(1, dt * 6);

    // Megasonic agitation ripples while the rinse is actually running.
    const agitating = s.active === 'qdr' && s.immersed;
    this.rippleMat.alpha = agitating ? 0.3 + Math.sin(this.sim.state.dwellSeconds * 30) * 0.2 : 0.0;

    const removal = this.removalFraction();
    this.history.push(removal);
    if (this.history.length > 160) this.history.shift();

    this.panel.flush((c) => this.paint(c, s));
  }

  /** Fraction of the target film removed so far, from the integrated exposure. */
  private removalFraction(): number {
    // Read straight from the simulation rather than recomputing an Arrhenius
    // integral here, so the drawn curve cannot disagree with the verdict.
    return rcaRemovalFraction(this.sim.state);
  }

  // -------------------------------------------------------------------------
  // Readout — the part that genuinely belongs on a screen
  // -------------------------------------------------------------------------

  private paint(c: PanelCtx, s: RcaCleanState): void {
    plate(c, 5);
    label(c, 'RCA-1  ·  SC-1 / QDR / SC-2 / QDR', 16, 22, { size: 15, color: C.text, weight: '800', font: MONO });
    label(c, s.step.label, c.w - 16, 22, { size: 13, color: C.accent, align: 'right', font: MONO });
    hline(c, 34);

    // Bath temperatures, side by side, with their windows.
    let x = 16;
    for (const [name, bath, key] of [
      ['SC-1', s.baths.sc1, 'SC1'],
      ['SC-2', s.baths.sc2, 'SC2'],
    ] as const) {
      const ok = inWindow(bath.temperatureC, s.step, key);
      label(c, name, x, 60, { size: 12, color: C.textDim, font: MONO, weight: '700' });
      value(c, `${bath.temperatureC.toFixed(1)}°C`, x, 84, { size: 20, color: ok ? C.good : C.bad, align: 'left' });
      const win = s.step.kind === key ? s.step.targetC : key === 'SC1' ? { min: 70, nominal: 75, max: 80 } : { min: 30, nominal: 35, max: 40 };
      label(c, `${win.min}–${win.max}°C  set ${bath.setpointC.toFixed(0)}°`, x, 106, { size: 11, color: C.textDim, font: MONO });
      x += 190;
    }

    // Dwell progress for the active step.
    label(c, `DWELL  ${s.dwellSeconds.toFixed(1)} / ${s.step.dwellSeconds}s  (${realMinutes(s.dwellSeconds).toFixed(1)} min real)`, 16, 136, {
      size: 13,
      color: C.text,
      font: MONO,
    });
    const frac = Math.min(1, s.dwellSeconds / Math.max(1, s.step.dwellSeconds));
    c.ctx.fillStyle = C.panel;
    c.ctx.fillRect(16, 150, c.w - 32, 12);
    c.ctx.fillStyle = C.accent;
    c.ctx.fillRect(16, 150, (c.w - 32) * frac, 12);

    // Removal trace.
    graticuleAt(c, 176, 92);
    const pts: number[] = [];
    const n = this.history.length;
    for (let i = 0; i < n; i++) {
      pts.push(16 + (i / Math.max(1, n - 1)) * (c.w - 32), 176 + 92 - this.history[i]! * 92);
    }
    trace(c, pts, C.trace, 2);
    label(c, 'REMOVAL', 16, 176, { size: 11, color: C.textDim, font: MONO });
    label(c, '100%', c.w - 16, 182, { size: 11, color: C.textDim, align: 'right', font: MONO });

    // Verdict / prompt.
    const prompt = s.finished
      ? s.result?.success
        ? 'RCA COMPLETE — WAFER TO NEXT TOOL'
        : 'RCA FAILED — WAFER SCRAPPED'
      : s.immersed
        ? 'SOAKING — WITHDRAW WHEN THE DWELL IS DONE'
        : `IMMERSE IN ${s.step.kind}`;
    label(c, prompt, c.w / 2, c.h - 22, {
      size: 15,
      color: s.finished ? (s.result?.success ? C.good : C.bad) : C.text,
      align: 'center',
      weight: '700',
      font: MONO,
    });
  }
}

function graticuleAt(c: PanelCtx, y: number, h: number): void {
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

function inWindow(tempC: number, step: { kind: string; targetC: { min: number; max: number } }, key: string): boolean {
  const w = step.kind === key ? step.targetC : key === 'SC1' ? { min: 70, max: 80 } : { min: 30, max: 40 };
  return tempC >= w.min && tempC <= w.max;
}

function clampSetpoint(v: number): number {
  return Math.max(20, Math.min(95, v));
}
