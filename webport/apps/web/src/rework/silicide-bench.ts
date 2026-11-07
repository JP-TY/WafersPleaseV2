import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import {
  PROCESS,
  createSilicideEtch,
  rollSilicideRecipe,
  type Recipe,
  type ReworkMinigame,
  type Rng,
  type SilicideAction,
  type SilicideEtchState,
} from '@wafers/sim';
import { COLORS, bathFill, lamp, matte, metal, quartz, silicon } from '../bootstrap/materials.js';
import { frameBench } from '../bootstrap/engine.js';
import { applyLabel } from '../bay/labels.js';
import type { ReworkBenchHandle, ReworkCloseRequest } from './types.js';
import {
  REWORK_SLOT,
  buildCabinet,
  buildHood,
  buildReadout,
  buildServiceBundle,
  chemistryTag,
  processPaddle,
  returnControl,
} from './station-return.js';

/** Selective silicide wet etch bench (GDD §8B). */
export class SilicideBench implements ReworkBenchHandle {
  readonly root: TransformNode;
  private sim: ReworkMinigame<SilicideEtchState, SilicideAction>;
  private readonly factory: () => ReworkMinigame<SilicideEtchState, SilicideAction>;
  private readonly readoutTex: DynamicTexture;
  private readonly liquid: AbstractMesh;
  private readonly transducer: AbstractMesh;
  private readonly washLamp: AbstractMesh;
  private readonly waferProxy: AbstractMesh;
  private readonly bubbles: AbstractMesh[] = [];
  private readonly rsHistory: number[] = [];
  private readonly setReturnArmed: (armed: boolean) => void;
  private closeReq: ReworkCloseRequest | null = null;
  private shownResult = false;
  private animT = 0;

