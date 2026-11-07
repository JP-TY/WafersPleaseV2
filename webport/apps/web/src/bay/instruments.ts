import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { ToolType } from '@wafers/data';
import type { MetrologyReading } from '@wafers/sim';
import { COLORS, screenGlow, lamp, rubber, matte, matteNoise } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';

const TOOL_LABEL: Record<ToolType, string> = {
  StylusProfilometer: 'STYLUS PROFILOMETER',
  FourPointProbe: 'FOUR-POINT PROBE',
  SpectroscopicEllipsometry: 'ELLIPSOMETRY',
  XRayRefractometry: 'X-RAY REFRACTOMETRY',
  ElectronMicroscope: 'ELECTRON MICROSCOPE',
};

const TOOL_HOTKEY: Partial<Record<ToolType, string>> = {
  StylusProfilometer: '1',
  FourPointProbe: '2',
  SpectroscopicEllipsometry: '3',
  XRayRefractometry: '4',
  ElectronMicroscope: '5',
};

interface InstrumentSlot {
  readonly tool: ToolType;
  readonly housing: AbstractMesh;
  readonly screen: AbstractMesh;
  readonly key: AbstractMesh;
  readonly lamp: AbstractMesh;
  readonly tex: DynamicTexture;
}

/** Metrology instrument cluster — diegetic screens (GDD §13). */
export class InstrumentCluster {
  readonly root: TransformNode;
  private readonly slots = new Map<ToolType, InstrumentSlot>();
  private readonly faultLamp: AbstractMesh;
  private readonly chassis: AbstractMesh[] = [];
  private fault = false;

