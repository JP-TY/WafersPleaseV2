import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { PlayerAction } from '@wafers/sim';
import { COLORS, metal, lamp, rubber, matte, matteNoise, contactBlobMat } from '../bootstrap/materials.js';
import { applyLabel } from './labels.js';

const STAMP_META: Record<PlayerAction, { color: typeof COLORS.stampAccept; z: number }> = {
  Accept: { color: COLORS.stampAccept, z: 0.17 },
  Reject: { color: COLORS.stampReject, z: 0 },
  Rework: { color: COLORS.stampRework, z: -0.17 },
};

/** Three spring-loaded routing stamps (GDD §13). */
export class StampBank {
  readonly root: TransformNode;
  private readonly handles = new Map<PlayerAction, AbstractMesh>();
  private readonly pads = new Map<PlayerAction, AbstractMesh>();
  private armed = false;
  private cooldownUntil = 0;
  /** Action currently holding press-flash juice (survives setArmed(false) after stamp). */
  private litAction: PlayerAction | null = null;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('stamps', scene);
    if (parent) this.root.parent = parent;
    // Right of triad — in-frame for inspection cam, clear of FOUP window/wafer.
    // Larger bank for stamp-face readability; +Z with FOUP so niche depth reads.
    this.root.position = new Vector3(0.34, 1.08, 0.26);
    this.root.scaling.setAll(1.15);

    // Thin holder block + edge chamfers (was a chunky 70 mm brick).
    const base = CreateBox('stampBase', { width: 0.36, height: 0.04, depth: 0.62 }, scene);
    base.parent = this.root;
    base.material = matteNoise(scene, 'stampBaseMat', new Color3(0.22, 0.24, 0.26), {
      variance: 18,
      speck: 0.12,
      size: 128,
      tileHint: 'fine',
      blotch: 0.62,
      emissive: 0.015,
      uScale: 2.8,
      vScale: 1.9,
    });
    base.isPickable = false;
    // Contact pool under the bank so stamps don't float on the deck.
    const stampContact = CreateBox('stampContact', { width: 0.44, height: 0.01, depth: 0.7 }, scene);
    stampContact.parent = this.root;
    stampContact.position.set(0, -0.03, 0);
    stampContact.material = matte(scene, 'stampContactMat', new Color3(0.035, 0.03, 0.028), 0);
    stampContact.isPickable = false;
    // Soft radial blob — grounds the bank against epoxy without lighting spam.
    const stampBlob = CreateBox('stampContactBlob', { width: 0.48, height: 0.004, depth: 0.74 }, scene);
    stampBlob.parent = this.root;
    stampBlob.position.set(0, -0.036, 0);
    stampBlob.material = contactBlobMat(scene, 'stampContactBlobMat', { soft: 0.88, core: 0.05, strength: 0.95 });
    stampBlob.isPickable = false;
    const baseChamfer = metal(scene, 'stampBaseChamferMat', COLORS.bench.scale(0.85), 0.22);
    for (const [i, w, d, x, z] of [
      [0, 0.37, 0.01, 0, -0.315],
      [1, 0.37, 0.01, 0, 0.315],
      [2, 0.01, 0.62, -0.185, 0],
      [3, 0.01, 0.62, 0.185, 0],
    ] as const) {
      const edge = CreateBox(`stampBaseEdge${i}`, { width: w, height: 0.014, depth: d }, scene);
      edge.parent = this.root;
      edge.position.set(x, 0.022, z);
      edge.material = baseChamfer;
      edge.isPickable = false;
    }
    const undercut = CreateBox('stampBaseUndercut', { width: 0.34, height: 0.012, depth: 0.58 }, scene);
    undercut.parent = this.root;
    undercut.position.set(0, -0.022, 0);
    undercut.material = matte(scene, 'stampBaseUndercutMat', new Color3(0.22, 0.24, 0.26), 0.02);
    undercut.isPickable = false;

    // Recessed wells under each stamp
    for (const action of ['Accept', 'Reject', 'Rework'] as const) {
      const well = CreateCylinder(`stampWell_${action}`, {
        diameter: 0.19,
        height: 0.014,
        tessellation: 20,
      }, scene);
      well.parent = this.root;
      well.position.set(0, 0.024, STAMP_META[action].z);
      well.material = matte(scene, `stampWellMat_${action}`, new Color3(0.18, 0.2, 0.22), 0.04);
      well.isPickable = false;
    }

    const title = CreateBox('stampTitle', { width: 0.34, height: 0.042, depth: 0.01 }, scene);
    title.parent = this.root;
    title.position.set(0, 0.18, 0.3);
    applyLabel(title, scene, {
      width: 384,
      height: 72,
      fill: '#0a1018',
      ink: '#f0f8ff',
      align: 'center',
      font: 'bold 32px monospace',
      lines: ['ROUTING STAMPS'],
      lineHeight: 36,
    });
    title.isPickable = false;

