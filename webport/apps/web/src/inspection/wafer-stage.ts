/**
 * The wafer mount stage (GDD §13 "Inspection Workspace", §4 controls).
 *
 * A 300 mm wafer on a mechanical mount, flanked by cross-illumination, which the
 * player tilts and rotates with a left-click drag. Everything here is a physical
 * object in the room — GDD §13 is explicit that there are "no traditional
 * floating HUD elements or video game menu bars", so the wafer is not an overlay
 * and it is not a cursor sprite.
 *
 * Surface appearance is the FIRST diagnostic channel and it is deliberately
 * limited: a bowed wafer shows its bow under raking light, a contaminated wafer
 * shows its film, but an STI void, an interface trap and a tungsten plug void are
 * all invisible from outside. That is the GDD §7 table made physical, and it is
 * why the metrology cluster exists. `setRevealed` is driven only by what the
 * instruments have actually resolved, so the wafer never leaks ground truth.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { SpotLight } from '@babylonjs/core/Lights/spotLight.js';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import { matte, emissive } from '../scene.js';
import { BENCH_Y, LAYOUT } from './bay.js';

export { BENCH_Y };
import type { ResolvedDefect } from '@wafers/sim';

/** 300 mm wafer: 150 mm radius, 775 um thick. Metres, 1 unit = 1 m. */
export const WAFER_RADIUS = 0.15;

const WAFER_THICKNESS = 0.000775;
const FLAT_DEPTH = 0.0325;

/** Die pitch on a 45 nm product is ~0.5 um; visually a 4 mm grid reads right. */
const DIE_GRID = 34;

/** How the eye can tell one failure mode from another on a lit surface. */
const VISUAL_CUE: Readonly<Record<string, { color: string; kind: 'ring' | 'stain' | 'streak' }>> = {
  BowingWarping: { color: '#7fd8ff', kind: 'ring' },
  SubstrateContamination: { color: '#b9e36a', kind: 'stain' },
  STIVoid: { color: '#c07fe8', kind: 'stain' },
  InterfaceRoughness: { color: '#e8b552', kind: 'streak' },
  SilicideBridging: { color: '#ff9d4d', kind: 'streak' },
  TungstenPlugVoid: { color: '#e8574a', kind: 'ring' },
};

export class WaferStage {
  private readonly root: TransformNode;
  private readonly wafer: AbstractMesh;
  private readonly tiltPivot: TransformNode;
  private readonly markers: TransformNode;
  private readonly crossLightL: SpotLight;
  private readonly crossLightR: SpotLight;
  private readonly surfaceTex: DynamicTexture;

  /** Tilt/rotate state, in radians, driven by drag. */
  private yaw = 0;
  private pitch = 0;

  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  private resolved: readonly ResolvedDefect[] = [];
  private active = false;

