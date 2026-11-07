import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import type { DayConfig, RuleMatrix } from '@wafers/data';
import type { StampFeedback, WaferPresentation } from '@wafers/sim';
import { COLORS, metal, paper, rubber } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > width) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** Physical traveler clipboard (GDD §13). */
export class Traveler {
  readonly root: TransformNode;
  readonly board: AbstractMesh;
  private tex: DynamicTexture;
  private day: DayConfig | null = null;
  private matrix: RuleMatrix | null = null;
  private wafer: WaferPresentation | null = null;
  private imprint: string[] = [];

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('traveler', scene);
    if (parent) this.root.parent = parent;
    // feel44 — further +X/+Z periphery; keep z>0.3 (playability vs stylus).
    this.root.position = new Vector3(1.05, 1.02, 0.92);
    // Slightly smaller / flatter pitch so Iris +X isn't a chalk billboard.
    this.root.scaling = new Vector3(0.82, 0.82, 0.82);

    const backer = CreateBox('travelerBacker', { width: 0.37, height: 0.01, depth: 0.48 }, scene);
    backer.parent = this.root;
    backer.rotation.x = -0.55;
    backer.material = metal(scene, 'travelerBackerMat', COLORS.housing, 0.22);
    backer.isPickable = false;

    // Thin raised lip + outer chamfer rail around the clipboard
    const lipMat = metal(scene, 'travelerLipMat', COLORS.housing.scale(0.9), 0.18);
    for (const [i, w, d, x, z] of [
      [0, 0.37, 0.01, 0, -0.235],
      [1, 0.37, 0.01, 0, 0.235],
      [2, 0.01, 0.46, -0.185, 0],
      [3, 0.01, 0.46, 0.185, 0],
    ] as const) {
      const lip = CreateBox(`travelerLip${i}`, { width: w, height: 0.014, depth: d }, scene);
      lip.parent = this.root;
      lip.position.set(x, 0.008, z);
      lip.rotation.x = -0.55;
      lip.material = lipMat;
      lip.isPickable = false;
    }
    for (const [i, w, d, x, z] of [
      [0, 0.38, 0.006, 0, -0.242],
      [1, 0.38, 0.006, 0, 0.242],
      [2, 0.006, 0.48, -0.192, 0],
      [3, 0.006, 0.48, 0.192, 0],
    ] as const) {
      const bevel = CreateBox(`travelerLipBevel${i}`, { width: w, height: 0.008, depth: d }, scene);
      bevel.parent = this.root;
      bevel.position.set(x, 0.014, z);
      bevel.rotation.x = -0.55;
      bevel.material = lipMat;
      bevel.isPickable = false;
    }

    const clipBar = CreateBox('travelerClipBar', { width: 0.32, height: 0.014, depth: 0.04 }, scene);
    clipBar.parent = this.root;
    clipBar.position.set(0, 0.026, -0.2);
    clipBar.rotation.x = -0.55;
    clipBar.material = metal(scene, 'travelerClipMat', COLORS.wallTrim, 0.45);
    clipBar.isPickable = false;

    const spring = CreateCylinder('travelerSpring', { diameter: 0.028, height: 0.03, tessellation: 12 }, scene);
    spring.parent = this.root;
    spring.position.set(0, 0.038, -0.2);
    spring.rotation.x = -0.55;
    spring.material = metal(scene, 'travelerSpringMat', new Color3(0.55, 0.58, 0.62), 0.5);
    spring.isPickable = false;

    // Clip teeth
    for (const sx of [-0.08, 0, 0.08] as const) {
      const tooth = CreateBox(`travelerTooth_${sx}`, { width: 0.022, height: 0.008, depth: 0.028 }, scene);
      tooth.parent = this.root;
      tooth.position.set(sx, 0.032, -0.175);
      tooth.rotation.x = -0.55;
      tooth.material = metal(scene, `travelerToothMat_${sx}`, COLORS.wallTrim, 0.5);
      tooth.isPickable = false;
    }

    for (const [i, sx, sz] of [
      [0, -0.16, 0.2],
      [1, 0.16, 0.2],
      [2, -0.16, -0.18],
      [3, 0.16, -0.18],
    ] as const) {
      const rivet = CreateCylinder(`travelerRivet${i}`, { diameter: 0.012, height: 0.01, tessellation: 8 }, scene);
      rivet.parent = this.root;
      rivet.position.set(sx, 0.02, sz);
      rivet.rotation.x = -0.55;
      rivet.material = metal(scene, `travelerRivetMat${i}`, COLORS.wallTrim, 0.55);
      rivet.isPickable = false;
    }