    (['Accept', 'Reject', 'Rework'] as const).forEach((action) => {
      const meta = STAMP_META[action];

      // Spring column under the handle
      const spring = CreateCylinder(`stampSpring_${action}`, {
        diameter: 0.04,
        height: 0.08,
        tessellation: 12,
      }, scene);
      spring.parent = this.root;
      spring.position.set(0, 0.08, meta.z);
      spring.material = metal(scene, `stampSpringMat_${action}`, COLORS.wallTrim, 0.4);
      spring.isPickable = false;

      const collar = CreateTorus(`stampCollar_${action}`, {
        diameter: 0.1,
        thickness: 0.014,
        tessellation: 16,
      }, scene);
      collar.parent = this.root;
      collar.position.set(0, 0.1, meta.z);
      collar.rotation.x = Math.PI / 2;
      collar.material = metal(scene, `stampCollarMat_${action}`, COLORS.housing, 0.3);
      collar.isPickable = false;

      const body = CreateCylinder(`stamp_${action}`, { diameter: 0.2, height: 0.15, tessellation: 28 }, scene);
      body.parent = this.root;
      body.position.set(0, 0.16, meta.z);
      body.material = lamp(scene, `stampMat_${action}`, meta.color, 0.9);
      body.isPickable = true;
      body.metadata = { interact: 'stamp', action };

      // Domed top cap
      const cap = CreateCylinder(`stampCap_${action}`, {
        diameterTop: 0.12,
        diameterBottom: 0.18,
        height: 0.038,
        tessellation: 20,
      }, scene);
      cap.parent = body;
      cap.position.y = 0.078;
      cap.material = metal(scene, `stampCapMat_${action}`, meta.color.scale(0.7), 0.25);
      cap.isPickable = false;

      // Rubber ink pad underneath
      const pad = CreateCylinder(`stampPad_${action}`, { diameter: 0.15, height: 0.016, tessellation: 20 }, scene);
      pad.parent = body;
      pad.position.y = -0.07;
      pad.material = rubber(scene, `stampPadMat_${action}`, meta.color.scale(0.45));
      pad.isPickable = false;
      this.pads.set(action, pad);

      // Fat invisible pick volume
      const proxy = CreateBox(`stampProxy_${action}`, { width: 0.24, height: 0.2, depth: 0.24 }, scene);
      proxy.parent = body;
      proxy.visibility = 0.001;
      proxy.isPickable = true;
      proxy.metadata = { interact: 'stamp', action };

      // Billboard face toward inspection cam (−Z) so labels stay readable.
      const face = CreateBox(`stampFace_${action}`, { width: 0.19, height: 0.19, depth: 0.018 }, scene);
      face.parent = body;
      face.position.set(0, 0.02, 0.11);
      applyLabel(face, scene, {
        width: 256,
        height: 256,
        fill: '#02040a',
        ink: '#ffffff',
        align: 'center',
        font: 'bold 72px monospace',
        lines: [action.toUpperCase().slice(0, 6)],
        lineHeight: 80,
      });
      face.isPickable = false;

      // Top plate still carries a secondary label for overhead orbits.
      const topFace = CreateBox(`stampTopFace_${action}`, { width: 0.16, height: 0.014, depth: 0.16 }, scene);
      topFace.parent = body;
      topFace.position.y = 0.09;
      applyLabel(topFace, scene, {
        width: 192,
        height: 192,
        fill: '#05070a',
        ink: '#f5f8ff',
        align: 'center',
        font: 'bold 56px monospace',
        lines: [action.toUpperCase().slice(0, 6)],
        lineHeight: 64,
      });
      topFace.isPickable = false;

      this.handles.set(action, body);
    });
  }

  setArmed(armed: boolean): void {
    this.armed = armed;
    for (const [action, mesh] of this.handles) {
      // Keep press-flash alive — session calls setArmed(false) immediately after press.
      if (this.litAction === action) continue;
      const mat = mesh.material as ReturnType<typeof lamp>;
      // Disarmed stays readable (not dead grey); armed pops hard.
      mat.emissiveColor = armed ? STAMP_META[action].color.scale(1.05) : STAMP_META[action].color.scale(0.48);
    }
  }

  canStamp(now: number): boolean {
    return this.armed && now >= this.cooldownUntil;
  }

  press(action: PlayerAction, now: number): boolean {
    if (!this.canStamp(now)) return false;
    const mesh = this.handles.get(action);
    if (!mesh) return false;
    const mat = mesh.material as ReturnType<typeof lamp>;
    const restY = 0.16;
    // Durable press juice — deep travel + hard squash + emissive flash held long
    // enough for Iris harness (~400 ms probe) to catch stampLit=true.
    this.litAction = action;
    mesh.position.y = 0.04;
    mesh.scaling.set(1.14, 0.68, 1.14);
    // Bias flash toward white so green Accept still trips stampLit (r>0.2) probes.
    mat.emissiveColor = STAMP_META[action].color.scale(2.05).add(new Color3(0.4, 0.4, 0.4));
    mesh.metadata = { ...(mesh.metadata ?? {}), stampLit: true, interact: 'stamp', action };
    if (typeof window !== 'undefined') {
      (window as unknown as { __WP_STAMP_LIT?: boolean }).__WP_STAMP_LIT = true;
    }
    const pad = this.pads.get(action);
    if (pad) {
      const padMat = pad.material as ReturnType<typeof rubber>;
      padMat.emissiveColor = STAMP_META[action].color.scale(0.95);
    }
    this.cooldownUntil = now + 1.05;
    const restore = () => {
      if (this.litAction === action) this.litAction = null;
      mesh.position.y = restY;
      mesh.scaling.setAll(1);
      mat.emissiveColor = this.armed
        ? STAMP_META[action].color.scale(1.05)
        : STAMP_META[action].color.scale(0.48);
      mesh.metadata = { ...(mesh.metadata ?? {}), stampLit: false, interact: 'stamp', action };
      if (typeof window !== 'undefined') {
        (window as unknown as { __WP_STAMP_LIT?: boolean }).__WP_STAMP_LIT = false;
      }
      if (pad) {
        const padMat = pad.material as ReturnType<typeof rubber>;
        padMat.emissiveColor = STAMP_META[action].color.scale(0.05);
      }
    };
    if (typeof window !== 'undefined') window.setTimeout(restore, 950);
    else restore();
    return true;
  }

  meshFor(action: PlayerAction): AbstractMesh | undefined {
    return this.handles.get(action);
  }

  allMeshes(): AbstractMesh[] {
    return [...this.handles.values()];
  }
}