  constructor(private readonly scene: Scene) {
    this.root = new TransformNode('wafer-stage', scene);
    this.root.position = LAYOUT.wafer.clone();

    // Tilt pivot sits at the mount's rotation axis so a drag tips the wafer
    // about its own centre rather than swinging it across the bench.
    this.tiltPivot = new TransformNode('wafer-tilt', scene);
    this.tiltPivot.parent = this.root;
    this.tiltPivot.position = new Vector3(0, BENCH_Y + 0.05, 0);

    // --- wafer body -------------------------------------------------------
    this.surfaceTex = new DynamicTexture('wafer-surface', { width: 1024, height: 1024 }, scene, true);
    this.paintDies();

    this.wafer = CreateCylinder(
      'wafer',
      { diameter: WAFER_RADIUS * 2, height: WAFER_THICKNESS, tessellation: 96 },
      scene,
    );
    this.wafer.parent = this.tiltPivot;

    // Silicon is a mirror. High specular + the die texture as a subtle emissive
    // is what stops it reading as a grey plastic puck under the room lights.
    const silicon = new StandardMaterial('wafer-silicon', scene);
    silicon.diffuseColor = new Color3(0.16, 0.17, 0.21);
    silicon.specularColor = new Color3(0.95, 0.96, 1);
    silicon.specularPower = 96;
    silicon.emissiveTexture = this.surfaceTex;
    silicon.emissiveColor = new Color3(0.2, 0.22, 0.27);
    this.wafer.material = silicon;

    // Orientation flat. Real wafers are keyed by it, and it is the only way to
    // tell which way round the die grid runs.
    const flat = CreateBox('wafer-flat', { width: FLAT_DEPTH, height: WAFER_THICKNESS * 1.4, depth: 0.001 }, scene);
    flat.parent = this.tiltPivot;
    flat.position = new Vector3(0, WAFER_THICKNESS * 0.5, -(WAFER_RADIUS - FLAT_DEPTH / 2));
    flat.material = matte(scene, 'wafer-flat-mat', new Color3(0.06, 0.07, 0.09), 0.5);

    // --- mount stage ------------------------------------------------------
    const chuck = CreateCylinder('wafer-chuck', { diameter: 0.24, height: 0.028, tessellation: 64 }, scene);
    chuck.parent = this.root;
    chuck.position = new Vector3(0, BENCH_Y + 0.014, 0);
    chuck.material = matte(scene, 'wafer-chuck-mat', new Color3(0.2, 0.21, 0.24), 0.22);

    // Column down to the bench, with a foot flange so it looks bolted on.
    const post = CreateCylinder('wafer-post', { diameter: 0.06, height: 0.16, tessellation: 24 }, scene);
    post.parent = this.root;
    post.position = new Vector3(0, BENCH_Y - 0.07, 0);
    post.material = matte(scene, 'wafer-post-mat', new Color3(0.15, 0.16, 0.18), 0.18);

    const base = CreateCylinder('wafer-base', { diameter: 0.18, height: 0.016, tessellation: 48 }, scene);
    base.parent = this.root;
    base.position = new Vector3(0, BENCH_Y - 0.142, 0);
    base.material = matte(scene, 'wafer-base-mat', new Color3(0.13, 0.14, 0.16), 0.14);

    // Vacuum chuck grooves: concentric rings, purely to sell that it is
    // hardware and to give the eye something to read tilt against.
    for (let i = 0; i < 3; i++) {
      const ring = CreateTorus(
        `chuck-ring-${i}`,
        { diameter: 0.15 + i * 0.035, thickness: 0.004, tessellation: 48 },
        scene,
      );
      ring.parent = this.root;
      ring.position = new Vector3(0, BENCH_Y + 0.03, 0);
      ring.material = matte(scene, `chuck-ring-mat-${i}`, new Color3(0.3, 0.31, 0.34), 0.4);
    }

    // --- cross-illumination (GDD §13) -------------------------------------
    // Two low-angle lights on opposite sides. Raking light is what makes a bow
    // or a warp visible as a gradient across the surface at all; overhead light
    // alone hides it completely, which would make the geometry mechanic a lie.
    const crossLight = (name: string, x: number, z: number): SpotLight => {
      const light = new SpotLight(name, new Vector3(x, BENCH_Y + 0.3, z), new Vector3(-x, -0.3, -z).normalize(), 1.9, 8, scene);
      light.intensity = 14;
      light.diffuse = new Color3(0.85, 0.9, 1);
      return light;
    };
    this.crossLightL = crossLight('cross-l', -0.62, 0.3);
    this.crossLightR = crossLight('cross-r', 0.62, -0.26);

    this.markers = new TransformNode('wafer-markers', scene);
    this.markers.parent = this.tiltPivot;

    this.wirePointer();
  }

  /** Paint the die pattern into the surface texture. Static, drawn once. */
  private paintDies(): void {
    const size = this.surfaceTex.getSize().width;
    const ctx = this.surfaceTex.getContext() as CanvasRenderingContext2D;
    const c = size / 2;
    const r = size * 0.485;

    ctx.clearRect(0, 0, size, size);

    // Wafer body disc.
    const g = ctx.createRadialGradient(c, c, 0, c, c, r);
    g.addColorStop(0, '#3a4152');
    g.addColorStop(0.72, '#2b3140');
    g.addColorStop(1, '#1b2029');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.fill();

    // Orientation flat.
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(c - (FLAT_DEPTH / (WAFER_RADIUS * 2)) * size * 2 * 0.5, size - r * 0.06, (FLAT_DEPTH / (WAFER_RADIUS * 2)) * size, r * 0.06);

    // Die grid, clipped to the disc. Each die gets a scribe-line gap, so the
    // grid reads as separate reticles rather than a wireframe overlay.
    const step = (size * 0.94) / DIE_GRID;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = 'rgba(150,175,210,0.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= DIE_GRID; i++) {
      const p = c - (size * 0.47) + i * step;
      ctx.beginPath();
      ctx.moveTo(p, c - r);
      ctx.lineTo(p, c + r);
      ctx.moveTo(c - r, p);
      ctx.lineTo(c + r, p);
      ctx.stroke();
    }
    // Reticle name bands along two edges, the way a real die map is annotated.
    ctx.fillStyle = 'rgba(120,150,190,0.16)';
    for (let i = 0; i < DIE_GRID; i += 2) {
      const p = c - (size * 0.47) + i * step;
      ctx.fillRect(p + 1, c - r, step * 0.8, 10);
    }
    ctx.restore();

    // Edge exclusion ring.
    ctx.strokeStyle = 'rgba(90,110,140,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c, c, r * 0.985, 0, Math.PI * 2);
    ctx.stroke();

