import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import type { Campaign } from '@wafers/sim';
import { COLORS, matte } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';

/** Campaign day board — unlock / retry / advance (GDD §9). */
export class ProgressionBoard {
  readonly root: TransformNode;
  readonly dayButtons: AbstractMesh[] = [];
  readonly retryBtn: AbstractMesh;
  readonly nextBtn: AbstractMesh;
  private tex: DynamicTexture;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('progression', scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(0, 1.9, -0.55);
    this.root.setEnabled(false);

    const board = CreateBox('progBoard', { width: 1.1, height: 0.55, depth: 0.03 }, scene);
    board.parent = this.root;
    this.tex = applyLabel(board, scene, {
      width: 768,
      height: 384,
      font: 'bold 22px monospace',
      lines: ['CAMPAIGN'],
      lineHeight: 28,
    });
    board.isPickable = false;

    for (let d = 1; d <= 3; d++) {
      const btn = CreateBox(`progDay${d}`, { width: 0.22, height: 0.07, depth: 0.04 }, scene);
      btn.parent = this.root;
      btn.position.set(-0.35 + (d - 1) * 0.28, -0.22, 0.04);
      btn.material = matte(scene, `progDayMat${d}`, COLORS.accent, 0.3);
      btn.isPickable = true;
      btn.metadata = { interact: 'progDay', day: d };
      applyLabel(btn, scene, {
        width: 128,
        height: 48,
        fill: '#143028',
        ink: '#dfffee',
        align: 'center',
        font: 'bold 18px monospace',
        lines: [`DAY ${d}`],
        lineHeight: 22,
      });
      this.dayButtons.push(btn);
    }

    this.retryBtn = CreateBox('progRetry', { width: 0.22, height: 0.07, depth: 0.04 }, scene);
    this.retryBtn.parent = this.root;
    this.retryBtn.position.set(-0.2, -0.38, 0.04);
    this.retryBtn.material = matte(scene, 'progRetryMat', COLORS.warn, 0.35);
    this.retryBtn.isPickable = true;
    this.retryBtn.metadata = { interact: 'progRetry' };
    applyLabel(this.retryBtn, scene, {
      width: 128,
      height: 48,
      fill: '#403010',
      ink: '#ffe8c0',
      align: 'center',
      font: 'bold 16px monospace',
      lines: ['RETRY'],
      lineHeight: 22,
    });

    this.nextBtn = CreateBox('progNext', { width: 0.28, height: 0.07, depth: 0.04 }, scene);
    this.nextBtn.parent = this.root;
    this.nextBtn.position.set(0.25, -0.38, 0.04);
    this.nextBtn.material = matte(scene, 'progNextMat', COLORS.accent, 0.4);
    this.nextBtn.isPickable = true;
    this.nextBtn.metadata = { interact: 'progNext' };
    applyLabel(this.nextBtn, scene, {
      width: 160,
      height: 48,
      fill: '#143028',
      ink: '#dfffee',
      align: 'center',
      font: 'bold 16px monospace',
      lines: ['NEXT DAY'],
      lineHeight: 22,
    });
  }

  show(campaign: Campaign): void {
    const summary = campaign.summary();
    const lines = ['THREE-DAY TRAINING CAMPAIGN', `Boosts banked: ${campaign.boosts}`, ''];
    for (const s of summary) {
      const mark =
        s.status === 'passed' ? 'PASS' : s.status === 'failed' ? 'FAIL' : s.status === 'available' ? 'OPEN' : 'LOCK';
      lines.push(
        `Day ${s.dayNumber} [${mark}]  gate $${s.salaryTarget} / ${Math.round(s.competencyTarget * 100)}%` +
          (s.passed === null ? '' : `  score ${Math.round((s.competencyScore ?? 0) * 100)}%`),
      );
    }
    if (campaign.isCertified) lines.push('', 'CERTIFIED — Day 3 dual gate cleared.');
    rewriteLabel(this.tex, {
      width: 768,
      height: 384,
      font: 'bold 20px monospace',
      lines,
      lineHeight: 28,
    });

    for (let i = 0; i < this.dayButtons.length; i++) {
      const status = campaign.statusOf(i + 1);
      const btn = this.dayButtons[i]!;
      const mat = btn.material as ReturnType<typeof matte>;
      const open = status === 'available' || status === 'passed' || status === 'failed';
      btn.isPickable = open;
      mat.emissiveColor = open ? COLORS.accent.scale(0.4) : COLORS.bench.scale(0.05);
    }
    const canNext = campaign.statusOf(campaign.dayNumber) === 'passed' && campaign.dayNumber < 3;
    this.nextBtn.setEnabled(canNext);
    this.retryBtn.setEnabled(true);
    this.root.setEnabled(true);
  }

  hide(): void {
    this.root.setEnabled(false);
  }
}