  constructor(scene: Scene, rngFactory: () => Rng, recipe: Recipe) {
    this.factory = () => createSilicideEtch(rollSilicideRecipe(rngFactory(), 0, recipe));
    this.sim = this.factory();

    this.root = new TransformNode('silicideBench', scene);
    this.root.position = REWORK_SLOT.clone();
    this.root.setEnabled(false);

    buildCabinet(scene, this.root, 'sil', {
      width: 1.45,
      depth: 0.8,
      title: 'SILICIDE WET ETCH',
      subtitle: 'Selective Ti strip — C49 window',
    });
    buildHood(scene, this.root, 'sil', 1.3, 0.34);
    buildServiceBundle(scene, this.root, 'sil', {
      width: 1.45,
      depth: 0.8,
      accent: new Color3(0.45, 0.72, 0.32),
    });

    // Primary etch tank
    const tankX = -0.38;
    const wall = CreateCylinder('silQuartz', { diameter: 0.42, height: 0.32, tessellation: 32 }, scene);
    wall.parent = this.root;
    wall.position.set(tankX, 1.16, 0);
    wall.material = quartz(scene, 'silQuartzMat');
    wall.isPickable = false;

    const rim = CreateTorus('silRim', { diameter: 0.42, thickness: 0.02, tessellation: 28 }, scene);
    rim.parent = this.root;
    rim.position.set(tankX, 1.32, 0);
    rim.material = metal(scene, 'silRimMat', COLORS.wallTrim, 0.4);
    rim.isPickable = false;

    this.liquid = CreateCylinder('silLiquid', { diameter: 0.36, height: 0.16, tessellation: 28 }, scene);
    this.liquid.parent = this.root;
    this.liquid.position.set(tankX, 1.08, 0);
    this.liquid.material = bathFill(scene, 'silLiquid', new Color3(0.45, 0.72, 0.32));
    this.liquid.isPickable = false;

    chemistryTag(scene, this.root, 'silChem', tankX, 0.98, -0.22, [
      'ETCHANT',
      PROCESS.silicide.etchant,
    ]);

    // DI rinse companion tank (density parity with RCA QDR)
    const rinse = CreateCylinder('silRinse', { diameter: 0.28, height: 0.26, tessellation: 24 }, scene);
    rinse.parent = this.root;
    rinse.position.set(0.08, 1.14, 0.02);
    rinse.material = quartz(scene, 'silRinseMat', new Color3(0.7, 0.85, 0.92));
    rinse.isPickable = false;
    const rinseFill = CreateCylinder('silRinseFill', { diameter: 0.24, height: 0.14, tessellation: 20 }, scene);
    rinseFill.parent = this.root;
    rinseFill.position.set(0.08, 1.08, 0.02);
    rinseFill.material = bathFill(scene, 'silRinseFill', new Color3(0.55, 0.78, 0.9));
    rinseFill.isPickable = false;
    chemistryTag(scene, this.root, 'silRinseTag', 0.08, 0.98, -0.2, ['DI RINSE', 'post-strip']);

    // Feed pipes into etch tank
    for (const [i, ox] of [-0.08, 0.08].entries()) {
      const feed = CreateCylinder(`silFeed${i}`, { diameter: 0.018, height: 0.22, tessellation: 8 }, scene);
      feed.parent = this.root;
      feed.position.set(tankX + ox, 1.38, 0.12);
      feed.material = metal(scene, `silFeedMat${i}`, new Color3(0.7, 0.55, 0.3), 0.5);
      feed.isPickable = false;
    }

    // Ultrasonic transducer under the tank
    this.transducer = CreateCylinder('silXducer', { diameter: 0.28, height: 0.04, tessellation: 20 }, scene);
    this.transducer.parent = this.root;
    this.transducer.position.set(tankX, 0.99, 0);
    this.transducer.material = metal(scene, 'silXducerMat', new Color3(0.35, 0.4, 0.48), 0.35);
    this.transducer.isPickable = false;

    this.washLamp = CreateBox('silWashLamp', { width: 0.05, height: 0.05, depth: 0.05 }, scene);
    this.washLamp.parent = this.root;
    this.washLamp.position.set(tankX, 1.42, 0.18);
    this.washLamp.material = lamp(scene, 'silWashLampMat', COLORS.bench, 0.1);
    this.washLamp.isPickable = false;

    for (let i = 0; i < 10; i++) {
      const b = CreateCylinder(`silBubble${i}`, { diameter: 0.018, height: 0.018, tessellation: 8 }, scene);
      b.parent = this.root;
      b.position.set(tankX - 0.1 + (i % 5) * 0.05, 1.05, -0.08 + Math.floor(i / 5) * 0.1);
      const bm = matte(scene, `silBubbleMat${i}`, new Color3(0.85, 0.95, 0.8), 0.4);
      bm.alpha = 0.5;
      b.material = bm;
      b.isPickable = false;
      b.setEnabled(false);
      this.bubbles.push(b);
    }

    this.waferProxy = CreateCylinder('silWafer', { diameter: 0.2, height: 0.004, tessellation: 36 }, scene);
    this.waferProxy.parent = this.root;
    this.waferProxy.position.set(tankX, 1.24, 0);
    this.waferProxy.material = silicon(scene, 'silWaferMat', COLORS.waferLit);
    this.waferProxy.isPickable = false;

    // N2 gun + wand holder
    const wandBase = CreateBox('silWandBase', { width: 0.08, height: 0.06, depth: 0.08 }, scene);
    wandBase.parent = this.root;
    wandBase.position.set(-0.62, 1.02, 0.12);
    wandBase.material = metal(scene, 'silWandBaseMat', COLORS.housing, 0.3);
    wandBase.isPickable = false;
    const wand = CreateCylinder('silN2Wand', { diameter: 0.022, height: 0.28, tessellation: 8 }, scene);
    wand.parent = this.root;
    wand.position.set(-0.62, 1.18, 0.12);
    wand.rotation.z = 0.35;
    wand.material = metal(scene, 'silN2Mat', new Color3(0.55, 0.6, 0.68), 0.55);
    wand.isPickable = false;

    // Side rack — four-point Rs probe housing + meter bezel
    const probe = CreateBox('silProbeHouse', { width: 0.2, height: 0.26, depth: 0.16 }, scene);
    probe.parent = this.root;
    probe.position.set(0.48, 1.16, 0.05);
    probe.material = metal(scene, 'silProbeMat', COLORS.housing, 0.28);
    probe.isPickable = false;
    const meter = CreateBox('silRsMeter', { width: 0.16, height: 0.08, depth: 0.02 }, scene);
    meter.parent = this.root;
    meter.position.set(0.48, 1.28, -0.04);
    applyLabel(meter, scene, {
      width: 192,
      height: 96,
      fill: '#0a1410',
      ink: '#8fe0c0',
      align: 'center',
      font: 'bold 22px monospace',
      lines: ['Rs METER', '4-POINT'],
      lineHeight: 32,
    });
    meter.isPickable = false;
    for (const [i, oz] of [-0.04, 0.04].entries()) {
      for (const [j, ox] of [-0.04, 0.04].entries()) {
        const tip = CreateCylinder(`silProbeTip${i}${j}`, { diameter: 0.012, height: 0.14, tessellation: 6 }, scene);
        tip.parent = this.root;
        tip.position.set(0.32 + ox, 1.18, oz);
        tip.rotation.z = Math.PI / 2;
        tip.material = metal(scene, `silTipMat${i}${j}`, new Color3(0.6, 0.65, 0.7), 0.5);
        tip.isPickable = false;
      }
    }

    // Spill tray under tanks
    const tray = CreateBox('silSpillTray', { width: 0.95, height: 0.025, depth: 0.42 }, scene);
    tray.parent = this.root;
    tray.position.set(-0.15, 0.99, 0);
    tray.material = metal(scene, 'silTrayMat', new Color3(0.35, 0.42, 0.4), 0.25);
    tray.isPickable = false;

    const { tex } = buildReadout(scene, this.root, 'sil', {
      width: 0.52,
      height: 0.28,
      x: 0.32,
      y: 1.48,
      z: 0.3,
      texW: 640,
      texH: 320,
      glow: new Color3(0.04, 0.1, 0.08),
      lines: ['SILICIDE ETCH', 'Wash in C49 window'],
      tilt: 0.46,
    });
    this.readoutTex = tex;

    const railY = 1.02;
    const railZ = -0.16;
    processPaddle(scene, this.root, {
      name: 'silWashOn',
      label: 'WASH ON',
      x: -0.4,
      y: railY,
      z: railZ,
      interact: 'silStartWash',
    });
    processPaddle(scene, this.root, {
      name: 'silWashOff',
      label: 'WASH OFF',
      x: -0.15,
      y: railY,
      z: railZ,
      interact: 'silStopWash',
      accent: COLORS.warn,
      fill: '#302010',
      ink: '#ffe8c0',
    });
    processPaddle(scene, this.root, {
      name: 'silCommit',
      label: 'COMMIT',
      x: 0.15,
      y: railY,
      z: railZ,
      interact: 'silCommit',
    });
    const ret = returnControl(scene, this.root, {
      name: 'silReturn',
      interact: 'silReturn',
      x: 0.42,
      y: railY,
      z: railZ,
    });
    this.setReturnArmed = ret.setArmed;
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
    if (!visible) this.closeReq = null;
  }

