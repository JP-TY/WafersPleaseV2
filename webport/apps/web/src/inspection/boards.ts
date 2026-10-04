/**
 * The shift briefing board and the end-of-shift incident printer (GDD §5, §11).
 *
 * Both are wall-mounted boards rather than overlays, for the same reason the
 * clipboard is a clipboard: GDD §13 forbids floating HUD elements.
 *
 * The briefing board carries the day's `briefingText` verbatim from the config
 * plus the day's operating rules. The incident printer carries the GDD §11
 * diagnostic sheet: each tracked competency with its value, its target, a plain
 * statement of the dominant error, and a remediation pointer. The GDD's example
 * feedback — "Operator frequently misidentified conductive Titanium bridging as
 * benign surface variance" — is the register the notes are written in.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import {
  C,
  MONO,
  Panel,
  SANS,
  hline,
  label,
  plate,
  value,
  type PanelCtx,
} from '../ui/panel.js';
import { screenFromPanel, matte } from '../scene.js';
import { wrap } from '../rework/rca-view.js';
import { LAYOUT } from './bay.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DebriefReport } from '@wafers/sim';
import type { DayConfig } from '@wafers/data';

const BW = 1024;
const BH = 620;

/** Shared board mounting: a panel on a wall-facing slab. */
function mountBoard(scene: Scene, name: string, panel: Panel, pos: Vector3): AbstractMesh {
  // Backing slab goes BEHIND the screen relative to the operator. Screens face
  // -Z, and the operator is at -Z, so "behind" is the larger +Z.
  const slab = CreateBox(`${name}-slab`, { width: 1.86, height: 1.16, depth: 0.05 }, scene);
  slab.position = pos.add(new Vector3(0, 0, 0.045));
  slab.material = matte(scene, `${name}-slab-mat`, new Color3(0.16, 0.17, 0.2), 0.12);
  const screen = screenFromPanel(scene, panel.texture, `${name}-screen`, 1.76, 1.06);
  screen.position = pos;
  return screen;
}

/** GDD §5 phase 1: the shift briefing. */
export class BriefingView {
  private readonly panel: Panel;
  private readonly mesh: AbstractMesh;
  private day: DayConfig | null = null;

  constructor(scene: Scene) {
    this.panel = new Panel('briefing-panel', { width: BW, height: BH, scale: 1.3 });
    this.mesh = mountBoard(scene, 'briefing', this.panel, LAYOUT.board.clone());
  }

  setDay(day: DayConfig): void {
    this.day = day;
    this.panel.invalidate();
  }

  setVisible(visible: boolean): void {
    this.mesh.setEnabled(visible);
    this.mesh.parent?.setEnabled(visible);
  }

  update(): void {
    this.panel.flush((c) => this.paint(c));
  }

  private paint(c: PanelCtx): void {
    plate(c, 6);
    if (!this.day) return;
    const d = this.day;

    label(c, `DAY ${d.dayNumber}  —  SHIFT BRIEFING`, 34, 46, { size: 26, color: C.accent, weight: '800' });
    label(c, `LOT SIZE ${d.wafersPerDay} WAFERS  ·  ${d.timeLimitMinutes} MIN  ·  SALARY TARGET ${d.salaryTarget}`, c.w - 34, 46, {
      size: 13,
      color: C.textDim,
      align: 'right',
      font: MONO,
    });
    hline(c, 66, C.panelEdgeLit);

    // briefingText is authored with real newlines; honour them rather than
    // re-wrapping, so the config stays readable as documentation.
    let y = 104;
    for (const line of d.briefingText.split('\n')) {
      if (!line.trim()) {
        y += 12;
        continue;
      }
      for (const seg of wrap(line, 96)) {
        label(c, seg, 34, y, { size: 17, color: C.text });
        y += 26;
      }
    }

    y += 18;
    hline(c, y - 14, C.panelEdge);

    // Dual gate reminder (GDD §10). Stated up front because the whole shift is
    // a tension between these two numbers.
    label(c, 'TO PASS THE SHIFT YOU MUST CLEAR BOTH GATES', 34, y + 6, { size: 15, color: C.warn, weight: '800' });
    y += 40;
    // Fixed columns: label left-aligned, value right-aligned, so neither can
    // collide with the next column regardless of digit count.
    label(c, 'SALARY TARGET', 34, y, { size: 13, color: C.textDim, weight: '700' });
    value(c, `${d.salaryTarget}`, 300, y, { size: 20, color: C.text });
    label(c, 'COMPETENCY TARGET', 380, y, { size: 13, color: C.textDim, weight: '700' });
    value(c, `${d.competencyTarget}%`, 700, y, { size: 20, color: C.text });

    // Tooling + defects for the day.
    y += 46;
    label(c, 'INSTRUMENTS', 34, y, { size: 13, color: C.textDim, weight: '700' });
    label(c, d.availableTools.join('  ·  '), 190, y, { size: 14, color: C.accent, font: MONO });
    y += 28;
    label(c, 'DEFECTS IN PLAY', 34, y, { size: 13, color: C.textDim, weight: '700' });
    label(c, d.allowedDefects.join('  ·  '), 190, y, { size: 14, color: C.text, font: MONO });

    // Prompt-fade state (GDD §12). The player should know the help is going
    // away, because that is the transition the whole progression is built on.
    y += 40;
    const mode =
      d.calloutMode === 'Always'
        ? 'Context callouts: ALWAYS SHOWN'
        : d.calloutMode === 'FirstOccurrencePerDefectClass'
          ? 'Context callouts: FIRST OCCURRENCE ONLY'
          : 'Context callouts: DISABLED — you are on your own';
    label(c, mode, 34, y, {
      size: 14,
      color: d.calloutMode === 'Disabled' ? C.bad : C.warn,
      font: MONO,
      weight: '700',
    });
  }
}

