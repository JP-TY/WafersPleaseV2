/**
 * Mechanical routing stamps (GDD §13).
 *
 * "Three spring-loaded heavy rubber stamps (ACCEPT, REJECT, REWORK) used to
 * physically stamp the routing traveler and slide the lot into its downstream
 * processing track."
 *
 * Spring-loaded means the press is a real animation with travel and a snap-back,
 * not a button that changes colour. The diegetic detail is doing work here: the
 * player should feel that a stamp is committed and irreversible, because it is.
 * GDD §4 also wants "mechanical mouse clicks for stamp interactions" on desktop
 * and "physical stamping gestures" in VR, so the press is exposed as a method
 * the XR layer can call directly.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { painted, rubber, steel } from '../scene/lighting.js';
import { BENCH_Y, LAYOUT } from './bay.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { PlayerAction } from '@wafers/sim';

const STAMP_TRAVEL = 0.055;
const PRESS_TIME = 0.09;
const RETURN_TIME = 0.22;

const STAMP_STYLE: Record<PlayerAction, { face: string; body: Color3 }> = {
  Accept: { face: '#2f9d5c', body: new Color3(0.1, 0.16, 0.12) },
  Reject: { face: '#c0392b', body: new Color3(0.18, 0.09, 0.08) },
  Rework: { face: '#c08a1e', body: new Color3(0.16, 0.13, 0.06) },
};

/** Holder finish, shared by all three: the die colour is the only signal. */
const HOLDER = '#717a86';

interface Stamp {
  readonly action: PlayerAction;
  readonly head: AbstractMesh;
  readonly face: AbstractMesh;
  readonly plate: AbstractMesh;
  /** 0 = fully up, 1 = fully pressed. */
  press: number;
  /** Set while the press animation runs. */
  animating: boolean;
  /** Time left in the current animation phase. */
  timer: number;
}

export class StampBank {
  private readonly root: TransformNode;
  private readonly stamps = new Map<PlayerAction, Stamp>();
  private enabled = false;