  prepareFresh(): void {
    this.sim = this.factory();
    this.closeReq = null;
    this.shownResult = false;
    this.rsHistory.length = 0;
    this.animT = 0;
    this.setReturnArmed(false);
  }

  frameCamera(camera: ArcRotateCamera): void {
    frameBench(camera, this.root.getAbsolutePosition().add(new Vector3(0.08, 1.1, 0.02)), 2.35);
  }

  getCloseRequest(): ReworkCloseRequest | null {
    return this.closeReq;
  }

  handlePick(mesh: AbstractMesh): void {
    if (!this.root.isEnabled()) return;
    const kind = mesh.metadata?.interact as string | undefined;
    if (!kind?.startsWith('sil')) return;
    if (kind === 'silReturn' && this.sim.state.finished) {
      this.closeReq = { success: !!this.sim.state.result?.success, immediate: true };
      return;
    }
    if (this.sim.state.finished) return;
    try {
      if (kind === 'silStartWash') this.sim.act({ type: 'startWash' });
      else if (kind === 'silStopWash') this.sim.act({ type: 'stopWash' });
      else if (kind === 'silCommit') this.sim.act({ type: 'commit' });
    } catch {
      /* illegal */
    }
  }

  update(dt: number): void {
    if (!this.root.isEnabled()) return;
    this.sim.tick(dt);
    this.animT += dt;
    const s = this.sim.state;
    const r = s.reading;
    this.rsHistory.push(r.sheetResistanceMicroOhmCm);
    if (this.rsHistory.length > 64) this.rsHistory.shift();

    const fill = 0.14 + Math.min(0.1, s.washSeconds * 0.02);
    this.liquid.scaling.y = fill / 0.16;
    this.liquid.position.y = 1.0 + fill / 2;
    const mat = this.liquid.material as ReturnType<typeof bathFill>;
    mat.emissiveColor = (s.washing ? new Color3(0.45, 0.75, 0.3) : new Color3(0.2, 0.35, 0.15)).scale(
      s.washing ? 0.55 : 0.12,
    );
    this.waferProxy.position.y = s.washing ? 1.08 : 1.24;

    const xMat = this.transducer.material as ReturnType<typeof metal>;
    xMat.emissiveColor = (s.washing ? COLORS.accent : COLORS.bench).scale(s.washing ? 0.35 : 0.04);
    const wLamp = this.washLamp.material as ReturnType<typeof lamp>;
    wLamp.emissiveColor = (s.washing ? COLORS.accent : COLORS.bench).scale(s.washing ? 0.95 : 0.1);

    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i]!;
      b.setEnabled(s.washing);
      if (s.washing) {
        b.position.y = 1.05 + ((this.animT * 0.45 + i * 0.15) % 0.22);
        b.visibility = 0.35 + 0.45 * Math.sin(this.animT * 9 + i);
      }
    }

    this.paintScope(s, r);

    if (s.finished) {
      this.setReturnArmed(true);
      if (s.result && !this.shownResult) {
        this.shownResult = true;
        this.closeReq = { success: s.result.success };
      }
    }
  }

  private paintScope(s: SilicideEtchState, r: SilicideEtchState['reading']): void {
    const ctx = this.readoutTex.getContext() as CanvasRenderingContext2D;
    const W = 640;
    const H = 320;
    const ink = r.strippable ? '#9fe0c8' : '#f0a060';

    ctx.fillStyle = '#050a10';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1a4038';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.fillStyle = ink;
    ctx.font = 'bold 20px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('SILICIDE — Rs TRACE', 20, 14);
    ctx.fillStyle = '#7aa0b0';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(PROCESS.silicide.etchant, 20, 40);

    // Plot frame
    const plotL = 24;
    const plotT = 60;
    const plotW = 400;
    const plotH = 120;
    ctx.strokeStyle = '#1a3040';
    ctx.strokeRect(plotL, plotT, plotW, plotH);
    // C49 / C54 guide lines
    const c49Y = plotT + plotH * (1 - (PROCESS.silicide.resistivityC49MicroOhmCm - 12) / 80);
    const c54Y = plotT + plotH * (1 - (PROCESS.silicide.resistivityC54MicroOhmCm - 12) / 80);
    ctx.strokeStyle = '#3a5060';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotL, c49Y);
    ctx.lineTo(plotL + plotW, c49Y);
    ctx.moveTo(plotL, c54Y);
    ctx.lineTo(plotL + plotW, c54Y);
    ctx.stroke();
    ctx.fillStyle = '#5a7080';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('C49', plotL + plotW - 36, c49Y - 12);
    ctx.fillText('C54', plotL + plotW - 36, c54Y - 12);

    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const hist = this.rsHistory;
    for (let i = 0; i < hist.length; i++) {
      const x = plotL + (i / Math.max(1, hist.length - 1)) * plotW;
      const norm = Math.min(1, Math.max(0, (hist[i]! - 12) / 80));
      const y = plotT + (1 - norm) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Wash window gauge
    const w0 = 460;
    ctx.fillStyle = '#1a403088';
    ctx.fillRect(w0, plotT, 48, plotH);
    ctx.fillStyle = '#2a5040';
    ctx.fillRect(w0 + 6, plotT + 8, 36, plotH - 16);
    ctx.fillStyle = s.washing ? '#9fe0c8' : '#4a6070';
    const washH = Math.min(plotH - 16, (s.washSeconds / Math.max(s.washMaxSeconds, 0.01)) * (plotH - 16));
    ctx.fillRect(w0 + 10, plotT + plotH - 8 - washH, 28, washH);
    // Window band markers
    const minY = plotT + plotH - 8 - (s.washMinSeconds / Math.max(s.washMaxSeconds, 0.01)) * (plotH - 16);
    const maxY = plotT + 8;
    ctx.strokeStyle = '#c08a1e';
    ctx.beginPath();
    ctx.moveTo(w0 + 4, minY);
    ctx.lineTo(w0 + 44, minY);
    ctx.moveTo(w0 + 4, maxY);
    ctx.lineTo(w0 + 44, maxY);
    ctx.stroke();
    ctx.fillStyle = '#9fb0c0';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('WASH', w0 + 6, plotT + plotH + 4);

    ctx.fillStyle = ink;
    ctx.font = 'bold 15px monospace';
    ctx.fillText(`Rs ${r.sheetResistanceMicroOhmCm.toFixed(1)} µΩ·cm   ${r.phase}`, 24, 200);
    ctx.fillText(
      `Wash ${s.washSeconds.toFixed(1)}s  [${s.washMinSeconds.toFixed(1)}–${s.washMaxSeconds.toFixed(1)}]  ${s.washing ? 'ON' : 'OFF'}`,
      24,
      224,
    );
    ctx.fillText(r.strippable ? 'STRIPPABLE — WASH NOW' : 'LOCKED — C54 (too late)', 24, 248);
    if (s.finished && s.result) {
      ctx.fillText(s.result.success ? 'PASS — PRESS RETURN' : 'FAIL — PRESS RETURN', 24, 276);
    }
    this.readoutTex.update();
  }
}