/**
 * GDD §11: the end-of-shift Incident Printer output.
 *
 * Prints on continuous paper the way a real diagnostic sheet does — monospaced,
 * ruled, with the competency table on the left and the analyst's note on the
 * right, so the note is read next to the number that justifies it.
 */
export class DebriefView {
  private readonly panel: Panel;
  private readonly mesh: AbstractMesh;
  private report: DebriefReport | null = null;

  constructor(scene: Scene) {
    this.panel = new Panel('debrief-panel', { width: BW, height: BH, scale: 1.3 });
    this.mesh = mountBoard(scene, 'debrief', this.panel, LAYOUT.board.clone());
    this.mesh.setEnabled(false);
    const slab = this.mesh.parent;
    slab?.setEnabled(false);
  }

  setReport(report: DebriefReport): void {
    this.report = report;
    this.panel.invalidate();
  }

  setVisible(visible: boolean): void {
    this.mesh.setEnabled(visible);
    this.mesh.parent?.setEnabled(visible);
  }

  update(): void {
    this.panel.flush((c) => this.paint(c));
  }

  private paint(c: PanelCtx): void {
    plate(c, 6);
    if (!this.report) return;
    const r = this.report;

    // Continuous-feed paper edge at the top, so it reads as a printout.
    c.ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < c.w; x += 14) c.ctx.fillRect(x, 0, 7, 8);

    label(c, 'INCIDENT PRINTER  ·  OPERATOR DIAGNOSTIC SHEET', 34, 42, {
      size: 22,
      color: C.accent,
      weight: '800',
    });
    label(c, r.passed ? 'SHIFT PASSED' : 'SHIFT FAILED', c.w - 34, 42, {
      size: 22,
      color: r.passed ? C.good : C.bad,
      align: 'right',
      weight: '800',
    });
    hline(c, 58, C.panelEdgeLit);

    // Headline: the one sentence the GDD §11 sheet exists to deliver.
    c.ctx.fillStyle = r.passed ? 'rgba(95,214,138,0.12)' : 'rgba(232,87,74,0.12)';
    c.ctx.fillRect(34, 72, c.w - 68, 44);
    label(c, r.headline, 48, 94, { size: 17, color: r.passed ? C.good : C.bad, weight: '700', font: SANS });

    // Gate totals.
    label(c, `SALARY ${r.salaryTotal.toLocaleString()}`, 48, 142, { size: 15, color: C.text, font: MONO, weight: '700' });
    label(c, `COMPETENCY ${(r.competencyScore * 100).toFixed(1)}%`, 300, 142, { size: 15, color: C.text, font: MONO, weight: '700' });

    // Competency table.
    let y = 186;
    label(c, 'TRACKED COMPETENCY', 48, y, { size: 13, color: C.textDim, weight: '800' });
    label(c, 'VALUE', 430, y, { size: 13, color: C.textDim, weight: '800', font: MONO });
    label(c, 'TARGET', 530, y, { size: 13, color: C.textDim, weight: '800', font: MONO });
    label(c, '', 610, y, { size: 13, color: C.textDim, weight: '800' });
    y += 12;
    hline(c, y, C.panelEdge);
    y += 22;

    for (const line of r.lines) {
      const pass = line.passed;
      // Bar: value against target, with the target as a tick on the track.
      label(c, line.competency, 48, y, { size: 14, color: C.text });
      value(c, `${(line.value * 100).toFixed(1)}%`, 500, y, { size: 14, color: pass ? C.good : C.bad });
      value(c, `${(line.target * 100).toFixed(0)}%`, 600, y, { size: 14, color: C.textDim });

      const bx = 620;
      const bw = c.w - bx - 48;
      c.ctx.fillStyle = C.panel;
      c.ctx.fillRect(bx, y - 7, bw, 14);
      c.ctx.fillStyle = pass ? C.good : C.bad;
      c.ctx.fillRect(bx, y - 7, bw * Math.max(0, Math.min(1, line.value)), 14);
      const tx = bx + bw * Math.max(0, Math.min(1, line.target));
      c.ctx.fillStyle = C.warn;
      c.ctx.fillRect(Math.round(tx), y - 11, 2, 22);

      y += 26;

      // The analyst's note, indented under its competency.
      for (const seg of wrap(line.note, 128)) {
        label(c, seg, 62, y, { size: 12, color: C.textDim });
        y += 17;
      }
      if (!pass) {
        for (const seg of wrap(`REMEDIATION: ${line.remediation}`, 128)) {
          label(c, seg, 62, y, { size: 12, color: C.accent });
          y += 17;
        }
      }
      y += 10;
      hline(c, y - 6, 'rgba(44,53,66,0.6)');
      y += 8;
    }

    if (y > c.h - 60) {
      c.ctx.fillStyle = 'rgba(255,255,255,0.06)';
      c.ctx.fillRect(c.w - 92, c.h - 30, 60, 20);
      label(c, 'CONT ▸', c.w - 62, c.h - 20, { size: 12, color: C.textDim, align: 'center', font: MONO });
    }
  }
}

export { C as DEBRIEF_C, MONO as DEBRIEF_MONO };