    // Paper stack under the top sheet
    const stack = CreateBox('travelerStack', { width: 0.33, height: 0.008, depth: 0.42 }, scene);
    stack.parent = this.root;
    stack.position.set(0, 0.012, 0.01);
    stack.rotation.x = -0.55;
    // feel44 — quieter paper (less chalk billboard in Iris +X).
    stack.material = paper(scene, 'travelerStackMat', new Color3(0.62, 0.6, 0.55));
    stack.isPickable = false;

    this.board = CreateBox('travelerBoard', { width: 0.34, height: 0.01, depth: 0.44 }, scene);
    this.board.parent = this.root;
    this.board.position.y = 0.02;
    this.board.rotation.x = -0.55;
    this.board.isPickable = true;
    this.board.metadata = { interact: 'traveler' };

    this.tex = applyLabel(this.board, scene, {
      width: 512,
      height: 640,
      fill: '#9a9488',
      ink: '#1a2430',
      font: 'bold 22px monospace',
      lines: ['LOT TRAVELER', 'Awaiting shift…'],
      lineHeight: 28,
    });

    // Corner rubber foot pads
    for (const [i, sx, sz] of [
      [0, -0.16, 0.22],
      [1, 0.16, 0.22],
    ] as const) {
      const foot = CreateCylinder(`travelerFoot${i}`, { diameter: 0.025, height: 0.01, tessellation: 8 }, scene);
      foot.parent = this.root;
      foot.position.set(sx, -0.01, sz);
      foot.material = rubber(scene, `travelerFootMat${i}`, new Color3(0.15, 0.16, 0.18));
      foot.isPickable = false;
    }
  }

  configure(day: DayConfig, matrix: RuleMatrix): void {
    this.day = day;
    this.matrix = matrix;
    this.imprint = [];
    this.repaint();
  }

  setWafer(wafer: WaferPresentation | null): void {
    this.wafer = wafer;
    this.repaint();
  }

  imprintFeedback(feedback: StampFeedback): void {
    if (feedback.correct) {
      this.imprint = ['STAMP: CORRECT', `→ ${feedback.correctAction}`];
    } else {
      const lines = [
        'STAMP: FAULT',
        `Needed ${feedback.correctAction}`,
        `Got ${feedback.playerAction}`,
        ...wrap(feedback.reasoning, 34).slice(0, 3),
      ];
      if (feedback.ruleText) lines.push(...wrap(feedback.ruleText, 34).slice(0, 4));
      if (feedback.defectIds.length) lines.push(`Defects: ${feedback.defectIds.join(', ')}`);
      this.imprint = lines;
    }
    this.repaint();
  }

  clearImprint(): void {
    this.imprint = [];
    this.repaint();
  }

  private repaint(): void {
    const lines: string[] = [];
    if (this.day) {
      lines.push(`DAY ${this.day.dayNumber} LOT TRAVELER`);
      lines.push(`LOT  ${this.day.id}`);
      lines.push(`GATE $${this.day.salaryTarget} / ${this.day.competencyTarget}%`);
      lines.push('— RULES —');
      for (const r of this.matrix?.rules.slice(0, 4) ?? []) {
        lines.push(`${r.defect}`);
        lines.push(`  → ${r.correctAction}`);
        if (r.ruleText) lines.push(...wrap(r.ruleText, 36).slice(0, 2).map((s) => `  ${s}`));
      }
    }
    if (this.wafer) {
      lines.push('— WAFER —');
      lines.push(`#${this.wafer.index + 1} / ${this.wafer.totalWafers}`);
      lines.push(`Step: ${this.wafer.routingStep}`);
      lines.push(`Metrology: ${this.wafer.requiredMetrology.join(', ') || 'none'}`);
      lines.push(`Salary $${this.wafer.salarySoFar.toFixed(0)}  OK ${this.wafer.correctSoFar}`);
    }
    if (this.imprint.length) {
      lines.push('— LAST STAMP —');
      lines.push(...this.imprint);
    }
    rewriteLabel(this.tex, {
      width: 512,
      height: 640,
      fill: '#9a9488',
      ink: '#1a2430',
      font: 'bold 20px monospace',
      lines: lines.length ? lines : ['LOT TRAVELER'],
      lineHeight: 26,
    });
  }
}