    this.surfaceTex.update();
  }

  /**
   * Show only the defects metrology has actually resolved.
   *
   * Called after every measurement. Passing ground truth here would make the
   * wafer stage an oracle and delete the entire diagnostic loop.
   */
  setRevealed(defects: readonly ResolvedDefect[]): void {
    this.resolved = defects;
    this.rebuildMarkers();
  }

  /** Clear the wafer for the next lot. */
  clear(): void {
    this.setRevealed([]);
  }

  private rebuildMarkers(): void {
    // Dispose the previous generation. Markers are rebuilt on every measurement,
    // so leaking them would accumulate quads across a whole shift.
    for (const child of this.markers.getChildren()) {
      if (child instanceof AbstractMesh) {
        child.dispose(false, false);
      } else {
        child.dispose();
      }
    }

    const spec = TOOL_VISUAL_SIZE;
    for (const d of this.resolved) {
      const cue = VISUAL_CUE[d.defectType];
      if (!cue) continue;

      // Defect region is in wafer-UV space; map it onto the top face.
      const x = (d.regionX - 0.5) * WAFER_RADIUS * 1.94;
      const z = (d.regionY - 0.5) * WAFER_RADIUS * 1.94;
      // Scale the marker by severity: a marginal finding is a dot, a bad one
      // is unmistakable. Hiding severity would flatten the risk signal.
      const scale = spec.min + (spec.max - spec.min) * d.severity;

      if (cue.kind === 'stain') {
        const disc = CreateDisc(`marker-${d.defectType}`, { radius: 0.018 * scale, tessellation: 28 }, this.scene);
        disc.parent = this.markers;
        disc.rotation.x = Math.PI / 2;
        disc.position = new Vector3(x, WAFER_THICKNESS * 0.6, z);
        disc.material = emissive(this.scene, `marker-mat-${d.defectType}`, Color3.FromHexString(cue.color));
      } else if (cue.kind === 'ring') {
        const ring = CreateTorus(
          `marker-${d.defectType}`,
          { diameter: 0.03 * scale, thickness: 0.0035, tessellation: 32 },
          this.scene,
        );
        ring.parent = this.markers;
        ring.position = new Vector3(x, WAFER_THICKNESS * 0.7, z);
        ring.material = emissive(this.scene, `marker-mat-${d.defectType}`, Color3.FromHexString(cue.color));
      } else {
        // A stringer is a filament, not a dot: two parallel strokes along the
        // wafer's major axis, which is what bridging metal actually looks like.
        for (const off of [-1, 1]) {
          const bar = CreateBox(
            `marker-${d.defectType}-${off}`,
            { width: 0.006 * scale, height: 0.0016, depth: 0.042 * scale },
            this.scene,
          );
          bar.parent = this.markers;
          bar.position = new Vector3(x + off * 0.008 * scale, WAFER_THICKNESS * 0.6, z);
          bar.material = emissive(this.scene, `marker-mat-${d.defectType}`, Color3.FromHexString(cue.color));
        }
      }
    }
  }

  /** GDD §4: left-click and drag tilts and rotates under cross-lighting. */
  private wirePointer(): void {
    this.scene.onPointerObservable.add((info) => {
      if (info.type === PointerEventTypes.POINTERDOWN) {
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === this.wafer);
        if (pick?.hit) {
          this.dragging = true;
          this.lastX = this.scene.pointerX;
          this.lastY = this.scene.pointerY;
        }
      } else if (info.type === PointerEventTypes.POINTERMOVE) {
        if (!this.dragging) return;
        const dx = this.scene.pointerX - this.lastX;
        const dy = this.scene.pointerY - this.lastY;
        this.lastX = this.scene.pointerX;
        this.lastY = this.scene.pointerY;
        // 0.006 rad/px: a full sweep across a 1080p viewport is about 6.5 rad,
        // so a single gesture covers slightly more than one turn.
        this.yaw += dx * 0.006;
        this.pitch = clampAngle(this.pitch + dy * 0.006);
      } else if (info.type === PointerEventTypes.POINTERUP) {
        this.dragging = false;
      }
    });
  }

  /**
   * Nudge the cross-lighting angle.
   *
   * The GDD calls for "cross-illumination dial systems" as part of the workspace,
   * so this is a first-class control and not decoration: at a shallow angle a
   * bow throws a visible gradient, at a steep angle it vanishes.
   */
  setCrossAngle(radians: number): void {
    const a = clampAngle(radians);
    const d = 0.66;
    const y = BENCH_Y + 0.3;
    this.crossLightL.position = new Vector3(-Math.cos(a) * d, y, Math.sin(a) * d);
    this.crossLightR.position = new Vector3(Math.cos(a) * d, y, -Math.sin(a) * d);
    this.crossLightL.direction = new Vector3(Math.cos(a) * d, -0.3, -Math.sin(a) * d).normalize();
    this.crossLightR.direction = new Vector3(-Math.cos(a) * d, -0.3, Math.sin(a) * d).normalize();
  }

  update(dt: number): void {
    if (!this.active) return;
    // Ease toward the target so a drag feels like tilting hardware rather than
    // teleporting a mesh.
    this.tiltPivot.rotation.y += (this.yaw - this.tiltPivot.rotation.y) * Math.min(1, dt * 14);
    this.tiltPivot.rotation.x += (this.pitch - this.tiltPivot.rotation.x) * Math.min(1, dt * 14);
  }

  setVisible(visible: boolean): void {
    this.active = visible;
    this.root.setEnabled(visible);
  }
}

const TOOL_VISUAL_SIZE = { min: 0.55, max: 1.6 } as const;

function clampAngle(a: number): number {
  const lim = Math.PI / 2 - 0.05;
  return Math.max(-lim, Math.min(lim, a));
}