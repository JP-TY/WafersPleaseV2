/**
 * Silicide etch bench — the sheet-resistance oscilloscope.
 *
 * Draws R_s against anneal time with the real C49 -> C54 conversion curve, and
 * reports R_s in micro-ohm-cm against the literature values rather than through
 * an inverted mapping.
 *
 * The Unity original drew the curve correctly but printed the readout through
 * `1 - rs`, so C49 (Rs 0.85, high) showed ~5.7 ohm/sq and C54 (0.20, low) showed
 * ~15.2 — backwards. It also redrew a 360x150 texture with `SetPixel` every
 * frame; this is a single Path2D.
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
  vline,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { mountBench, pickPanel, type BenchMount } from '../ui/bench.js';
import { PROCESS, realSeconds } from '@wafers/sim';
import type { SilicideAction, SilicideEtchState, ReworkMinigame } from '@wafers/sim';
import { wrap } from './rca-view.js';

const W = 1024;
const H = 512;

const RS_MIN = 0;
const RS_MAX = 90;

const phaseColor = (p: string): string =>
  p === 'C49' ? C.good : p === 'Transition' ? C.warn : C.bad;

export class SilicideBench {
  private readonly panel: Panel;
  private readonly sim: ReworkMinigame<SilicideEtchState, SilicideAction>;
  private readonly mount: BenchMount;

  constructor(scene: Scene, sim: ReworkMinigame<SilicideEtchState, SilicideAction>) {
    this.sim = sim;
    this.panel = new Panel('silicide-panel', { width: W, height: H, scale: 1.5 });
    this.mount = mountBench(scene, 'silicide', this.panel);

    scene.onPointerObservable.add((info) => {
      if (info.type !== PointerEventTypes.POINTERDOWN) return;
      const at = pickPanel(scene, this.mount.screen, W, H);
      if (!at) return;
      const { px, py } = at;
      if (py >= 430 && py <= 490 && px >= 300 && px <= 724) {
        // WASH toggle
        this.sim.act(this.sim.state.washing ? { type: 'stopWash' } : { type: 'startWash' });
      } else if (py >= 415 && py <= 470 && px >= 740 && px <= W - 24) {
        this.sim.act({ type: 'commit' });
      }
    });
  }

  setVisible(visible: boolean): void {
    this.mount.setVisible(visible);
  }

  update(dt: number): void {
    this.sim.tick(dt);
    // Live instrument: temperature, traces and timers all change every frame, so
    // the panel must be invalidated or flush() early-returns on a stale image.
    this.panel.invalidate();
    this.panel.flush((c) => this.paint(c, this.sim.state));
  }

  private paint(c: PanelCtx, s: SilicideEtchState): void {
    plate(c);

    label(c, 'SELECTIVE SILICIDE WET ETCH — ELECTRON MICROSCOPE BENCH', 22, 26, {
      size: 16,
      color: C.text,
      weight: '700',
    });
    label(c, PROCESS.silicide.etchant, W - 22, 26, { size: 12, color: C.accent, align: 'right', font: MONO });
    hline(c, 46);

    this.paintPhaseBadge(c, s);
    this.paintScope(c, s);
    this.paintReadouts(c, s);
    this.paintControls(c, s);

    if (this.sim.result) this.paintVerdict(c);
  }

  private paintPhaseBadge(c: PanelCtx, s: SilicideEtchState): void {
    const y = 68;
    const color = phaseColor(s.reading.phase);
    roundRect(c.ctx, 22, y, 190, 34, 6);
    c.ctx.fillStyle = `${color}22`;
    c.ctx.fill();
    c.ctx.strokeStyle = color;
    c.ctx.lineWidth = 2;
    c.ctx.stroke();
    label(c, s.reading.phase, 117, y + 18, { size: 17, color, align: 'center', weight: '700', font: MONO });

    const note: Record<string, string> = {
      C49: 'Ti-rich, unreacted — strippable',
      Transition: 'conversion front sweeping — partial strip',
      C54: 'stable lattice — bridge is locked',
    };
    label(c, note[s.reading.phase] ?? '', 224, y + 12, { size: 12, color: C.textDim });
    label(
      c,
      s.reading.strippable ? 'WASH WINDOW OPEN' : 'WASH WINDOW CLOSED',
      224,
      y + 30,
      { size: 13, color: s.reading.strippable ? C.good : C.bad, weight: '700' },
    );

    value(c, `t = ${realSeconds(s.elapsedSeconds).toFixed(0)} s`, W - 22, y + 18, { color: C.text });
  }

  private paintScope(c: PanelCtx, s: SilicideEtchState): void {
    const x0 = 22;
    const y0 = 118;
    const w = W - 44;
    const h = 220;

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

    // Axis labels: R_s in micro-ohm-cm.
    for (const v of [0, 30, 60, 90]) {
      const y = y0 + toY(inner, v, RS_MIN, RS_MAX, 14);
      label(c, String(v), x0 + w - 6, y, { size: 10, color: C.textDim, align: 'right', font: MONO });
    }
    label(c, 'Rₛ  µΩ·cm', x0 + 8, y0 + 14, { size: 11, color: C.textDim, font: MONO });

    // Literature reference lines for each pure phase.
    for (const [v, text, col] of [
      [PROCESS.silicide.resistivityC49MicroOhmCm, 'C49  60–90', C.good],
      [PROCESS.silicide.resistivityC54MicroOhmCm, 'C54  12–15', C.bad],
    ] as const) {
      const y = y0 + toY(inner, v, RS_MIN, RS_MAX, 14);
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

    // The conversion curve. Sampled once per column — a single path.
    const tau = s.tauSeconds;
    const horizon = Math.max(tau * 4, s.elapsedSeconds * 1.05, 1);
    const pts: number[] = [];
    for (let i = 0; i <= w; i += 2) {
      const t = (i / w) * horizon;
      const f54 = 1 - Math.exp(-Math.pow(t / tau, PROCESS.silicide.avramiExponent));
      const rs = 1 / ((1 - f54) / PROCESS.silicide.resistivityC49MicroOhmCm + f54 / PROCESS.silicide.resistivityC54MicroOhmCm);
      pts.push(x0 + i, y0 + toY(inner, rs, RS_MIN, RS_MAX, 14));
    }
    trace(c, pts, C.trace, 2);

    // Playhead at the current time.
    const px = x0 + (s.elapsedSeconds / horizon) * w;
    c.ctx.save();
    c.ctx.strokeStyle = C.warn;
    c.ctx.lineWidth = 2;
    c.ctx.beginPath();
    c.ctx.moveTo(px, y0);
    c.ctx.lineTo(px, y0 + h);
    c.ctx.stroke();
    c.ctx.restore();

    // Live point.
    const rsNow = s.reading.sheetResistanceMicroOhmCm;
    const py = y0 + toY(inner, rsNow, RS_MIN, RS_MAX, 14);
    c.ctx.fillStyle = C.trace;
    c.ctx.beginPath();
    c.ctx.arc(px, py, 4, 0, Math.PI * 2);
    c.ctx.fill();

    // Filled region below the curve, for readability.
    c.ctx.save();
    c.ctx.globalAlpha = 0.14;
    c.ctx.fillStyle = C.trace;
    c.ctx.beginPath();
    c.ctx.moveTo(x0, y0 + h);
    for (let i = 0; i < pts.length; i += 2) c.ctx.lineTo(pts[i]!, pts[i + 1]!);
    c.ctx.lineTo(x0 + w, y0 + h);
    c.ctx.closePath();
    c.ctx.fill();
    c.ctx.restore();

    vline(c, px, C.warn, 1, [2, 3]);
    label(c, `${horizon.toFixed(0)} s`, x0 + w - 8, y0 + h - 10, { size: 10, color: C.textDim, align: 'right', font: MONO });
  }

  private paintReadouts(c: PanelCtx, s: SilicideEtchState): void {
    const y = 358;
    const cell = (x: number, caption: string, val: string, color: string) => {
      label(c, caption, x, y, { size: 11, color: C.textDim });
      value(c, val, x, y + 24, { color, align: 'left' });
    };

    cell(30, 'SHEET RESISTANCE', `${s.reading.sheetResistanceMicroOhmCm.toFixed(1)} µΩ·cm`, C.text);
    cell(300, 'C54 FRACTION', `${(s.reading.c54Fraction * 100).toFixed(1)} %`, C.text);
    cell(560, 'Ti CONTACT', `${s.contactNm.toFixed(1)} nm`, s.contactNm < 9 ? C.warn : C.text);

    // Contact thinning bar against the original 12 nm.
    label(c, 'contact loss', 800, y, { size: 11, color: C.textDim });
    meter(c, 800, y + 12, 190, 14, s.contactNm / PROCESS.silicide.contactThicknessNm, {
      color: s.contactNm < 9 ? C.warn : C.good,
    });
  }

  private paintControls(c: PanelCtx, s: SilicideEtchState): void {
    const y = 430;
    const h = 60;

    const button = (x: number, w: number, text: string, active: boolean, enabled: boolean, color: string) => {
      roundRect(c.ctx, x, y, w, h, 8);
      c.ctx.fillStyle = enabled ? (active ? `${color}33` : '#161c24') : '#1b1f26';
      c.ctx.fill();
      c.ctx.strokeStyle = enabled ? color : C.panelEdge;
      c.ctx.lineWidth = 2;
      c.ctx.stroke();
      label(c, text, x + w / 2, y + h / 2, {
        size: 14,
        color: enabled ? color : C.textDim,
        align: 'center',
        weight: '700',
        font: MONO,
      });
    };

    button(300, 424, s.washing ? '■ STOP ULTRASONIC' : '⚡ START ULTRASONIC', s.washing, !this.sim.finished, C.accent);
    button(740, W - 24 - 740, '✓ COMMIT & INSPECT', false, !this.sim.finished, C.good);

    if (s.washing) {
      label(c, `washing ${realSeconds(s.washSeconds).toFixed(1)} s — the bath is also eating the contact`, 300, y + h + 14, {
        size: 11,
        color: C.warn,
      });
    }
  }

  private paintVerdict(c: PanelCtx): void {
    const r = this.sim.result;
    if (!r) return;
    roundRect(c.ctx, 0, 0, W, H, 6);
    c.ctx.fillStyle = 'rgba(8, 11, 16, 0.9)';
    c.ctx.fill();

    const color = r.success ? C.good : r.irreversible ? C.bad : C.warn;
    label(
      c,
      r.success ? 'STRINGER STRIPPED' : r.irreversible ? 'SCRAPPED' : 'PARTIAL STRIP',
      W / 2,
      118,
      { size: 30, color, align: 'center', weight: '700' },
    );
    label(c, `quality ${(r.quality * 100).toFixed(0)}%`, W / 2, 156, { size: 15, color: C.text, align: 'center', font: MONO });

    let y = 218;
    for (const line of wrap(r.detail, 78)) {
      label(c, line, W / 2, y, { size: 14, color: C.text, align: 'center' });
      y += 22;
    }
  }

  dispose(): void {
    this.panel.dispose();
  }
}