  constructor(scene: Scene, tools: readonly ToolType[], parent?: TransformNode) {
    this.root = new TransformNode('instruments', scene);
    if (parent) this.root.parent = parent;
    // Slim wall-mount panel, parked deep back-right — prior cabinet ate the right third.
    this.root.position = new Vector3(1.48, 1.38, -0.52);
    this.root.rotation.y = -0.32;

    // Thin chassis — richer ORM so the tower isn't uniform plastic paste.
    const rack = CreateBox('instrumentRack', { width: 0.42, height: 0.58, depth: 0.06 }, scene);
    rack.parent = this.root;
    rack.material = matteNoise(scene, 'rackMat', new Color3(0.18, 0.2, 0.23), {
      variance: 18,
      speck: 0.11,
      size: 128,
      tileHint: 'fine',
      blotch: 0.62,
      emissive: 0.018,
      uScale: 2.8,
      vScale: 2.2,
    });
    rack.isPickable = false;
    this.chassis.push(rack);
    // Soft contact under wall-mount cheek so the rack doesn't float off the back wall.
    const rackContact = CreateBox('rackContact', { width: 0.44, height: 0.6, depth: 0.01 }, scene);
    rackContact.parent = this.root;
    rackContact.position.set(0, 0, -0.04);
    rackContact.material = matte(scene, 'rackContactMat', new Color3(0.05, 0.045, 0.04), 0);
    rackContact.isPickable = false;
    this.chassis.push(rackContact);

    // Single-side vent strip (right cheek only — less silhouette mass).
    for (let vi = 0; vi < 3; vi++) {
      const vent = CreateBox(`rackVent_${vi}`, { width: 0.01, height: 0.055, depth: 0.02 }, scene);
      vent.parent = this.root;
      vent.position.set(0.205, 0.1 - vi * 0.1, 0.01);
      vent.material = matte(scene, 'rackVentMat', new Color3(0.14, 0.16, 0.18), 0.02);
      vent.isPickable = false;
      this.chassis.push(vent);
    }

    // One trunk cable into the wall chase
    const cable = CreateCylinder('rackCable', { diameter: 0.012, height: 0.22, tessellation: 6 }, scene);
    cable.parent = this.root;
    cable.position.set(0.18, 0.05, -0.1);
    cable.rotation.x = 0.7;
    cable.material = rubber(scene, 'rackCableMat', new Color3(0.12, 0.13, 0.15));
    cable.isPickable = false;
    this.chassis.push(cable);

    const header = CreateBox('rackHeader', { width: 0.38, height: 0.045, depth: 0.012 }, scene);
    header.parent = this.root;
    header.position.set(0, 0.26, 0.04);
    applyLabel(header, scene, {
      width: 512,
      height: 64,
      fill: '#0e141c',
      ink: '#6fc4a0',
      align: 'center',
      font: 'bold 26px monospace',
      lines: ['METROLOGY'],
      lineHeight: 36,
    });
    header.isPickable = false;
    this.chassis.push(header);

    tools.forEach((tool, i) => {
      const y = 0.14 - i * 0.12;
      const housing = CreateBox(`toolHousing_${tool}`, { width: 0.38, height: 0.1, depth: 0.045 }, scene);
      housing.parent = this.root;
      housing.position.set(0, y, 0.04);
      housing.material = matteNoise(scene, `housing_${tool}`, new Color3(0.22, 0.24, 0.27), {
        variance: 10,
        speck: 0.07,
        size: 96,
        tileHint: 'fine',
        blotch: 0.4,
        emissive: 0.02,
        uScale: 1.8,
        vScale: 1.4,
      });
      housing.isPickable = false;
      this.chassis.push(housing);

      const bezel = CreateBox(`toolBezel_${tool}`, { width: 0.34, height: 0.085, depth: 0.01 }, scene);
      bezel.parent = this.root;
      bezel.position.set(-0.01, y + 0.005, 0.06);
      bezel.material = matte(scene, `bezel_${tool}`, new Color3(0.12, 0.14, 0.16), 0.05);
      bezel.isPickable = false;
      this.chassis.push(bezel);

      const screen = CreateBox(`toolScreen_${tool}`, { width: 0.3, height: 0.07, depth: 0.008 }, scene);
      screen.parent = this.root;
      screen.position.set(-0.01, y + 0.005, 0.068);
      screen.isPickable = true;
      screen.metadata = { interact: 'tool', tool };

      const tex = applyLabel(screen, scene, {
        width: 640,
        height: 220,
        fill: '#071018',
        ink: '#7fd9b0',
        font: 'bold 28px monospace',
        lines: [TOOL_LABEL[tool], `KEY ${TOOL_HOTKEY[tool] ?? '—'}`, 'IDLE — PRESS RUN'],
        lineHeight: 48,
      });
      const glow = screenGlow(scene, `screenGlow_${tool}`, new Color3(0.04, 0.12, 0.1));
      glow.diffuseTexture = tex;
      glow.emissiveTexture = tex;
      glow.emissiveColor = new Color3(0.45, 0.55, 0.5);
      screen.material = glow;

      const key = CreateBox(`toolKey_${tool}`, { width: 0.05, height: 0.024, depth: 0.028 }, scene);
      key.parent = this.root;
      key.position.set(0.15, y - 0.03, 0.08);
      key.material = lamp(scene, `key_${tool}`, COLORS.accent, 0.4);
      key.isPickable = true;
      key.metadata = { interact: 'tool', tool };

      const status = CreateBox(`toolLamp_${tool}`, { width: 0.022, height: 0.022, depth: 0.022 }, scene);
      status.parent = this.root;
      status.position.set(-0.15, y - 0.03, 0.08);
      status.material = lamp(scene, `lamp_${tool}`, COLORS.bench, 0.12);
      status.isPickable = false;

      this.slots.set(tool, { tool, housing, screen, key, lamp: status, tex });
    });

    this.faultLamp = CreateBox('rackFaultLamp', { width: 0.07, height: 0.028, depth: 0.028 }, scene);
    this.faultLamp.parent = this.root;
    this.faultLamp.position.set(0, 0.3, 0.05);
    this.faultLamp.material = lamp(scene, 'faultLampMat', COLORS.bench, 0.1);
    this.faultLamp.isPickable = false;
    this.faultLamp.metadata = { interact: 'faultLamp' };
  }

  /**
   * Boxy rack / housing silhouette replaced by Inspection.glb.
   * Screens + keys stay procedural (true interactables).
   */
  scenicChassis(): AbstractMesh[] {
    return this.chassis;
  }

