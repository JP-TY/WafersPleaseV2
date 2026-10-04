/**
 * The metrology instrumentation cluster (GDD §13).
 *
 * "A group of display screens showing readout lines from the Stylus Profilometer,
 * Spectroscopic Ellipsometry, and Electron Microscope."
 *
 * Five instrument screens on a rack, not one merged HUD. Each is a separate
 * physical panel with its own measurand, its own units and its own limits,
 * because that separation is the whole lesson: a player who treats them as one
 * number with five sources will read the wrong one. The Stylus probe reads BOW in
 * nanometres and cannot see an STI void; the electron microscope reads a feature
 * width and cannot see substrate bow. Both are "a number on a screen".
 *
 * GDD §4 puts metrology mode switching on hotkeys 1-4, so switching screens is
 * instant and does not cost salary — the only cost of a measurement is the
 * latency it charges to §11 latency-by-layer, which is where the real trade-off
 * lives: a clean wafer must be stamped quickly, a defect must be *found* first.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import {
  C,
  MONO,
  Panel,
  graticule,
  hline,
  label,
  plate,
  trace,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { screenFromPanel, bezel } from '../scene.js';
import { painted, steel } from '../scene/lighting.js';
import { Knob, nameplate, pushButton, screws, telltales, vents } from '../scene/physical.js';
import { pickPanel } from '../ui/bench.js';
import { LAYOUT } from './bay.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import { TOOL_SPECS, type MetrologyReading } from '@wafers/sim';
import type { ToolType } from '@wafers/data';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';

const PW = 460;
const PH = 300;

/** Hotkey order per GDD §4 ("hotkeys 1-4 for metrology mode switching"). */
const HOTKEYS: ReadonlyArray<readonly [string, ToolType]> = [
  ['1', 'StylusProfilometer'],
  ['2', 'FourPointProbe'],
  ['3', 'SpectroscopicEllipsometry'],
  ['4', 'XRayRefractometry'],
  ['5', 'ElectronMicroscope'],
];

const SHORT: Readonly<Record<ToolType, string>> = {
  StylusProfilometer: 'STYLUS',
  FourPointProbe: '4PP',
  SpectroscopicEllipsometry: 'ELLIP',
  XRayRefractometry: 'XRR',
  ElectronMicroscope: 'SEM',
};

interface Screen {
  readonly tool: ToolType;
  readonly panel: Panel;
  readonly mesh: AbstractMesh;
  /** Rolling trace history for the readout line. */
  readonly history: number[];
  reading: MetrologyReading | null;
  measured: boolean;
  /** The physical RUN key. Pressing it is how the instrument is operated. */
  readonly run: { mesh: AbstractMesh; setPressed(p: boolean): void };
  /** Indicator lamp: lit only while the tool is actually running. */
  readonly lamp: (on: boolean) => void;
  /** Range trim knob, physically rotatable. */
  readonly knob: Knob;
}

export class ClusterView {
  private readonly root: TransformNode;
  /** Tilted child of root; all rack geometry hangs off this. */
  private readonly rack: TransformNode;
  private readonly screens = new Map<ToolType, Screen>();

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = new TransformNode('metrology-cluster', scene);
    this.root.position = new Vector3(LAYOUT.cluster.x, LAYOUT.cluster.y, LAYOUT.cluster.z);
    // Pitched forward about the rack's lower edge. Without this the panels stood
    // vertical at eye height across the room, and reading one meant looking
    // straight ahead rather than down at the bench you were working on.
    const pitchPivot = new TransformNode('metrology-pitch', scene);
    pitchPivot.parent = this.root;
    pitchPivot.rotation.x = LAYOUT.clusterPitch;
    this.rack = pitchPivot;

