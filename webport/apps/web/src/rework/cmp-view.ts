/**
 * CMP endpoint calibration — the reflectance-vs-time laser interferometer.
 *
 * The signal here has the feature the Unity version could not represent: a
 * knee where the oxide overburden clears and the Si3N4 stop layer is exposed.
 * Unity drew `sin(t*wave*2pi + phase) * gain * exp(-t*0.6)` — a damped sinusoid
 * with no endpoint in it — while scoring distance between three sliders and a
 * hidden reference. Score and picture were never reconciled.
 *
 * Here the three knobs are real instrument errors, and the picture is derived
 * from the same state the verdict uses.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js';
import {
  C,
  Panel,
  MONO,
  graticule,
  hline,
  label,
  meter,
  plate,
  roundRect,
  toY,
  trace,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { mountBench, pickPanel, type BenchMount } from '../ui/bench.js';
import { PROCESS } from '@wafers/sim';
import {
  CMP_GAIN_RANGE,
  CMP_PHASE_RANGE,
  CMP_TIME_LIMIT_SECONDS,
  CMP_WAVELENGTH_RANGE,
  reflectanceAt,
  type CmpAction,
  type CmpState,
  type ReworkMinigame,
} from '@wafers/sim';
import { wrap } from './rca-view.js';

const W = 1024;
const H = 512;

export class CmpBench {
  private readonly panel: Panel;
  private readonly sim: ReworkMinigame<CmpState, CmpAction>;
  private readonly mount: BenchMount;

  constructor(scene: Scene, sim: ReworkMinigame<CmpState, CmpAction>) {
    this.sim = sim;
    this.panel = new Panel('cmp-panel', { width: W, height: H, scale: 1.5 });
    this.mount = mountBench(scene, 'cmp', this.panel);

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      const at = pickPanel(scene, this.mount.screen, W, H);
      if (at) this.handleClick(at.px, at.py);
    });
  }

  setVisible(visible: boolean): void {
    this.mount.setVisible(visible);
  }

  /** Three horizontal knob tracks plus the lock button. */
  private handleClick(px: number, py: number): void {
    if (this.sim.finished) return;

    const track = (top: number) => py >= top && py <= top + 34 && px >= 200 && px <= 824;

    if (track(344)) {
      const t = Math.max(0, Math.min(1, (px - 200) / 624));
      this.sim.act({ type: 'setGain', value: CMP_GAIN_RANGE.min + t * (CMP_GAIN_RANGE.max - CMP_GAIN_RANGE.min) });
      return;
    }
    if (track(382)) {
      const t = Math.max(0, Math.min(1, (px - 200) / 624));
      this.sim.act({ type: 'setWavelength', value: CMP_WAVELENGTH_RANGE.min + t * (CMP_WAVELENGTH_RANGE.max - CMP_WAVELENGTH_RANGE.min) });
      return;
    }
    if (track(420)) {
      const t = Math.max(0, Math.min(1, (px - 200) / 624));
      this.sim.act({ type: 'setPhase', value: t * CMP_PHASE_RANGE.max });
      return;
    }
    if (py >= 452 && py <= 500 && px >= 700 && px <= W - 24) {
      this.sim.act({ type: 'lockEndpoint' });
    }
  }

  update(dt: number): void {
    this.sim.tick(dt);
    // Live instrument: temperature, traces and timers all change every frame, so
    // the panel must be invalidated or flush() early-returns on a stale image.
    this.panel.invalidate();
    this.panel.flush((c) => this.paint(c, this.sim.state));
  }

  private paint(c: PanelCtx, s: CmpState): void {
    plate(c);

    label(c, 'CMP LASER ENDPOINT — INTERFEROMETRIC CALIBRATION', 22, 26, {
      size: 16,
      color: C.text,
      weight: '700',
    });
    label(c, PROCESS.cmp.method, W - 22, 26, { size: 11, color: C.accent, align: 'right' });
    hline(c, 46);

    this.paintScope(c, s);
    this.paintKnobs(c, s);
    this.paintLock(c, s);

    if (this.sim.result) this.paintVerdict(c);
  }

  private paintScope(c: PanelCtx, s: CmpState): void {
    const x0 = 22;
    const y0 = 62;
    const w = W - 44;
    const h = 262;

    roundRect(c.ctx, x0, y0, w, h, 6);
    c.ctx.fillStyle = '#04070a';
    c.ctx.fill();
    c.ctx.strokeStyle = C.panelEdge;
    c.ctx.lineWidth = 1;
    c.ctx.stroke();

    const inner: PanelCtx = { ctx: c.ctx, w, h };
    c.ctx.save();
    c.ctx.translate(x0, y0);
    graticule(inner, 10, 5);
    c.ctx.restore();

    // Time axis runs to a little past the endpoint so the knee is visible.
    const horizon = Math.max(s.true_.endpointSeconds * 1.6, s.elapsedSeconds * 1.05, 1);
    const rLo = 0;
    const rHi = (PROCESS.cmp.reflectanceNitride - PROCESS.cmp.reflectanceOxide) * 1.6 + PROCESS.cmp.reflectanceOxide;

    const yOf = (r: number) => y0 + toY(inner, r, rLo, rHi, 16);
    const xOf = (t: number) => x0 + 6 + (t / horizon) * (w - 12);

    // Reflectance plateaus, labelled — this is what makes the knee legible.
    const yOx = yOf(PROCESS.cmp.reflectanceOxide);
    const yNi = yOf(PROCESS.cmp.reflectanceNitride);
    for (const [y, text, col] of [
      [yOx, `${PROCESS.cmp.layerPolished} in polish`, C.textDim],
      [yNi, `${PROCESS.cmp.stopLayer} stop layer exposed`, C.accent],
    ] as const) {
      c.ctx.save();
      c.ctx.strokeStyle = col;
      c.ctx.setLineDash([5, 5]);
      c.ctx.lineWidth = 1;
      c.ctx.beginPath();
      c.ctx.moveTo(x0 + 4, y);
      c.ctx.lineTo(x0 + w - 4, y);
      c.ctx.stroke();
      c.ctx.restore();
      label(c, text, x0 + w - 8, y - 9, { size: 10, color: col, align: 'right' });
    }

    // The trace itself: oxide plateau, a sharp knee, nitride plateau.
    const pts: number[] = [];
    for (let i = 0; i <= w; i += 1) {
      const t = (i / (w - 12)) * horizon;
      // Invert the linear removal to get remaining thickness at time t.
      const elapsed = Math.min(t, s.true_.endpointSeconds);
      const remaining = s.true_.remainingNm + (PROCESS.cmp.endpointRemainingNm - s.true_.remainingNm) * (elapsed / Math.max(s.true_.endpointSeconds, 1e-6));
      pts.push(x0 + i, yOf(reflectanceAt(Math.max(0, remaining))));
    }
    trace(c, pts, C.trace, 2);

    // Playhead.
    const px = xOf(Math.min(s.elapsedSeconds, horizon));
    c.ctx.save();
    c.ctx.strokeStyle = C.warn;
    c.ctx.lineWidth = 2;
    c.ctx.beginPath();
    c.ctx.moveTo(px, y0);
    c.ctx.lineTo(px, y0 + h);
    c.ctx.stroke();
    c.ctx.restore();

    // Operator's committed reading, once locked.
    if (s.lockedEndpointSeconds !== null) {
      const lx = xOf(s.lockedEndpointSeconds);
      c.ctx.save();
      c.ctx.strokeStyle = C.bad;
      c.ctx.lineWidth = 2;
      c.ctx.setLineDash([4, 3]);
      c.ctx.beginPath();
      c.ctx.moveTo(lx, y0);
      c.ctx.lineTo(lx, y0 + h);
      c.ctx.stroke();
      c.ctx.restore();
    }

    label(c, `${horizon.toFixed(0)} s`, x0 + w - 8, y0 + h - 10, { size: 10, color: C.textDim, align: 'right', font: MONO });
    label(c, `remaining ${s.true_.remainingNm.toFixed(0)} nm`, x0 + 8, y0 + h - 10, { size: 10, color: C.textDim, font: MONO });
    label(c, `over-polish ${s.overPolishSeconds.toFixed(2)} s`, x0 + 8, y0 + 14, {
      size: 10,
      color: s.overPolishSeconds > 0 ? C.bad : C.textDim,
      font: MONO,
    });
  }

  private paintKnobs(c: PanelCtx, s: CmpState): void {
    const knob = (
      top: number,
      caption: string,
      reading: string,
      fraction: number,
      hint: string,
    ) => {
      label(c, caption, 30, top + 17, { size: 12, color: C.text });
      meter(c, 200, top + 6, 624, 22, fraction, { color: C.accent });
      value(c, reading, W - 24, top + 17, { color: C.text });
      label(c, hint, 200, top + 40, { size: 10, color: C.textDim, font: MONO });
    };

    knob(
      344,
      'DETECTOR GAIN',
      s.calibration.gain.toFixed(2),
      (s.calibration.gain - CMP_GAIN_RANGE.min) / (CMP_GAIN_RANGE.max - CMP_GAIN_RANGE.min),
      `sets the noise floor — too low and the knee cannot be located`,
    );
    knob(
      382,
      'LASER WAVELENGTH',
      String(s.calibration.wavelength),
      (s.calibration.wavelength - CMP_WAVELENGTH_RANGE.min) / (CMP_WAVELENGTH_RANGE.max - CMP_WAVELENGTH_RANGE.min),
      'scales every thickness reading — a systematic error',
    );
    knob(
      420,
      'PHASE',
      `${((s.calibration.phase * 180) / Math.PI).toFixed(0)}°`,
      s.calibration.phase / CMP_PHASE_RANGE.max,
      'fringe origin — a pure offset error',
    );
  }

  private paintLock(c: PanelCtx, s: CmpState): void {
    const x = 700;
    const y = 452;
    const w = W - 24 - x;
    const h = 48;
    const enabled = !this.sim.finished;

    roundRect(c.ctx, x, y, w, h, 8);
    c.ctx.fillStyle = enabled ? '#1d3a2a' : '#1b1f26';
    c.ctx.fill();
    c.ctx.strokeStyle = enabled ? C.good : C.panelEdge;
    c.ctx.lineWidth = 2;
    c.ctx.stroke();
    label(c, '✓ LOCK ENDPOINT', x + w / 2, y + h / 2, {
      size: 14,
      color: enabled ? C.good : C.textDim,
      align: 'center',
      weight: '700',
      font: MONO,
    });

    const left = Math.max(0, CMP_TIME_LIMIT_SECONDS - s.elapsedSeconds);
    label(c, 'SHIFT CLOCK', 30, 462, { size: 12, color: C.text });
    meter(c, 30, 478, 600, 16, left / CMP_TIME_LIMIT_SECONDS, {
      color: left < 10 ? C.bad : left < 20 ? C.warn : C.accent,
    });
    value(c, `${left.toFixed(1)} s`, 660, 486, { color: left < 10 ? C.bad : C.text });
  }

  private paintVerdict(c: PanelCtx): void {
    const r = this.sim.result;
    if (!r) return;
    roundRect(c.ctx, 0, 0, W, H, 6);
    c.ctx.fillStyle = 'rgba(8, 11, 16, 0.9)';
    c.ctx.fill();

    const color = r.success ? C.good : r.irreversible ? C.bad : C.warn;
    const headline =
      r.outcome === 'timeout'
        ? 'CLOCK EXPIRED'
        : r.success
          ? 'ENDPOINT LOCKED — BRAKE ARMED'
          : r.irreversible
            ? 'NITRIDE ERODED — SCRAP'
            : 'LOCK OUT OF SPEC';
    label(c, headline, W / 2, 118, { size: 26, color, align: 'center', weight: '700' });
    label(c, `quality ${(r.quality * 100).toFixed(0)}%`, W / 2, 156, {
      size: 15,
      color: C.text,
      align: 'center',
      font: MONO,
    });

    let y = 216;
    for (const line of wrap(r.detail, 78)) {
      label(c, line, W / 2, y, { size: 14, color: C.text, align: 'center' });
      y += 22;
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}