  constructor(scene: Scene) {
    this.root = new TransformNode('stamp-bank', scene);

    const actions: PlayerAction[] = ['Accept', 'Reject', 'Rework'];
    actions.forEach((action, i) => {
      const style = STAMP_STYLE[action];
      const x = (i - 1) * 0.24;
      const base = new TransformNode(`stamp-${action}-base`, scene);
      base.parent = this.root;
      base.position = new Vector3(LAYOUT.stamps.x + x, BENCH_Y + 0.012, LAYOUT.stamps.z);

      // Machined holder block. A stamp standing in a socket is what makes it
      // read as a tool; the earlier flat tray read as a coloured card.
      const tray = CreateBox(`stamp-${action}-tray`, { width: 0.14, height: 0.05, depth: 0.16 }, scene);
      tray.parent = base;
      tray.position = new Vector3(0, 0.016, 0);
      tray.material = steel(scene, `stamp-${action}-tray-mat`, HOLDER);

      // The downstream chute the stamped lot slides into, behind the holder.
      const chute = CreateBox(`stamp-${action}-chute`, { width: 0.13, height: 0.008, depth: 0.13 }, scene);
      chute.parent = base;
      chute.position = new Vector3(0, -0.014, 0.15);
      chute.material = steel(scene, `stamp-${action}-chute-mat`, '#5c646e');
      const lip = CreateBox(`stamp-${action}-lip`, { width: 0.13, height: 0.026, depth: 0.008 }, scene);
      lip.parent = base;
      lip.position = new Vector3(0, 0, 0.212);
      lip.material = steel(scene, `stamp-${action}-lip-mat`, HOLDER);

      // Base plate under the holder.
      const foot = CreateBox(`stamp-${action}-foot`, { width: 0.17, height: 0.008, depth: 0.2 }, scene);
      foot.parent = base;
      foot.position = new Vector3(0, -0.014, 0.06);
      foot.material = painted(scene, `stamp-${action}-foot-mat`, '#242830', 0.6);

      // Turned hardwood handle on a steel shaft: the classic office stamp, and
      // the material contrast is what sells "press me".
      const shaft = CreateCylinder(`stamp-${action}-shaft`, { diameter: 0.016, height: 0.055, tessellation: 20 }, scene);
      shaft.parent = base;
      shaft.position = new Vector3(0, 0.06, 0);
      shaft.material = steel(scene, `stamp-${action}-shaft-mat`, '#aeb8c4');

      const knob = CreateCylinder(
        `stamp-${action}-knob`,
        { diameterTop: 0.038, diameterBottom: 0.058, height: 0.062, tessellation: 28 },
        scene,
      );
      knob.parent = base;
      knob.position = new Vector3(0, 0.118, 0);
      knob.material = rubber(scene, `stamp-${action}-knob-mat`, '#4a3327');
      const cap = CreateCylinder(
        `stamp-${action}-cap`,
        { diameterTop: 0.03, diameterBottom: 0.038, height: 0.014, tessellation: 24 },
        scene,
      );
      cap.parent = base;
      cap.position = new Vector3(0, 0.155, 0);
      cap.material = steel(scene, `stamp-${action}-cap-mat`, '#c2ccd8');

      // The rubber die itself, carrying the colour that prints on the traveler.
      // The rubber die. Body is black rubber; the COLOUR goes on the printing
      // face only, because that is the face that transfers ink, and painting the
      // whole body colour made it read as a plastic toy.
      const head = CreateCylinder(
        `stamp-${action}-head`,
        { diameter: 0.07, height: 0.028, tessellation: 32 },
        scene,
      );
      head.parent = base;
      head.position = new Vector3(0, 0.05, 0);
      head.material = rubber(scene, `stamp-${action}-head-mat`, '#191b1f');

      // The printing face, hidden until the press pushes it below the tray rim.
      const face = CreateCylinder(
        `stamp-${action}-face`,
        { diameter: 0.07, height: 0.004, tessellation: 32 },
        scene,
      );
      face.parent = base;
      face.position = new Vector3(0, 0.035, 0);
      face.material = rubber(scene, `stamp-${action}-face-mat`, style.face);

      const collar = CreateTorus(
        `stamp-${action}-collar`,
        { diameter: 0.074, thickness: 0.007, tessellation: 28 },
        scene,
      );
      collar.parent = base;
      collar.position = new Vector3(0, 0.066, 0);
      collar.material = steel(scene, `stamp-${action}-collar-mat`, '#b6c0cc');

      this.stamps.set(action, { action, head, face, plate: tray, press: 0, animating: false, timer: 0 });
    });

    // The traveler itself sits where the stamp lands, so pressing a stamp puts
    // an imprint on paper rather than into empty air.
    const card = CreateBox('stamp-target-card', { width: 0.15, height: 0.004, depth: 0.2 }, scene);
    card.parent = this.root;
    card.position = new Vector3(LAYOUT.stamps.x, BENCH_Y + 0.004, LAYOUT.stamps.z);
    // Printed traveler stock, sitting under all three dies.
    card.material = painted(scene, 'stamp-target-card-mat', '#8d8674', 0.75);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.root.setEnabled(true);
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  /**
   * Fire a stamp. Returns false when the bank is disabled or that stamp is
   * already mid-press, so a double-click cannot inject two dispositions.
   */
  press(action: PlayerAction): boolean {
    if (!this.enabled) return false;
    const s = this.stamps.get(action);
    if (!s || s.animating) return false;
    s.animating = true;
    s.timer = PRESS_TIME;
    return true;
  }

  /** True while any stamp animation is still running. */
  get busy(): boolean {
    for (const s of this.stamps.values()) if (s.animating) return true;
    return false;
  }

  update(dt: number): void {
    for (const s of this.stamps.values()) {
      if (!s.animating) continue;
      s.timer -= dt;
      if (s.timer > 0) {
        // Ease the press so it accelerates into the paper like a real spring.
        s.press = Math.min(1, 1 - s.timer / PRESS_TIME);
        continue;
      }
      if (s.press >= 1) {
        // Impact done: snap back over RETURN_TIME.
        s.press = Math.max(0, s.press - dt / RETURN_TIME);
        if (s.press === 0) s.animating = false;
        continue;
      }
      s.press = 0;
      s.animating = false;
    }

    for (const s of this.stamps.values()) {
      const lift = s.press * STAMP_TRAVEL;
      s.head.position.y = 0.05 - lift;
      s.face.position.y = 0.035 - lift;
    }
  }

  /** Meshes the player can click, mapped to the action each one commits. */
  pickables(): Array<{ mesh: AbstractMesh; action: PlayerAction }> {
    const out: Array<{ mesh: AbstractMesh; action: PlayerAction }> = [];
    for (const s of this.stamps.values()) {
      out.push({ mesh: s.head, action: s.action });
      out.push({ mesh: s.face, action: s.action });
    }
    return out;
  }
}