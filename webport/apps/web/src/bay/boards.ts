import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import type { DebriefReport } from '@wafers/sim';
import { COLORS, metal, lamp } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';

function wrap(text: string, width: number): string[] {
  const words = text.replace(/\n/g, ' ¶ ').split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (w === '¶') {
      if (cur) lines.push(cur);
      cur = '';
      continue;
    }
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

const BRIEF_W = 900;
const BRIEF_H = 600;

/** Diegetic briefing / break / debrief boards hung above the bay. */
export class PhaseBoards {
  readonly root: TransformNode;
  readonly beginButton: AbstractMesh;
  readonly resumeButton: AbstractMesh;
  readonly dismissButton: AbstractMesh;
  private briefingTex: DynamicTexture;
  private debriefTex: DynamicTexture;
  private briefingBoard: AbstractMesh;
  private briefingFrame: AbstractMesh;
  private beginLamp: AbstractMesh;
  private breakBoard: AbstractMesh;
  private debriefBoard: AbstractMesh;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('phaseBoards', scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(-0.15, 1.95, -0.55);
    // Tip toward the operator so text isn't foreshortened into illegibility.
    this.root.rotation.x = 0.12;

    this.briefingFrame = CreateBox('briefingFrame', { width: 1.42, height: 0.92, depth: 0.05 }, scene);
    this.briefingFrame.parent = this.root;
    this.briefingFrame.position.z = -0.02;
    this.briefingFrame.material = metal(scene, 'briefFrameMat', COLORS.rack, 0.3);
    this.briefingFrame.isPickable = false;

    this.briefingBoard = CreateBox('briefingBoard', { width: 1.35, height: 0.85, depth: 0.03 }, scene);
    this.briefingBoard.parent = this.root;
    this.briefingBoard.isPickable = false;
    this.briefingTex = applyLabel(this.briefingBoard, scene, {
      width: BRIEF_W,
      height: BRIEF_H,
      fill: '#f2ebe0',
      ink: '#1a1f28',
      font: 'bold 28px monospace',
      lines: ['SHIFT BRIEFING'],
      lineHeight: 34,
    });

    this.beginButton = CreateBox('beginShiftBtn', { width: 0.55, height: 0.14, depth: 0.07 }, scene);
    this.beginButton.parent = this.root;
    this.beginButton.position.set(0, -0.58, 0.06);
    this.beginButton.material = lamp(scene, 'beginMat', COLORS.accent, 0.75);
    this.beginButton.isPickable = true;
    this.beginButton.metadata = { interact: 'begin' };
    applyLabel(this.beginButton, scene, {
      width: 420,
      height: 110,
      fill: '#0e3a2a',
      ink: '#e8fff2',
      align: 'center',
      font: 'bold 40px monospace',
      lines: ['BEGIN SHIFT'],
      lineHeight: 48,
    });

    // Fat pick volume so the CTA is hard to miss.
    const beginProxy = CreateBox('beginShiftProxy', { width: 0.7, height: 0.22, depth: 0.16 }, scene);
    beginProxy.parent = this.beginButton;
    beginProxy.visibility = 0.001;
    beginProxy.isPickable = true;
    beginProxy.metadata = { interact: 'begin' };

    this.beginLamp = CreateBox('beginLamp', { width: 0.55, height: 0.02, depth: 0.02 }, scene);
    this.beginLamp.parent = this.root;
    this.beginLamp.position.set(0, -0.48, 0.08);
    this.beginLamp.material = lamp(scene, 'beginLampMat', COLORS.accent, 1.0);
    this.beginLamp.isPickable = false;

    this.breakBoard = CreateBox('breakBoard', { width: 0.85, height: 0.42, depth: 0.03 }, scene);
    this.breakBoard.parent = this.root;
    this.breakBoard.position.y = -0.05;
    applyLabel(this.breakBoard, scene, {
      width: 560,
      height: 280,
      fill: '#f2ebe0',
      font: 'bold 30px monospace',
      align: 'center',
      lines: ['BREAK', 'Stretch. Reset.', 'Resume when ready.'],
      lineHeight: 44,
    });
    this.breakBoard.isPickable = false;

    this.resumeButton = CreateBox('resumeBtn', { width: 0.36, height: 0.1, depth: 0.05 }, scene);
    this.resumeButton.parent = this.root;
    this.resumeButton.position.set(0, -0.38, 0.05);
    this.resumeButton.material = lamp(scene, 'resumeMat', COLORS.warn, 0.65);
    this.resumeButton.isPickable = true;
    this.resumeButton.metadata = { interact: 'resume' };
    applyLabel(this.resumeButton, scene, {
      width: 280,
      height: 80,
      fill: '#403010',
      ink: '#ffe8c0',
      align: 'center',
      font: 'bold 30px monospace',
      lines: ['RESUME'],
      lineHeight: 36,
    });

    this.debriefBoard = CreateBox('debriefBoard', { width: 1.25, height: 0.82, depth: 0.03 }, scene);
    this.debriefBoard.parent = this.root;
    this.debriefTex = applyLabel(this.debriefBoard, scene, {
      width: 820,
      height: 580,
      fill: '#f2ebe0',
      font: 'bold 22px monospace',
      lines: ['INCIDENT SHEET'],
      lineHeight: 28,
    });
    this.debriefBoard.isPickable = false;

    this.dismissButton = CreateBox('dismissBtn', { width: 0.36, height: 0.1, depth: 0.05 }, scene);
    this.dismissButton.parent = this.root;
    this.dismissButton.position.set(0, -0.52, 0.05);
    this.dismissButton.material = lamp(scene, 'dismissMat', COLORS.accent, 0.55);
    this.dismissButton.isPickable = true;
    this.dismissButton.metadata = { interact: 'dismiss' };
    applyLabel(this.dismissButton, scene, {
      width: 280,
      height: 80,
      fill: '#1a4030',
      ink: '#d8ffe8',
      align: 'center',
      font: 'bold 26px monospace',
      lines: ['ACKNOWLEDGE'],
      lineHeight: 34,
    });

    this.show('Briefing');
  }

  setBriefing(text: string): void {
    const body = wrap(text, 48).slice(0, 12);
    rewriteLabel(this.briefingTex, {
      width: BRIEF_W,
      height: BRIEF_H,
      fill: '#f2ebe0',
      ink: '#1a1f28',
      font: 'bold 26px monospace',
      lines: ['SHIFT BRIEFING', '—', ...body, '', '▼  PRESS BEGIN SHIFT'],
      lineHeight: 34,
    });
  }

  setDebrief(report: DebriefReport): void {
    const lines = [
      'INCIDENT PRINTER — SHIFT DEBRIEF',
      report.headline,
      report.passed ? 'GATE: PASSED' : 'GATE: FAILED',
      `Salary $${report.salaryTotal.toFixed(0)}  Competency ${Math.round(report.competencyScore * 100)}%`,
      '— COMPETENCIES —',
    ];
    for (const line of report.lines.slice(0, 5)) {
      lines.push(`${line.competency}: ${Math.round(line.value * 100)}% ${line.passed ? 'OK' : 'MISS'}`);
      lines.push(...wrap(line.note, 50).slice(0, 2));
    }
    if (report.teachingNotes.length) {
      lines.push('— TEACHING —');
      for (const note of report.teachingNotes.slice(0, 4)) {
        lines.push(...wrap(note, 50).slice(0, 2));
      }
    }
    rewriteLabel(this.debriefTex, {
      width: 820,
      height: 580,
      fill: '#f2ebe0',
      ink: '#1a1f28',
      font: 'bold 20px monospace',
      lines,
      lineHeight: 26,
    });
  }

  show(mode: 'Briefing' | 'Break' | 'Debrief' | 'Hidden'): void {
    const showFrame = mode === 'Briefing' || mode === 'Break' || mode === 'Debrief';
    this.briefingFrame.setEnabled(showFrame);
    this.briefingBoard.setEnabled(mode === 'Briefing');
    this.beginButton.setEnabled(mode === 'Briefing');
    this.beginLamp.setEnabled(mode === 'Briefing');
    this.breakBoard.setEnabled(mode === 'Break');
    this.resumeButton.setEnabled(mode === 'Break');
    this.debriefBoard.setEnabled(mode === 'Debrief');
    this.dismissButton.setEnabled(mode === 'Debrief');
  }

  /** Depress + flash BEGIN so the CTA feels responsive before the board hides. */
  flashBegin(): void {
    const btn = this.beginButton;
    const mat = btn.material as ReturnType<typeof lamp>;
    const lampMat = this.beginLamp.material as ReturnType<typeof lamp>;
    const restZ = 0.06;
    btn.position.z = 0.01;
    btn.scaling.set(1.04, 0.88, 1.04);
    mat.emissiveColor = COLORS.accent.scale(1.35);
    lampMat.emissiveColor = COLORS.accent.scale(1.6);
    const restore = () => {
      btn.position.z = restZ;
      btn.scaling.setAll(1);
      mat.emissiveColor = COLORS.accent.scale(0.75);
      lampMat.emissiveColor = COLORS.accent.scale(1.0);
    };
    if (typeof window !== 'undefined') window.setTimeout(restore, 140);
    else restore();
  }
}
