import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import {
  CMP_GAIN_RANGE,
  CMP_REFERENCE_WAVELENGTH,
  CMP_WAVELENGTH_RANGE,
  PROCESS,
  createCmpEndpoint,
  reflectanceAt,
  sample,
  trueRemainingAt,
  type CmpAction,
  type CmpState,
  type Recipe,
  type ReworkMinigame,
  type Rng,
} from '@wafers/sim';
import { COLORS, lamp, metal, rubber, silicon, slurry } from '../bootstrap/materials.js';
import { frameBench } from '../bootstrap/engine.js';
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

/** CMP laser endpoint calibration bench (GDD §8C). */
export class CmpBench implements ReworkBenchHandle {
  readonly root: TransformNode;
  private sim: ReworkMinigame<CmpState, CmpAction>;
  private readonly factory: () => ReworkMinigame<CmpState, CmpAction>;
  private readonly scopeTex: DynamicTexture;
  private readonly pad: AbstractMesh;
  private readonly slurryRing: AbstractMesh;
  private readonly laserHead: AbstractMesh;
  private readonly lockLamp: AbstractMesh;
  private readonly setReturnArmed: (armed: boolean) => void;
  private closeReq: ReworkCloseRequest | null = null;
  private shownResult = false;

  constructor(scene: Scene, rngFactory: () => Rng, recipe: Recipe) {
    this.factory = () => createCmpEndpoint(rngFactory(), 0, recipe);
    this.sim = this.factory();

    this.root = new TransformNode('cmpBench', scene);
    this.root.position = REWORK_SLOT.clone();
    this.root.setEnabled(false);

    buildCabinet(scene, this.root, 'cmp', {
      width: 1.55,
      depth: 0.85,
      title: 'CMP ENDPOINT SCOPE',
      subtitle: `${PROCESS.cmp.layerPolished} → ${PROCESS.cmp.stopLayer}`,
    });
    buildHood(scene, this.root, 'cmp', 1.35, 0.34);
    buildServiceBundle(scene, this.root, 'cmp', {
      width: 1.55,
      depth: 0.85,
      accent: new Color3(0.55, 0.72, 0.85),
    });

    const platenX = -0.4;

    // Platen pedestal + textured pad
    const pedestal = CreateCylinder('cmpPedestal', { diameter: 0.56, height: 0.08, tessellation: 36 }, scene);
    pedestal.parent = this.root;
    pedestal.position.set(platenX, 1.0, 0.02);
    pedestal.material = metal(scene, 'cmpPedestalMat', COLORS.housing, 0.32);
    pedestal.isPickable = false;

    this.pad = CreateCylinder('cmpPad', { diameter: 0.5, height: 0.035, tessellation: 40 }, scene);
    this.pad.parent = this.root;
    this.pad.position.set(platenX, 1.06, 0.02);
    this.pad.material = padMaterial(scene);
    this.pad.isPickable = false;

    this.slurryRing = CreateTorus('cmpSlurry', { diameter: 0.48, thickness: 0.028, tessellation: 32 }, scene);
    this.slurryRing.parent = this.root;
    this.slurryRing.position.set(platenX, 1.085, 0.02);
    this.slurryRing.material = slurry(scene, 'cmpSlurryMat');
    this.slurryRing.isPickable = false;

    // Slurry puddle on pad
    const puddle = CreateCylinder('cmpPuddle', { diameter: 0.3, height: 0.006, tessellation: 28 }, scene);
    puddle.parent = this.root;
    puddle.position.set(platenX, 1.082, 0.02);
    puddle.material = slurry(scene, 'cmpPuddleMat', new Color3(0.7, 0.82, 0.9));
    puddle.isPickable = false;

    const wafer = CreateCylinder('cmpWafer', { diameter: 0.24, height: 0.004, tessellation: 36 }, scene);
    wafer.parent = this.root;
    wafer.position.set(platenX, 1.095, 0.02);
    wafer.material = silicon(scene, 'cmpWaferMat', COLORS.waferLit);
    wafer.isPickable = false;

    // Carrier / polishing head + gimbal
    const carrier = CreateCylinder('cmpCarrier', {
      diameterTop: 0.16,
      diameterBottom: 0.22,
      height: 0.1,
      tessellation: 24,
    }, scene);
    carrier.parent = this.root;
    carrier.position.set(platenX, 1.22, 0.02);
    carrier.material = metal(scene, 'cmpCarrierMat', COLORS.housing, 0.3);
    carrier.isPickable = false;
    const gimbal = CreateTorus('cmpGimbal', { diameter: 0.26, thickness: 0.02, tessellation: 24 }, scene);
    gimbal.parent = this.root;
    gimbal.position.set(platenX, 1.18, 0.02);
    gimbal.material = metal(scene, 'cmpGimbalMat', COLORS.wallTrim, 0.45);
    gimbal.isPickable = false;

    const arm = CreateBox('cmpArm', { width: 0.55, height: 0.035, depth: 0.05 }, scene);
    arm.parent = this.root;
    arm.position.set(-0.08, 1.32, 0.02);
    arm.material = metal(scene, 'cmpArmMat', COLORS.wallTrim, 0.4);
    arm.isPickable = false;

    const pillar = CreateCylinder('cmpArmPillar', { diameter: 0.06, height: 0.4, tessellation: 12 }, scene);
    pillar.parent = this.root;
    pillar.position.set(0.22, 1.2, 0.02);
    pillar.material = metal(scene, 'cmpPillarMat', COLORS.housing, 0.35);
    pillar.isPickable = false;

    // Conditioner disk (density detail)
    const conditioner = CreateCylinder('cmpConditioner', { diameter: 0.14, height: 0.03, tessellation: 20 }, scene);
    conditioner.parent = this.root;
    conditioner.position.set(-0.12, 1.08, 0.22);
    conditioner.material = metal(scene, 'cmpCondMat', new Color3(0.55, 0.5, 0.45), 0.4);
    conditioner.isPickable = false;

    // Laser endpoint head on a stand
    const laserStand = CreateBox('cmpLaserStand', { width: 0.08, height: 0.22, depth: 0.08 }, scene);
    laserStand.parent = this.root;
    laserStand.position.set(platenX - 0.02, 1.2, -0.22);
    laserStand.material = metal(scene, 'cmpLaserStandMat', COLORS.housing, 0.3);
    laserStand.isPickable = false;
    this.laserHead = CreateCylinder('cmpLaser', { diameter: 0.06, height: 0.1, tessellation: 16 }, scene);
    this.laserHead.parent = this.root;
    this.laserHead.position.set(platenX, 1.38, -0.14);
    this.laserHead.rotation.x = 0.55;
    this.laserHead.material = lamp(scene, 'cmpLaserMat', new Color3(0.9, 0.25, 0.2), 0.55);
    this.laserHead.isPickable = false;

    // Slurry pump + delivery line
    const pump = CreateBox('cmpPump', { width: 0.16, height: 0.14, depth: 0.14 }, scene);
    pump.parent = this.root;
    pump.position.set(0.42, 1.08, 0.18);
    pump.material = metal(scene, 'cmpPumpMat', new Color3(0.28, 0.4, 0.48), 0.35);
    pump.isPickable = false;
    const hose = CreateCylinder('cmpHose', { diameter: 0.02, height: 0.35, tessellation: 8 }, scene);
    hose.parent = this.root;
    hose.position.set(0.12, 1.12, 0.18);
    hose.rotation.z = Math.PI / 2;
    hose.material = rubber(scene, 'cmpHoseMat', new Color3(0.12, 0.28, 0.36));
    hose.isPickable = false;

    chemistryTag(scene, this.root, 'cmpChem', platenX, 0.96, -0.28, [
      'STI CMP',
      `${PROCESS.cmp.layerPolished} / ${PROCESS.cmp.stopLayer}`,
    ]);

    this.lockLamp = CreateBox('cmpLockLamp', { width: 0.05, height: 0.05, depth: 0.05 }, scene);
    this.lockLamp.parent = this.root;
    this.lockLamp.position.set(0.55, 1.42, 0.1);
    this.lockLamp.material = lamp(scene, 'cmpLockLampMat', COLORS.bench, 0.1);
    this.lockLamp.isPickable = false;

    const { tex } = buildReadout(scene, this.root, 'cmp', {
      width: 0.68,
      height: 0.36,
      x: 0.32,
      y: 1.48,
      z: 0.32,
      texW: 720,
      texH: 400,
      glow: new Color3(0.03, 0.08, 0.12),
      lines: ['CMP LASER ENDPOINT'],
      tilt: 0.44,
    });
    this.scopeTex = tex;

    const railY = 1.02;
    const railZ = -0.16;
    processPaddle(scene, this.root, {
      name: 'cmpGainUp',
      label: 'GAIN+',
      x: -0.55,
      y: railY,
      z: railZ,
      interact: 'cmpGainUp',
      accent: COLORS.warn,
      fill: '#302010',
      ink: '#ffe8c0',
      width: 0.13,
    });
    processPaddle(scene, this.root, {
      name: 'cmpGainDn',
      label: 'GAIN-',
      x: -0.38,
      y: railY,
      z: railZ,
      interact: 'cmpGainDn',
      accent: COLORS.warn,
      fill: '#302010',
      ink: '#ffe8c0',
      width: 0.13,
    });
    processPaddle(scene, this.root, {
      name: 'cmpWlUp',
      label: 'λ+',
      x: -0.18,
      y: railY,
      z: railZ,
      interact: 'cmpWlUp',
      width: 0.12,
    });
    processPaddle(scene, this.root, {
      name: 'cmpWlDn',
      label: 'λ-',
      x: -0.02,
      y: railY,
      z: railZ,
      interact: 'cmpWlDn',
      width: 0.12,
    });
    processPaddle(scene, this.root, {
      name: 'cmpPhase',
      label: 'PHASE',
      x: 0.18,
      y: railY,
      z: railZ,
      interact: 'cmpPhase',
      width: 0.13,
    });
    processPaddle(scene, this.root, {
      name: 'cmpLock',
      label: 'LOCK',
      x: 0.38,
      y: railY,
      z: railZ,
      interact: 'cmpLock',
      accent: COLORS.accent,
      width: 0.13,
    });
    const ret = returnControl(scene, this.root, {
      name: 'cmpReturn',
      interact: 'cmpReturn',
      x: 0.58,
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
    if (!kind?.startsWith('cmp')) return;
    if (kind === 'cmpReturn' && this.sim.state.finished) {
      const ok = !!this.sim.state.result?.success;
      this.closeReq = {
        success: ok,
        armCmpBrake: ok,
        brakeWafers: this.sim.state.brakeWafers,
        immediate: true,
      };
      return;
    }
    if (this.sim.state.finished) return;
    const cal = this.sim.state.calibration;
    try {
      if (kind === 'cmpGainUp') {
        this.sim.act({ type: 'setGain', value: Math.min(CMP_GAIN_RANGE.max, cal.gain + 0.08) });
      } else if (kind === 'cmpGainDn') {
        this.sim.act({ type: 'setGain', value: Math.max(CMP_GAIN_RANGE.min, cal.gain - 0.08) });
      } else if (kind === 'cmpWlUp') {
        this.sim.act({ type: 'setWavelength', value: Math.min(CMP_WAVELENGTH_RANGE.max, cal.wavelength + 1) });
      } else if (kind === 'cmpWlDn') {
        this.sim.act({ type: 'setWavelength', value: Math.max(CMP_WAVELENGTH_RANGE.min, cal.wavelength - 1) });
      } else if (kind === 'cmpPhase') {
        this.sim.act({ type: 'setPhase', value: (cal.phase + Math.PI / 6) % (Math.PI * 2) });
      } else if (kind === 'cmpLock') {
        this.sim.act({ type: 'lockEndpoint' });
      }
    } catch {
      /* illegal */
    }
  }

  update(dt: number): void {
    if (!this.root.isEnabled()) return;
    this.sim.tick(dt);
    const s = this.sim.state;
    this.pad.rotation.y += dt * (0.8 + s.calibration.gain);
    this.slurryRing.rotation.y -= dt * 0.35;
    const laserMat = this.laserHead.material as ReturnType<typeof lamp>;
    laserMat.emissiveColor = new Color3(0.95, 0.2, 0.15).scale(0.4 + 0.4 * Math.sin(s.elapsedSeconds * 6));

    this.paintScope(s);
    if (s.finished) {
      this.setReturnArmed(true);
      const lockMat = this.lockLamp.material as ReturnType<typeof lamp>;
      lockMat.emissiveColor = (s.result?.success ? COLORS.accent : COLORS.fault).scale(0.95);
      if (s.result && !this.shownResult) {
        this.shownResult = true;
        this.closeReq = {
          success: s.result.success,
          armCmpBrake: s.result.success,
          brakeWafers: s.brakeWafers,
        };
      }
    }
  }

  private paintScope(s: CmpState): void {
    const smp = sample(s);
    const cal = s.calibration;
    const ctx = this.scopeTex.getContext() as CanvasRenderingContext2D;
    const W = 720;
    const H = 400;
    const fail = !!(s.finished && s.result && !s.result.success);
    const ink = fail ? '#f0a060' : '#7fd0ff';

    ctx.fillStyle = '#040810';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1a3850';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    ctx.fillStyle = ink;
    ctx.font = 'bold 20px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('CMP LASER ENDPOINT SCOPE', 24, 14);
    ctx.fillStyle = '#6a90a8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`${PROCESS.cmp.layerPolished} polish · stop ${PROCESS.cmp.stopLayer}`, 24, 40);

    const plotL = 36;
    const plotT = 58;
    const plotW = 520;
    const plotH = 180;
    ctx.strokeStyle = '#1a3048';
    ctx.strokeRect(plotL, plotT, plotW, plotH);
    // Grid
    ctx.strokeStyle = '#122030';
    ctx.lineWidth = 1;
    for (let g = 1; g < 4; g++) {
      const gy = plotT + (g / 4) * plotH;
      ctx.beginPath();
      ctx.moveTo(plotL, gy);
      ctx.lineTo(plotL + plotW, gy);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = '#7fd0ff';
    ctx.lineWidth = 2.5;
    const n = 80;
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1)) * s.timeLimitSeconds;
      const rem = trueRemainingAt(t, s.true_.initialOverburdenNm, s.true_.removalRateNmPerSecond);
      const refl = reflectanceAt(rem);
      const x = plotL + (i / (n - 1)) * plotW;
      const y = plotT + plotH - refl * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const kneeX = plotL + (s.true_.endpointSeconds / s.timeLimitSeconds) * plotW;
    ctx.strokeStyle = '#c08a1e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(kneeX, plotT);
    ctx.lineTo(kneeX, plotT + plotH);
    ctx.stroke();
    ctx.fillStyle = '#c08a1e';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('KNEE', kneeX + 4, plotT + 4);

    const playX = plotL + (Math.min(s.elapsedSeconds, s.timeLimitSeconds) / s.timeLimitSeconds) * plotW;
    ctx.strokeStyle = '#dfffee';
    ctx.beginPath();
    ctx.moveTo(playX, plotT);
    ctx.lineTo(playX, plotT + plotH);
    ctx.stroke();

    // Side gauges: gain / λ / phase
    const gaugeX = 580;
    const drawGauge = (label: string, pct: number, y: number, color: string) => {
      ctx.fillStyle = '#9fb8c8';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(label, gaugeX, y);
      ctx.fillStyle = '#122030';
      ctx.fillRect(gaugeX, y + 16, 110, 12);
      ctx.fillStyle = color;
      ctx.fillRect(gaugeX, y + 16, 110 * Math.min(1, Math.max(0, pct)), 12);
    };
    const gainPct = (cal.gain - CMP_GAIN_RANGE.min) / (CMP_GAIN_RANGE.max - CMP_GAIN_RANGE.min);
    const wlPct =
      (cal.wavelength - CMP_WAVELENGTH_RANGE.min) /
      (CMP_WAVELENGTH_RANGE.max - CMP_WAVELENGTH_RANGE.min);
    drawGauge(`GAIN ${cal.gain.toFixed(2)}`, gainPct, 58, '#c08a1e');
    drawGauge(`λ ${cal.wavelength} (ref ${CMP_REFERENCE_WAVELENGTH})`, wlPct, 100, '#7fd0ff');
    drawGauge(`φ ${cal.phase.toFixed(2)}`, (cal.phase % (Math.PI * 2)) / (Math.PI * 2), 142, '#9fe0c8');

    ctx.fillStyle = ink;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(
      `t=${s.elapsedSeconds.toFixed(1)}s   knee~${s.true_.endpointSeconds.toFixed(1)}s   limit ${s.timeLimitSeconds.toFixed(0)}s`,
      36,
      260,
    );
    ctx.fillText(`Apparent ${smp.apparentNm.toFixed(1)} nm   R=${smp.reflectance.toFixed(3)}`, 36, 286);
    ctx.fillText(
      s.committed ? `LOCKED @ ${s.lockedEndpointSeconds?.toFixed(1)}s` : 'Tune knobs → LOCK at the knee',
      36,
      312,
    );
    if (s.finished && s.result) {
      ctx.fillStyle = fail ? '#f0a060' : '#8fe0c0';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(
        s.result.success
          ? `PASS — brake ${s.brakeWafers} wafers — PRESS RETURN`
          : `FAIL — ${s.result.detail.slice(0, 36)} — RETURN`,
        36,
        348,
      );
    }
    this.scopeTex.update();
  }
}

/** Grooved polish-pad albedo so the platen isn't a flat navy disk.
 * Rect/line only — NullEngine canvas stubs lack arc(). */
function padMaterial(scene: Scene): PBRMaterial {
  const tex = new DynamicTexture('cmpPadTex', { width: 256, height: 256 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#3a4860';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#2a3448';
  ctx.lineWidth = 2;
  for (let r = 16; r < 120; r += 14) {
    ctx.strokeRect(128 - r, 128 - r, r * 2, r * 2);
  }
  ctx.strokeStyle = '#4a5870';
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(ang) * 120, 128 + Math.sin(ang) * 120);
    ctx.stroke();
  }
  tex.update();
  const m = new PBRMaterial('cmpPadMat', scene);
  m.albedoTexture = tex;
  m.albedoColor = new Color3(0.85, 0.88, 0.95);
  m.metallic = 0;
  m.roughness = 0.72;
  m.environmentIntensity = 0.25;
  m.specularIntensity = 0.4;
  m.emissiveColor = new Color3(0.05, 0.055, 0.07);
  m.fogEnabled = false;
  return m;
}
