/**
 * The traveler clipboard (GDD §13).
 *
 * A physical folder on the bench carrying the paperwork the player works from:
 * the lot profile, the target doping specs, the work-function metal requirement,
 * and the operational rules that change every day. GDD §9 makes the rule matrix
 * the thing that actually shifts between days, so the rules are printed here in
 * full rather than being implicit in the config.
 *
 * This is where a player is meant to lose: the clipboard never tells you the
 * defect, only what the wafer is supposed to be and what today's rules are.
 */

import {
  C,
  MONO,
  Panel,
  hline,
  label,
  plate,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { mountClipboard, type BenchMount } from '../ui/bench.js';
import { LAYER_LABELS } from '@wafers/sim';
import type { DayConfig, DefectProfile, RuleMatrix } from '@wafers/data';
import type { Scene } from '@babylonjs/core/scene.js';
import { LAYOUT, TRAVELER_YAW } from './bay.js';

const W = 700;
const H = 900;

/** Physical clipboard proportions: a letter-ish sheet, portrait, held at an angle. */
export class TravelerView {
  private readonly panel: Panel;
  private readonly mount: BenchMount;

  private day: DayConfig | null = null;
  private rules: RuleMatrix | null = null;
  private defects: readonly DefectProfile[] = [];
  private phase: string = 'Briefing';
  private waferIndex = 0;
  private totalWafers = 0;
  private routingStep: keyof typeof LAYER_LABELS | null = null;
  private lastStamp: string | null = null;
  private lastStampColor: string = C.text;

  constructor(scene: Scene) {
    this.panel = new Panel('traveler-panel', { width: W, height: H, scale: 1.4 });
    // Laid flat on the bench (1.15 rad from vertical, ~24 degrees off horizontal).
    // A technician reads a traveler lying on the bench; standing it up on an easel
    // put 0.44 m of paper in front of the instrument rack and covered the
    // Stylus Profilometer screen, which is the first tool Day 1 asks you to run.
    this.mount = mountClipboard(scene, 'traveler', this.panel, 0.34, 0.44, 1.15);
    this.mount.root.position = LAYOUT.traveler.clone();
    this.mount.root.rotation.y = TRAVELER_YAW;
    this.panel.invalidate();
  }

  setShiftContext(day: DayConfig, rules: RuleMatrix, defects: readonly DefectProfile[]): void {
    this.day = day;
    this.rules = rules;
    this.defects = defects;
    this.panel.invalidate();
  }

  setPhase(phase: string): void {
    this.phase = phase;
    this.panel.invalidate();
  }

  setWafer(index: number, total: number, routingStep: keyof typeof LAYER_LABELS | null): void {
    this.waferIndex = index;
    this.totalWafers = total;
    this.routingStep = routingStep;
    this.lastStamp = null;
    this.panel.invalidate();
  }

  /** Stamp feedback on the routing card. `color` is a CSS hex from the caller. */
  setStamp(text: string, color: string): void {
    this.lastStamp = text;
    this.lastStampColor = color;
    this.panel.invalidate();
  }

  setVisible(visible: boolean): void {
    this.mount.setVisible(visible);
  }

  update(): void {
    this.panel.flush((c) => this.paint(c));
  }

  private paint(c: PanelCtx): void {
    // Paper, not glass. A traveler is printed on a folder.
    c.ctx.fillStyle = '#a49d8b';
    c.ctx.fillRect(0, 0, c.w, c.h);
    // Faint fibre texture so the sheet does not read as flat white.
    c.ctx.globalAlpha = 0.05;
    c.ctx.strokeStyle = '#6d6552';
    for (let i = 0; i < 60; i++) {
      const y = (i * 37) % c.h;
      c.ctx.beginPath();
      c.ctx.moveTo(0, y);
      c.ctx.lineTo(c.w, y + 4);
      c.ctx.stroke();
    }
    c.ctx.globalAlpha = 1;

    const ink = '#20242c';
    const dim = '#5d6470';
    const red = '#a8322a';
    const M = 34;

    label(c, 'WAFERS PLEASE  ·  ROUTING TRAVELER', M, 40, { size: 17, color: ink, weight: '800' });
    c.ctx.strokeStyle = red;
    c.ctx.lineWidth = 2;
    c.ctx.beginPath();
    c.ctx.moveTo(M, 54);
    c.ctx.lineTo(c.w - M, 54);
    c.ctx.stroke();

    if (!this.day || !this.rules) {
      label(c, 'NO LOT ASSIGNED', M, 120, { size: 15, color: dim, font: MONO });
      return;
    }

    // --- header block -----------------------------------------------------
    let y = 84;
    label(c, 'LOT', M, y, { size: 11, color: dim, weight: '700' });
    label(c, `LOT-${this.day.dayNumber}${String(this.waferIndex + 1).padStart(3, '0')}`, M + 62, y, {
      size: 15,
      color: ink,
      font: MONO,
      weight: '700',
    });
    label(c, 'WAFER', c.w - M, y, { size: 11, color: dim, align: 'right', weight: '700' });
    label(c, `${Math.max(0, this.waferIndex + 1)} / ${this.totalWafers}`, c.w - M, y, {
      size: 15,
      color: ink,
      align: 'right',
      font: MONO,
      weight: '700',
    });

    y += 26;
    label(c, 'SHIFT PHASE', M, y, { size: 11, color: dim, weight: '700' });
    label(c, this.phase.toUpperCase(), M + 92, y, { size: 13, color: ink, font: MONO, weight: '700' });

    y += 40;
    // --- routing step -----------------------------------------------------
    y += 18;
    label(c, 'ROUTING STEP', M, y, { size: 11, color: dim, weight: '700' });
    label(c, this.routingStep ? LAYER_LABELS[this.routingStep] : '—', M, y + 20, { size: 15, color: ink, weight: '700' });

    // --- target specs -----------------------------------------------------
    y += 62;
    label(c, 'TARGET DOPING SPECS', M, y, { size: 11, color: dim, weight: '700' });
    hline(c, y + 10, 'rgba(32,36,44,0.35)');
    y += 32;
    const specs: Array<[string, string]> = [
      ['Gate dielectric', 'Hafnium Oxide, EOT 1.2 nm (ALD, 12 cycles)'],
      ['Work-function metal', this.day.dayNumber >= 2 ? 'TiN (PMOS) / TiAl (NMOS)' : 'Poly-Si / TiN'],
      ['Gate pitch', '65 nm (45 nm node half-pitch)'],
      ['Sheet resistance', '28 – 42 ohm/sq'],
      ['Surface flatness', 'BOW within ± 400 nm'],
      ['Interface RMS', '0 – 0.9 nm'],
      ['Contact fill', 'W plug, keyhole-free core'],
    ];
    for (const [k, v] of specs) {
      label(c, k, M, y, { size: 12, color: dim });
      label(c, v, M + 168, y, { size: 12, color: ink, font: MONO });
      y += 21;
    }

    // --- today's operational rules (GDD §9) --------------------------------
    y += 14;
    label(c, `OPERATIONAL RULES — DAY ${this.day.dayNumber}`, M, y, { size: 11, color: red, weight: '800' });
    hline(c, y + 10, 'rgba(168,50,42,0.4)');
    y += 32;
    for (const rule of this.rules.rules) {
      const profile = this.defects.find((d) => d.id === rule.defect);
      const name = profile?.displayName ?? rule.defect;
      c.ctx.fillStyle = actionColor(rule.correctAction);
      roundRectFill(c, M, y - 11, 74, 22, 3);
      label(c, rule.correctAction.toUpperCase(), M + 37, y, {
        size: 12,
        color: '#f4f1e8',
        align: 'center',
        font: MONO,
        weight: '800',
      });
      label(c, name, M + 86, y, { size: 12, color: ink, weight: '600' });
      // The metrology the traveler demands — this is what the player must run
      // to stay compliant, printed so it is checkable against the instruments.
      if (profile) {
        label(c, `via ${profile.requiredTool}`, c.w - M, y, { size: 11, color: dim, align: 'right', font: MONO });
      }
      y += 26;
    }

    y += 6;
    label(c, 'CLEAN WAFER', M, y, { size: 11, color: dim, weight: '700' });
    c.ctx.fillStyle = '#2f7d4f';
    roundRectFill(c, M + 108, y - 11, 74, 22, 3);
    label(c, 'ACCEPT', M + 145, y, { size: 12, color: '#f4f1e8', align: 'center', font: MONO, weight: '800' });

    // --- stamp imprint ----------------------------------------------------
    if (this.lastStamp) {
      c.ctx.save();
      c.ctx.globalAlpha = 0.72;
      c.ctx.translate(c.w * 0.5, 806);
      c.ctx.rotate(-0.16);
      c.ctx.strokeStyle = this.lastStampColor;
      c.ctx.lineWidth = 5;
      c.ctx.font = `800 52px ${MONO}`;
      c.ctx.textAlign = 'center';
      c.ctx.textBaseline = 'middle';
      c.ctx.strokeText(this.lastStamp, 0, 0);
      c.ctx.fillStyle = this.lastStampColor;
      c.ctx.globalAlpha = 0.2;
      c.ctx.fillText(this.lastStamp, 0, 0);
      c.ctx.restore();
    }

    // --- sign-off box -----------------------------------------------------
    c.ctx.strokeStyle = 'rgba(32,36,44,0.4)';
    c.ctx.lineWidth = 1;
    c.ctx.strokeRect(M, 836, c.w - M * 2, 44);
    label(c, 'OPERATOR SIGN-OFF', M + 10, 858, { size: 11, color: dim, weight: '700' });
    value(c, this.lastStamp ? this.lastStamp : '—', c.w - M - 10, 858, { size: 13, color: this.lastStampColor });
  }
}

function actionColor(action: string): string {
  if (action === 'Accept') return '#2f7d4f';
  if (action === 'Reject') return '#a8322a';
  return '#9a6a15';
}

function roundRectFill(c: PanelCtx, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  c.ctx.beginPath();
  c.ctx.moveTo(x + rr, y);
  c.ctx.arcTo(x + w, y, x + w, y + h, rr);
  c.ctx.arcTo(x + w, y + h, x, y + h, rr);
  c.ctx.arcTo(x, y + h, x, y, rr);
  c.ctx.arcTo(x, y, x + w, y, rr);
  c.ctx.closePath();
  c.ctx.fill();
}

export { plate as travelerPlate };