    // Rack frame so the cluster reads as a rack of instruments, not five quads
    // floating at the same depth.
    // Rack body, as one welded tray rather than a rail plus posts: it reads as
    // a single instrument housing and gives the bezels something to sit in.
    const frame = CreateBox('cluster-rack', { width: 2.36, height: 0.07, depth: 0.3 }, scene);
    frame.parent = this.rack;
    frame.position = new Vector3(0, -0.1, 0.01);
    frame.material = steel(scene, 'cluster-rack-mat', '#727c88');

    // Angled back panel the screens bolt into, so the rack has depth.
    const backPanel = CreateBox('cluster-back', { width: 2.36, height: 0.44, depth: 0.03 }, scene);
    backPanel.parent = this.rack;
    backPanel.position = new Vector3(0, 0.08, 0.05);
    backPanel.material = painted(scene, 'cluster-back-mat', '#20242c', 0.5);

    screws(scene, this.rack, 'cluster-rack-screw', 1.12, 0.02, 0.03, 4);
    vents(scene, this.rack, 'cluster-rack-vent', 9, 0.03, { width: 0.012, height: 0.014, depth: 0.004 }, new Vector3(-0.12, -0.19, 0.031));

    // Standoff posts down to the bench.
    for (const sx of [-1, 1]) {
      const upright = CreateBox(`cluster-upright-${sx}`, { width: 0.05, height: 0.3, depth: 0.05 }, scene);
      upright.parent = this.root;
      upright.position = new Vector3(sx * 1.12, LAYOUT.cluster.y - 0.34, LAYOUT.cluster.z + 0.04);
      upright.material = steel(scene, `cluster-upright-mat-${sx}`, '#5b636d');
    }

