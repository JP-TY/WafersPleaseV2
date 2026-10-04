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
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
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
import { screenFromPanel, bezel, matte } from '../scene.js';
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
  /** Has the player run this instrument on the current wafer yet? */
  measured: boolean;
}

export class ClusterView {
  private readonly root: TransformNode;
  private readonly screens = new Map<ToolType, Screen>();

  constructor(scene: Scene) {
    this.root = new TransformNode('metrology-cluster', scene);

    // Rack frame so the cluster reads as a rack of instruments, not five quads
    // floating at the same depth.
    const frame = CreateBox('cluster-rack', { width: 2.5, height: 0.06, depth: 0.34 }, scene);
    frame.parent = this.root;
    frame.position = new Vector3(LAYOUT.cluster.x, LAYOUT.cluster.y - 0.18, LAYOUT.cluster.z);
    frame.material = matte(scene, 'cluster-rack-mat', new Color3(0.15, 0.16, 0.19), 0.1);

    const upright = CreateBox('cluster-upright-l', { width: 0.06, height: 0.5, depth: 0.06 }, scene);
    upright.parent = this.root;
    upright.position = new Vector3(-1.2, LAYOUT.cluster.y - 0.36, LAYOUT.cluster.z);
    upright.material = matte(scene, 'cluster-upright-mat', new Color3(0.15, 0.16, 0.19), 0.1);
    const upright2 = upright.clone('cluster-upright-r');
    upright2.position = new Vector3(1.2, LAYOUT.cluster.y - 0.36, LAYOUT.cluster.z);

    // Five across the top row; the rack is wider than the bench so it reads as
    // a cluster you turn to, which is the GDD's "turn to an instrument" motion.
    HOTKEYS.forEach(([key, tool], i) => {
      const panel = new Panel(`cluster-${tool}`, { width: PW, height: PH, scale: 1.6 });
      const x = LAYOUT.cluster.x + (i - 2) * 0.5;
      const y = LAYOUT.cluster.y - Math.abs(i - 2) * 0.03;

      const mesh = screenFromPanel(scene, panel.texture, `cluster-${tool}-screen`, 0.46, 0.3);
      mesh.parent = this.root;
      mesh.position = new Vector3(x, y, LAYOUT.cluster.z);

      const bez = bezel(scene, `cluster-${tool}-bezel`, 0.46, 0.3, 0.03);
      bez.parent = this.root;
      bez.position = new Vector3(x, y, LAYOUT.cluster.z + 0.025);

      // Physical RUN button under each screen: the instrument is a tool you
      // operate, not a readout you toggle.
      const btn = CreateBox(`cluster-${tool}-run`, { width: 0.13, height: 0.03, depth: 0.09 }, scene);
      btn.parent = this.root;
      btn.position = new Vector3(x, y - 0.185, LAYOUT.cluster.z + 0.03);
      btn.material = matte(scene, `cluster-${tool}-run-mat`, new Color3(0.34, 0.36, 0.4), 0.3);

      this.screens.set(tool, { tool, panel, mesh, history: [], reading: null, measured: false });
      void key;
    });

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      for (const s of this.screens.values()) {
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