  showReading(tool: ToolType, reading: MetrologyReading): void {
    const slot = this.slots.get(tool);
    if (!slot) return;
    const val = reading.value.toFixed(reading.precision);
    const status = reading.outOfSpec ? 'OUT OF SPEC' : 'IN SPEC';
    const ink = reading.outOfSpec ? '#f0a060' : '#7fd9b0';
    rewriteLabel(slot.tex, {
      width: 512,
      height: 220,
      fill: '#0a1218',
      ink,
      font: 'bold 24px monospace',
      lines: [
        TOOL_LABEL[tool],
        `${reading.signalLabel}  ${val} ${reading.unit}`,
        `LL ${reading.lowerLimit}  UL ${reading.upperLimit}`,
        status,
        reading.resolved.length ? `HIT: ${reading.resolved.map((d) => d.defectType).join(', ')}` : 'NO DEFECT RESOLVED',
      ],
      lineHeight: 36,
    });
    const lampMat = slot.lamp.material as ReturnType<typeof lamp>;
    lampMat.diffuseColor = reading.outOfSpec ? COLORS.warn : COLORS.accent;
    lampMat.emissiveColor = (reading.outOfSpec ? COLORS.warn : COLORS.accent).scale(0.85);
  }

  setRunning(tool: ToolType, running: boolean): void {
    const slot = this.slots.get(tool);
    if (!slot) return;
    const key = slot.key.material as ReturnType<typeof lamp>;
    key.emissiveColor = running ? COLORS.accent.scale(0.95) : COLORS.accent.scale(0.35);
    slot.key.position.z = running ? 0.08 : 0.1;
  }

  setFault(on: boolean): void {
    this.fault = on;
    const mat = this.faultLamp.material as ReturnType<typeof lamp>;
    mat.diffuseColor = on ? COLORS.fault : COLORS.bench;
    mat.emissiveColor = on ? COLORS.fault.scale(0.95) : COLORS.bench.scale(0.1);
  }

  get isFault(): boolean {
    return this.fault;
  }

  meshFor(tool: ToolType): AbstractMesh | undefined {
    return this.slots.get(tool)?.screen;
  }

  allScreens(): AbstractMesh[] {
    return [...this.slots.values()].map((s) => s.screen);
  }

  /**
   * Day switch polish: relabel and enable only the day's roster.
   * Locked tools stay visible but dimmed / non-pickable so the rack still reads
   * as a full metrology cluster.
   */
  setDayRoster(available: readonly ToolType[], dayNumber: number): void {
    const allowed = new Set(available);
    // Available tools pack from the top; locked tools park below, heavily dimmed.
    const openTools = [...this.slots.keys()].filter((t) => allowed.has(t));
    const lockedTools = [...this.slots.keys()].filter((t) => !allowed.has(t));
    let y = 0.16;
    const place = (tool: ToolType, open: boolean) => {
      const slot = this.slots.get(tool);
      if (!slot) return;
      slot.housing.position.y = y;
      slot.screen.position.y = y + 0.005;
      slot.key.position.y = y - 0.03;
      slot.lamp.position.y = y - 0.03;
      slot.screen.isPickable = open;
      slot.key.isPickable = open;
      slot.housing.visibility = open ? 1 : 0.22;
      slot.screen.visibility = open ? 1 : 0.22;
      rewriteLabel(slot.tex, {
        width: 640,
        height: 220,
        fill: '#071018',
        ink: open ? '#7fd9b0' : '#4a5560',
        font: 'bold 26px monospace',
        lines: open
          ? [`DAY ${dayNumber}`, TOOL_LABEL[tool], `KEY ${TOOL_HOTKEY[tool] ?? '—'}`, 'IDLE — PRESS RUN']
          : [`DAY ${dayNumber}`, TOOL_LABEL[tool], 'LOCKED THIS SHIFT', '—'],
        lineHeight: 42,
      });
      const status = slot.lamp.material as ReturnType<typeof lamp>;
      status.emissiveColor = open ? COLORS.accent.scale(0.35) : COLORS.bench.scale(0.05);
      const key = slot.key.material as ReturnType<typeof lamp>;
      key.emissiveColor = open ? COLORS.accent.scale(0.45) : COLORS.bench.scale(0.08);
      y -= 0.12;
    };
    for (const t of openTools) place(t, true);
    for (const t of lockedTools) place(t, false);
  }
}