    // Five across the rack. They ARC around the operator: the outer two are
    // rotated inward so all five are readable from one seated position. Square
    // in a row meant only the middle screen faced you, and reading the ends
    // meant leaning around the wafer.
    HOTKEYS.forEach(([key, tool], i) => {
      const panel = new Panel(`cluster-${tool}`, { width: PW, height: PH, scale: 1.6 });
      const lateral = i - 2;
      const arc = -lateral * 0.14;
      const x = lateral * 0.47;
      const y = 0.13 - Math.abs(lateral) * 0.012;
      // Push each screen out along its own facing normal so the arc keeps the
      // bezels from intersecting at the centre.
      const nx = Math.sin(arc);
      const nz = Math.cos(arc);

      const mesh = screenFromPanel(scene, panel.texture, `cluster-${tool}-screen`, 0.45, 0.29);
      mesh.parent = this.rack;
      mesh.position = new Vector3(x, y, 0);
      mesh.rotation.y = arc;

      const bez = bezel(scene, `cluster-${tool}-bezel`, 0.45, 0.29, 0.022);
      bez.parent = this.rack;
      bez.position = new Vector3(x + nx * 0.022, y, nz * 0.022);
      bez.rotation.y = arc;

      // Physical RUN key under each screen. The instrument is a tool you operate,
      // not a readout you toggle, so the key is a real button with travel and a
      // lamp beside it, and clicking the SCREEN also works for convenience.
      const run = pushButton(scene, this.rack, `cluster-${tool}-run`, new Vector3(x + nx * 0.05, y - 0.175, nz * 0.06));
      const lamp = telltales(scene, this.rack, `cluster-${tool}-lamp`, new Vector3(x + nx * 0.05, y - 0.128, nz * 0.055), [
        { label: 'RUN', colour: '#5fd68a' },
      ]);
      // Range trim, so the faceplate is not a bare screen.
      const knob = new Knob(scene, this.rack, `cluster-${tool}-trim`, new Vector3(x + nx * 0.11 + 0.04, y - 0.175, nz * 0.06), {
        radius: 0.017,
      });

      nameplate(scene, this.rack, `cluster-${tool}-plate`, SHORT[tool], 0.17, new Vector3(x, y + 0.2, nz * 0.03));

      this.screens.set(tool, {
        tool,
        panel,
        mesh,
        history: [],
        reading: null,
        measured: false,
        run,
        lamp: (on: boolean) => lamp.set(0, on),
        knob,
      });
      void key;
    });

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      for (const s of this.screens.values()) {
        // The physical key first, so clicking the button does not read as a miss.
        if (s.run.mesh.isPickable && this.hitMesh(s.run.mesh)) {
          s.run.setPressed(true);
          this.onRun(s.tool);
          return;
        }
        const at = pickPanel(scene, s.mesh, PW, PH);
        if (at) {
          this.onRun(s.tool);
          return;
        }
      }
    });
  }

  /** Called by the owner when the player runs an instrument. */
  onRun: (tool: ToolType) => void = () => {};

  private hitMesh(mesh: AbstractMesh): boolean {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => m === mesh);
    return pick?.hit === true;
  }

  /** Release the RUN key and settle the lamp. Called from the frame update. */
  releaseRunKeys(): void {
    for (const s of this.screens.values()) {
      if (this.active.has(s.tool)) continue;
      s.run.setPressed(false);
    }
  }

  private readonly active = new Set<ToolType>();

  /** Light the lamp on the tool currently running. */
  setRunning(tool: ToolType | null): void {
    this.active.clear();
    for (const s of this.screens.values()) {
      s.lamp(tool === s.tool);
      if (tool !== s.tool) s.run.setPressed(false);
    }
    if (tool) this.active.add(tool);
  }

  private readonly scene: Scene;

  /** Feed a fresh reading in. */
  setReading(reading: MetrologyReading): void {
    const s = this.screens.get(reading.tool);
    if (!s) return;
    s.reading = reading;
    s.measured = true;
    s.history.push(reading.value);
    // A long trace is unreadable at this size anyway; keep the recent window.
    if (s.history.length > 64) s.history.shift();
    s.panel.invalidate();
  }

  /** A screen with no reading must not reuse the previous wafer's. */
  resetForNewWafer(toolsRun: readonly ToolType[]): void {
    for (const [tool, s] of this.screens) {
      if (!toolsRun.includes(tool)) {
        s.reading = null;
        s.measured = false;
        s.history.length = 0;
        s.panel.invalidate();
      }
    }
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  update(): void {
    for (const s of this.screens.values()) {
      const key = HOTKEYS.find(([, t]) => t === s.tool)?.[0] ?? '?';
      s.panel.flush((c) => this.paint(c, s, key));
    }
  }

  private paint(c: PanelCtx, s: Screen, key: string): void {
    plate(c, 5);
    const spec = TOOL_SPECS[s.tool];

    // Header: which instrument this is, and its hotkey.
    label(c, SHORT[s.tool], 14, 18, { size: 15, color: C.text, weight: '800', font: MONO });
    label(c, `[${key}]`, c.w - 14, 18, { size: 13, color: C.accent, align: 'right', font: MONO, weight: '700' });
    hline(c, 30);

    if (!s.measured || !s.reading) {
      // Idle screen. It must look like a real instrument that has not been run,
      // not like a placeholder: trace grid, flat line at nominal.
      graticule(c, 8, 4);
      const mid = (c.h - 44) * 0.5 + 40;
      trace(c, [0, mid, c.w, mid], 'rgba(124,242,176,0.22)', 2);
      label(c, 'PRESS TO MEASURE', c.w / 2, c.h - 26, {
        size: 14,
        color: C.textDim,
        align: 'center',
        font: MONO,
      });
      label(c, `${spec.measurand.label} / ${spec.measurand.unit}`, c.w / 2, c.h - 46, {
        size: 11,
        color: C.grid,
        align: 'center',
        font: MONO,
      });
      return;
    }

    const r = s.reading;
    // Signal plot with the spec window drawn as the reference band, so "in
    // spec" is a spatial fact rather than a number to compare in your head.
    const top = 44;
    const bot = c.h - 46;
    graticule(c, 8, 4);

    const lo = spec.measurand.lowerLimit;
    const hi = spec.measurand.upperLimit;
    const span = Math.max(Math.abs(hi - lo), 1e-6);
    const pad = span * 0.55;
    const viewLo = lo - pad;
    const viewHi = hi + pad;
    const toPy = (v: number) => bot - ((v - viewLo) / (viewHi - viewLo || 1)) * (bot - top);

    // Spec window.
    c.ctx.fillStyle = 'rgba(94,200,216,0.10)';
    c.ctx.fillRect(0, toPy(hi), c.w, toPy(lo) - toPy(hi));
    for (const lim of [lo, hi]) {
      const y = Math.round(toPy(lim)) + 0.5;
      c.ctx.strokeStyle = 'rgba(232,181,82,0.75)';
      c.ctx.lineWidth = 1;
      c.ctx.beginPath();
      c.ctx.moveTo(0, y);
      c.ctx.lineTo(c.w, y);
      c.ctx.stroke();
    }

    // Trace. With one sample it is a flat segment; the value marker carries the
    // reading so a single measurement still reads clearly.
    const pts: number[] = [];
    const n = s.history.length;
    if (n === 1) {
      const y = toPy(s.history[0]!);
      pts.push(0, y, c.w, y);
    } else {
      for (let i = 0; i < n; i++) {
        pts.push((i / (n - 1)) * c.w, toPy(s.history[i]!));
      }
    }
    trace(c, pts, r.outOfSpec ? C.bad : C.trace, 2);

    // Value block.
    const txt = r.value.toFixed(r.precision);
    label(c, spec.measurand.label, 14, 46, { size: 11, color: C.textDim, font: MONO, weight: '700' });
    label(c, txt, 14, 76, {
      size: 34,
      color: r.outOfSpec ? C.bad : C.trace,
      font: MONO,
      weight: '800',
    });
    label(c, spec.measurand.unit, 16 + c.ctx.measureText(txt).width * 1.9, 80, {
      size: 13,
      color: C.textDim,
      font: MONO,
    });

    // Verdict + limits, right-aligned.
    value(c, `${r.outOfSpec ? 'OUT OF SPEC' : 'IN SPEC'}`, c.w - 14, 50, {
      size: 13,
      color: r.outOfSpec ? C.bad : C.good,
      align: 'right',
    });
    label(
      c,
      `LIMS ${lo.toFixed(r.precision)} / ${hi.toFixed(r.precision)}`,
      c.w - 14,
      70,
      { size: 11, color: C.textDim, align: 'right', font: MONO },
    );

    // Latency is the real cost of this screen and GDD §11 scores it, so it is
    // displayed rather than hidden.
    label(c, `CONF ${(r.confidence * 100).toFixed(0)}%`, 14, c.h - 26, {
      size: 11,
      color: r.marginal || r.subResolution ? C.warn : C.textDim,
      font: MONO,
    });
    label(c, `${r.latencySeconds}s`, c.w - 14, c.h - 26, {
      size: 11,
      color: C.textDim,
      align: 'right',
      font: MONO,
    });

    // When a pass found nothing, say WHICH kind of nothing. These are different
    // physical situations and they call for different actions from the player,
    // so conflating them would teach the wrong lesson:
    //
    //   below resolution -> this technique can never see it. Change instrument.
    //   marginal        -> it was within reach and this pass missed it.
    //                     Re-measure, or cross-check with another instrument.
    if (r.resolved.length === 0) {
      const note = r.subResolution
        ? 'BELOW THIS TOOL\'S RESOLUTION — CHANGE INSTRUMENT'
        : r.marginal
          ? 'MARGINAL — WITHIN REACH, NOT CAUGHT. RE-MEASURE.'
          : null;
      if (note) {
        label(c, note, c.w / 2, c.h - 8, {
          size: 10,
          color: C.warn,
          align: 'center',
          font: MONO,
        });
      }
    }
  }

  /** Screen meshes, so the owner can highlight the active one. */
  meshes(): AbstractMesh[] {
    return [...this.screens.values()].map((s) => s.mesh);
  }
}