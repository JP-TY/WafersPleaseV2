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
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { matte } from '../scene.js';
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

      // Trays: the lot slides downstream into one of these after the stamp, so
      // the three outcomes have somewhere to physically go.
      const tray = CreateBox(`stamp-${action}-tray`, { width: 0.2, height: 0.012, depth: 0.26 }, scene);
      tray.parent = base;
      tray.position = new Vector3(0, -0.008, 0.02);
      tray.material = matte(scene, `stamp-${action}-tray-mat`, style.body, 0.2);
      // A raised lip on the downstream edge, so the tray reads as a receptacle.
      const lip = CreateBox(`stamp-${action}-lip`, { width: 0.2, height: 0.03, depth: 0.012 }, scene);
      lip.parent = base;
      lip.position = new Vector3(0, 0.008, 0.145);
      lip.material = matte(scene, `stamp-${action}-lip-mat`, style.body, 0.24);

      // Handle shaft + knob.
      const shaft = CreateCylinder(`stamp-${action}-shaft`, { diameter: 0.022, height: 0.09, tessellation: 20 }, scene);
      shaft.parent = base;
      shaft.position = new Vector3(0, 0.062, 0);
      shaft.material = matte(scene, `stamp-${action}-shaft-mat`, new Color3(0.42, 0.44, 0.48), 0.5);

      const knob = CreateCylinder(
        `stamp-${action}-knob`,
        { diameterTop: 0.05, diameterBottom: 0.066, height: 0.05, tessellation: 28 },
        scene,
      );
      knob.parent = base;
      knob.position = new Vector3(0, 0.128, 0);
      knob.material = matte(scene, `stamp-${action}-knob-mat`, new Color3(0.2, 0.14, 0.12), 0.35);

      // The rubber die itself, carrying the colour that prints on the traveler.
      const head = CreateCylinder(
        `stamp-${action}-head`,
        { diameter: 0.078, height: 0.026, tessellation: 32 },
        scene,
      );
      head.parent = base;
      head.position = new Vector3(0, 0.012, 0);
      const headMat = new StandardMaterial(`stamp-${action}-head-mat`, scene);
      headMat.diffuseColor = Color3.Black();
      headMat.specularColor = new Color3(0.06, 0.06, 0.06);
      headMat.emissiveColor = Color3.FromHexString(style.face).scale(0.5);
      head.material = headMat;

      // The printing face, hidden until the press pushes it below the tray rim.
      const face = CreateCylinder(
        `stamp-${action}-face`,
        { diameter: 0.07, height: 0.004, tessellation: 32 },
        scene,
      );
      face.parent = base;
      face.position = new Vector3(0, -0.003, 0);
      const faceMat = new StandardMaterial(`stamp-${action}-face-mat`, scene);
      faceMat.diffuseColor = Color3.Black();
      faceMat.specularColor = Color3.Black();
      faceMat.emissiveColor = Color3.FromHexString(style.face);
      face.material = faceMat;

      const collar = CreateTorus(
        `stamp-${action}-collar`,
        { diameter: 0.086, thickness: 0.008, tessellation: 28 },
        scene,
      );
      collar.parent = base;
      collar.position = new Vector3(0, 0.024, 0);
      collar.material = matte(scene, `stamp-${action}-collar-mat`, new Color3(0.45, 0.47, 0.5), 0.55);

      this.stamps.set(action, { action, head, face, plate: tray, press: 0, animating: false, timer: 0 });
    });

    // The traveler itself sits where the stamp lands, so pressing a stamp puts
    // an imprint on paper rather than into empty air.
    const card = CreateBox('stamp-target-card', { width: 0.17, height: 0.004, depth: 0.22 }, scene);
    card.parent = this.root;
    card.position = new Vector3(LAYOUT.stamps.x, BENCH_Y + 0.004, LAYOUT.stamps.z);
    card.material = matte(scene, 'stamp-target-card-mat', new Color3(0.85, 0.82, 0.74), 0.06);
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
      s.head.position.y = 0.012 - lift;
      s.face.position.y = -0.003 - lift;
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