/**
 * RCA clean bench — the twin-tank wet bench view.
 *
 * Draws what the simulation actually models, which is the point: two separate
 * tanks with independent temperatures, a heater per tank, the step sequence
 * including the QDR megasonic rinses, and a live removal readout driven by the
 * integrated Arrhenius exposure rather than a pass/fail comparison at the end.
 *
 * The Unity original drew one tank panel, one shared temperature, and no rinse
 * step at all.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import {
  C,
  Panel,
  MONO,
  column,
  hline,
  label,
  meter,
  plate,
  roundRect,
  trace,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { mountBench, pickPanel, type BenchMount } from '../ui/bench.js';
import { PROCESS, arrheniusRatio, realMinutes } from '@wafers/sim';
import {
  RCA_STEPS,
  type RcaAction,
  type RcaCleanState,
  type ReworkMinigame,
} from '@wafers/sim';

const W = 1024;
const H = 512;

const SC1_COLOR = '#5b8cd6';
const SC2_COLOR = '#d69a5b';

export class RcaBench {
  private readonly panel: Panel;
  private readonly sim: ReworkMinigame<RcaCleanState, RcaAction>;
  private readonly mount: BenchMount;
  /** Rolling removal history, so the player can see the curve approach. */
  private readonly history: number[] = [];

  constructor(private readonly scene: Scene, sim: ReworkMinigame<RcaCleanState, RcaAction>) {
    this.sim = sim;
    this.panel = new Panel('rca-panel', { width: W, height: H, scale: 1.5 });
    this.mount = mountBench(scene, 'rca', this.panel);
    this.bindInput();
  }

  setVisible(visible: boolean): void {
    this.mount.setVisible(visible);
  }

  /**
   * Pointer input.
   *
   * Raycasts into the screen mesh and reads the hit's texture coordinates, so
   * panel pixel coordinates are exact regardless of camera angle. Mapping
   * pointer offsets by hand would drift as soon as the camera moves.
   */
  private bindInput(): void {
    this.scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      const at = pickPanel(this.scene, this.mount.screen, W, H);
      if (at) this.handleClick(at.px, at.py);
    });
  }

  /**
   * Hit regions in panel pixels.
   *
   * Declared beside the renderer so the drawn geometry and the clickable
   * geometry cannot drift apart. Tank columns occupy the upper band; the action
   * button the lower-right block.
   */
  private hit(px: number, py: number): 'sc1Heat' | 'sc2Heat' | 'immerse' | null {
    if (py >= 190 && py <= 380) {
      if (px >= 40 && px <= 240) return 'sc1Heat';
      if (px >= 280 && px <= 480) return 'sc2Heat';
    }
    if (py >= 415 && py <= 470 && px >= 540 && px <= W - 24) return 'immerse';
    return null;
  }

  private handleClick(px: number, py: number): void {
    if (this.sim.finished) return;
    const region = this.hit(px, py);
    if (region === null) return;
    if (region === 'immerse') {
      const immersed = this.sim.state.immersed;
      try {
        this.sim.act(immersed ? { type: 'withdraw' } : { type: 'immerse' });
      } catch {
        /* illegal transition — ignore rather than spam the console */
      }
      return;
    }
    // Clicking a tank column sets that tank's heater from the click height.
    const bath = region === 'sc1Heat' ? 'sc1' : 'sc2';
    const spec = bath === 'sc1' ? PROCESS.rca.sc1.target : PROCESS.rca.sc2.target;
    const t = Math.max(0, Math.min(1, (380 - py) / 190));
    this.sim.act({ type: 'setHeater', bath, setpointC: spec.min + t * (95 - spec.min) });
  }

  /** Advance the sim and repaint. Call once per frame. */
  update(dt: number): void {
    this.sim.tick(dt);
    // Live instrument: temperature, traces and timers all change every frame, so
    // the panel must be invalidated or flush() early-returns on a stale image.
    this.panel.invalidate();
    const s = this.sim.state;

    // Sample the removal estimate for the curve. Derived from the same
    // Arrhenius integral the outcome uses, so the trace cannot disagree with
    // the verdict.
    const bath = s.step.kind === 'SC2' ? s.baths.sc2 : s.baths.sc1;
    const rate =
      PROCESS.rca.preExponential *
      arrheniusRatio(bath.temperatureC, s.step.targetC.nominal, PROCESS.rca.activationEnergyJPerMol);
    const fraction = s.immersed || s.dwellSeconds > 0 ? 1 - Math.exp(-rate * s.dwellSeconds) : 0;
    this.history.push(fraction);
    if (this.history.length > W - 60) this.history.shift();

    void bath;
    this.panel.flush((c) => this.paint(c, s));
  }

  private paint(c: PanelCtx, s: RcaCleanState): void {
    plate(c);

    label(c, 'WET BENCH 2 — RCA STANDARD CLEAN', 22, 26, { size: 17, color: C.text, weight: '700' });
    label(c, `STEP ${s.stepIndex + 1} / ${RCA_STEPS.length}`, W - 22, 26, { size: 13, align: 'right', color: C.accent });
    hline(c, 46);

    this.paintStepBanner(c, s);
    this.paintTanks(c, s);
    this.paintTrace(c);
    this.paintAction(c, s);

    if (this.sim.result) this.paintVerdict(c);
  }

  private paintStepBanner(c: PanelCtx, s: RcaCleanState): void {
    const y = 62;
    label(c, s.step.label, 22, y, { size: 14, color: C.text });
    label(c, s.step.chemistry, 22, y + 20, { size: 12, color: C.accent, font: MONO });
    label(c, `removes: ${s.step.removes}`, 22, y + 38, { size: 11, color: C.textDim });

    const t = s.step.targetC;
    label(c, `TARGET ${t.min}–${t.max} °C`, W - 22, y, { size: 13, color: C.text, align: 'right', font: MONO });
    label(
      c,
      `dwell ${realMinutes(s.step.dwellSeconds).toFixed(0)} real min`,
      W - 22,
      y + 20,
      { size: 11, color: C.textDim, align: 'right' },
    );
  }

  private paintTanks(c: PanelCtx, s: RcaCleanState): void {
    const tankY = 190;
    const tankH = 190;
    const tankW = 200;

    const tank = (
      x: number,
      name: string,
      chemistry: string,
      tempC: number,
      setpointC: number,
      liquid: string,
      spec: { min: number; max: number },
      active: boolean,
    ) => {
      label(c, name, x + tankW / 2, tankY - 14, { size: 15, color: active ? C.text : C.textDim, align: 'center', weight: '700' });
      label(c, chemistry, x + tankW / 2, tankY + tankH + 16, { size: 10, color: C.textDim, align: 'center', font: MONO });

      // Liquid column. Height tracks temperature so the thermal state is
      // readable at a glance, as on a real heated bench.
      column(c, x, tankY, tankW, tankH, Math.max(0.02, tempC / 95), liquid);

      // Window band across the column.
      const yHi = tankY + tankH * (1 - spec.max / 95);
      const yLo = tankY + tankH * (1 - spec.min / 95);
      c.ctx.save();
      c.ctx.strokeStyle = C.good;
      c.ctx.lineWidth = 1;
      c.ctx.setLineDash([4, 4]);
      c.ctx.beginPath();
      c.ctx.moveTo(x, yHi);
      c.ctx.lineTo(x + tankW, yHi);
      c.ctx.moveTo(x, yLo);
      c.ctx.lineTo(x + tankW, yLo);
      c.ctx.stroke();
      c.ctx.restore();

      // Setpoint marker.
      const ySp = tankY + tankH * (1 - Math.min(95, setpointC) / 95);
      c.ctx.strokeStyle = C.warn;
      c.ctx.lineWidth = 2;
      c.ctx.beginPath();
      c.ctx.moveTo(x - 6, ySp);
      c.ctx.lineTo(x + tankW + 6, ySp);
      c.ctx.stroke();

      value(c, `${tempC.toFixed(1)} °C`, x + tankW - 8, tankY + 14, { color: inBand(tempC, spec) ? C.good : C.warn });
      label(c, `set ${setpointC.toFixed(0)}`, x + 8, tankY + 14, { size: 10, color: C.textDim, font: MONO });
      label(c, `in-window ${spec.min}–${spec.max}`, x + tankW / 2, tankY + tankH + 32, { size: 10, color: C.textDim, align: 'center' });
    };

    tank(40, PROCESS.rca.sc1.name, PROCESS.rca.sc1.abbreviation, s.baths.sc1.temperatureC, s.baths.sc1.setpointC, SC1_COLOR, PROCESS.rca.sc1.target, s.step.kind === 'SC1');
    tank(280, PROCESS.rca.sc2.name, PROCESS.rca.sc2.abbreviation, s.baths.sc2.temperatureC, s.baths.sc2.setpointC, SC2_COLOR, PROCESS.rca.sc2.target, s.step.kind === 'SC2');

    // Dwell meter for the active step, with the pass window drawn as a band.
    const mx = 40;
    const mw = 440;
    const my = 396;
    label(c, `DWELL  ${s.dwellSeconds.toFixed(1)} s game = ${realMinutes(s.dwellSeconds).toFixed(2)} real min`, mx, my - 8, { size: 11, color: C.textDim, font: MONO });
    const lo = Math.max(0, 1 - (s.step.dwellSeconds * 1.35) / (s.step.dwellSeconds * 2.6));
    const hi = Math.min(1, 1 - (s.step.dwellSeconds * 0.62) / (s.step.dwellSeconds * 2.6));
    meter(c, mx, my, mw, 16, s.dwellSeconds / (s.step.dwellSeconds * 2.6), {
      band: [lo, hi],
      color: C.accent,
    });
  }

  private paintTrace(c: PanelCtx): void {
    // Removal-vs-time curve on the right, with the 98% target line.
    const x0 = 540;
    const y0 = 180;
    const w = W - x0 - 24;
    const h = 220;

    roundRect(c.ctx, x0, y0, w, h, 6);
    c.ctx.fillStyle = '#0a0e13';
    c.ctx.fill();
    c.ctx.strokeStyle = C.panelEdge;
    c.ctx.lineWidth = 1;
    c.ctx.stroke();

    label(c, 'REMOVAL vs DWELL', x0 + 10, y0 + 14, { size: 11, color: C.textDim });

    const target = PROCESS.rca.removalTarget;
    const yTarget = y0 + h - 6 - target * (h - 24);
    c.ctx.save();
    c.ctx.strokeStyle = C.good;
    c.ctx.setLineDash([3, 3]);
    c.ctx.lineWidth = 1;
    c.ctx.beginPath();
    c.ctx.moveTo(x0 + 4, yTarget);
    c.ctx.lineTo(x0 + w - 4, yTarget);
    c.ctx.stroke();
    c.ctx.restore();
    label(c, `${(target * 100).toFixed(0)}% target`, x0 + w - 6, yTarget - 8, { size: 10, color: C.good, align: 'right' });

    if (this.history.length > 1) {
      const pts: number[] = [];
      const n = this.history.length;
      for (let i = 0; i < n; i++) {
        pts.push(x0 + 6 + (i / (W - 60)) * (w - 12));
        pts.push(y0 + h - 6 - this.history[i]! * (h - 24));
      }
      trace(c, pts, C.trace, 2);
    }
  }

  private paintAction(c: PanelCtx, s: RcaCleanState): void {
    const x = 540;
    const y = 420;
    const w = W - x - 24;
    const h = 46;

    roundRect(c.ctx, x, y, w, h, 8);
    const canAct = !s.finished;
    c.ctx.fillStyle = canAct ? (s.immersed ? '#7a3320' : '#1d3a52') : '#20262e';
    c.ctx.fill();
    c.ctx.strokeStyle = canAct ? C.accent : C.panelEdge;
    c.ctx.lineWidth = 2;
    c.ctx.stroke();

    const text = s.finished
      ? 'SHIFT STEP CLOSED'
      : s.immersed
        ? '▼  RAISE WAFER — evaluate this bath'
        : '▲  LOWER WAFER — begin soak';
    label(c, text, x + w / 2, y + h / 2, {
      size: 15,
      color: canAct ? C.text : C.textDim,
      align: 'center',
      weight: '700',
      font: MONO,
    });

    label(
      c,
      canAct ? 'click the tank column to set its heater · click the button to immerse or withdraw' : '',
      x,
      y + h + 16,
      { size: 10, color: C.textDim },
    );
  }

  private paintVerdict(c: PanelCtx): void {
    const r = this.sim.result;
    if (!r) return;
    roundRect(c.ctx, 0, 0, W, H, 6);
    c.ctx.fillStyle = 'rgba(8, 11, 16, 0.88)';
    c.ctx.fill();

    const color = r.success ? C.good : r.irreversible ? C.bad : C.warn;
    label(c, r.success ? 'CLEAN COMPLETE' : r.irreversible ? 'WAFER SCRAPPED' : 'OUT OF SPEC', W / 2, 120, {
      size: 30,
      color,
      align: 'center',
      weight: '700',
    });
    label(c, `quality ${(r.quality * 100).toFixed(0)}%`, W / 2, 158, { size: 15, color: C.text, align: 'center', font: MONO });

    // Wrap the explanation across the panel.
    let y = 220;
    for (const line of wrap(r.detail, 78)) {
      label(c, line, W / 2, y, { size: 14, color: C.text, align: 'center' });
      y += 22;
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}

const inBand = (t: number, spec: { min: number; max: number }): boolean => t >= spec.min && t <= spec.max;

/**
 * Word-wrap to a character count.
 *
 * Panels mix monospace and proportional faces, so a char count is an
 * approximation — good enough for the wrapped bodies on these screens, and it
 * keeps layout code from having to measure text on every repaint.
 */
export function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}