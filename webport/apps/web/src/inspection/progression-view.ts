/**
 * The progression board (GDD §9).
 *
 * Shown between days. GDD §9 frames the three days as a ramp — "onboarding",
 * "strict parametric speed evaluations", "certification" — and this board is
 * where that ramp becomes visible: which day you are on, what each day asks of
 * you, what you scored, and what is still locked.
 *
 * Deliberately not a menu. GDD §13 forbids floating HUD and video-game menu
 * bars, so this is a wall-mounted shift board in the same bay as the briefing and
 * the incident printer, and you walk up to it.
 *
 * It also reports the certification outcome, because GDD §9 calls Day 3
 * "Certification" and gates it behind "Pass both gates to certify" — the run has
 * an ending, and this is where you find out what it was.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import {
  C,
  MONO,
  Panel,
  SANS,
  hline,
  label,
  plate,
  type PanelCtx,
} from '../ui/panel.js';
import { screenFromPanel } from '../scene.js';
import { painted } from '../scene/lighting.js';
import { LAYOUT } from './bay.js';
import { wrap } from '../rework/rca-view.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Campaign } from '@wafers/sim';

const PW = 1024;
const PH = 620;

export class ProgressionBoard {
  private readonly panel: Panel;
  private readonly screen: AbstractMesh;
  private readonly slab: AbstractMesh;

  private campaign: Campaign | null = null;
  private showResults = false;

  constructor(scene: Scene) {
    this.panel = new Panel('progression-panel', { width: PW, height: PH, scale: 1.3 });

    // Centred on the wall, the same spot as the briefing and incident boards.
    // Those are all mutually exclusive by phase, so sharing the mount is safe and
    // keeps the record board dead ahead of the operator rather than off to one side.
    this.slab = CreateBox('progression-slab', { width: 1.86, height: 1.16, depth: 0.05 }, scene);
    this.slab.position = LAYOUT.board.add(new Vector3(0, 0, 0.045));
    this.slab.material = painted(scene, 'progression-slab-mat', '#1f232b', 0.6);

    this.screen = screenFromPanel(scene, this.panel.texture, 'progression-screen', 1.76, 1.06);
    this.screen.position = LAYOUT.board.clone();

    this.setVisible(false);
  }

  setCampaign(campaign: Campaign, showResults = false): void {
    this.campaign = campaign;
    this.showResults = showResults;
    this.panel.invalidate();
  }

  setVisible(visible: boolean): void {
    this.screen.setEnabled(visible);
    this.slab.setEnabled(visible);
  }

  get isVisible(): boolean {
    return this.screen.isEnabled();
  }

  update(): void {
    if (!this.screen.isEnabled()) return;
    this.panel.flush((c) => this.paint(c));
  }

  private paint(c: PanelCtx): void {
    plate(c, 6);
    const camp = this.campaign;
    if (!camp) {
      label(c, 'NO PROGRESSION LOADED', c.w / 2, c.h / 2, { size: 18, color: C.textDim, align: 'center', font: MONO });
      return;
    }

    const certified = camp.isCertified;
    label(c, 'FAB TRAINING RECORD', 34, 40, { size: 22, color: C.accent, weight: '800' });
    label(
      c,
      certified ? 'CERTIFIED' : camp.isComplete ? 'CERTIFICATION FAILED' : `DAY ${camp.dayNumber} OF 3`,
      c.w - 34,
      40,
      { size: 20, color: certified ? C.good : C.warn, align: 'right', weight: '800' },
    );
    hline(c, 56, C.panelEdgeLit);

    // --- day rows ---------------------------------------------------------
    const rows = camp.summary();
    let y = 92;
    label(c, 'DAY', 34, y, { size: 12, color: C.textDim, weight: '800', font: MONO });
    label(c, 'FOCUS', 96, y, { size: 12, color: C.textDim, weight: '800', font: MONO });
    label(c, 'TARGETS', 560, y, { size: 12, color: C.textDim, weight: '800', font: MONO });
    label(c, 'RESULT', 760, y, { size: 12, color: C.textDim, weight: '800', font: MONO });
    y += 8;
    hline(c, y, C.panelEdge);
    y += 24;

    for (const r of rows) {
      const isCurrent = r.dayNumber === camp.dayNumber && !certified;
      const colour =
        r.status === 'passed' ? C.good : r.status === 'available' ? C.text : r.status === 'failed' ? C.bad : C.textDim;

      // Day number, in a status chip.
      c.ctx.fillStyle = r.status === 'locked' ? 'rgba(44,53,66,0.5)' : `${colour}22`;
      roundRectFill(c, 32, y - 14, 52, 28, 4);
      label(c, String(r.dayNumber), 58, y, {
        size: 16,
        color: r.status === 'locked' ? C.textDim : colour,
        align: 'center',
        font: MONO,
        weight: '800',
      });

      // Focus line, wrapped to two lines max.
      let ty = y - 6;
      for (const seg of wrap(stripPrefix(r.title), 52).slice(0, 2)) {
        label(c, seg, 96, ty, { size: 14, color: r.status === 'locked' ? C.textDim : C.text, weight: '600' });
        ty += 18;
      }

      // Targets: both gates, because the GDD gates on both.
      label(c, `SAL ${r.salaryTarget}`, 560, y - 6, { size: 13, color: C.textDim, font: MONO });
      label(c, `COMP ${(r.competencyTarget * 100).toFixed(0)}%`, 660, y - 6, { size: 13, color: C.textDim, font: MONO });
      if (r.boostsEarned > 0) {
        label(c, `+${r.boostsEarned}`, 760, y - 6, { size: 12, color: C.warn, font: MONO });
      }

      // Result.
      const result =
        r.status === 'passed'
          ? `PASS  ${(r.competencyScore! * 100).toFixed(0)}%`
          : r.status === 'failed'
            ? 'FAIL'
            : r.status === 'locked'
              ? 'LOCKED'
              : isCurrent
                ? 'IN PROGRESS'
                : 'READY';
      label(c, result, 900, y - 6, {
        size: 14,
        color: colour,
        align: 'right',
        font: MONO,
        weight: '800',
      });

      y += 56;
      hline(c, y - 14, 'rgba(44,53,66,0.55)');
    }

    // --- standing ----------------------------------------------------------
    y += 14;
    const boosts = camp.boosts;
    label(c, 'PERMANENT COMPETENCY BOOSTS', 34, y, { size: 13, color: C.textDim, weight: '800' });
    label(c, boosts > 0 ? `+${boosts}` : 'NONE', 300, y, {
      size: 15,
      color: boosts > 0 ? C.warn : C.textDim,
      font: MONO,
      weight: '800',
    });
    if (boosts > 0) {
      label(c, 'earned from shift-end review, never spent', 380, y, { size: 12, color: C.textDim });
    }
    y += 30;

    // --- verdict -----------------------------------------------------------
    if (this.showResults || camp.isComplete) {
      const box = certified ? 'rgba(95,214,138,0.12)' : 'rgba(232,87,74,0.12)';
      c.ctx.fillStyle = box;
      c.ctx.fillRect(34, y, c.w - 68, 74);
      label(
        c,
        certified
          ? 'CERTIFIED FOR 45 nm BACK-END-OF-LINE INSPECTION'
          : 'NOT CERTIFIED — the run did not clear both gates on every day',
        48,
        y + 26,
        { size: 16, color: certified ? C.good : C.bad, weight: '800' },
      );
      const failing = camp.records.filter((r) => !r.passed).map((r) => `DAY ${r.dayNumber}`);
      const note = failing.length
        ? `Gates missed on ${failing.join(', ')}. A missed day can be replayed from the shift board.`
        : 'All three days passed both the salary and competency gates.';
      for (const seg of wrap(note, 108)) {
        label(c, seg, 48, y + 50, { size: 13, color: C.textDim });
      }
    } else {
      for (const seg of wrap(
        'Day 3 is certification. Clear BOTH the salary gate and the competency gate on all three days to be certified.',
        104,
      )) {
        label(c, seg, 34, y, { size: 13, color: C.textDim });
        y += 18;
      }
    }
  }
}

/** Briefing titles begin with "DAY n — ", which the table already shows. */
function stripPrefix(title: string): string {
  return title.replace(/^DAY\s*\d+\s*[-—]\s*/i, '').trim();
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

export { SANS as PROGRESSION_SANS };