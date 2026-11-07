import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { COLORS, matte } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';

export interface QuizQuestion {
  readonly prompt: string;
  readonly choices: readonly string[];
  readonly correctIndex: number;
}

const DAY_QUIZZES: Record<number, readonly QuizQuestion[]> = {
  1: [
    {
      prompt: 'Why reject a bowed wafer?',
      choices: ['Saves rinse time', 'Beyond high-NA DOF — irreversible', 'Cheaper than rework'],
      correctIndex: 1,
    },
    {
      prompt: 'Substrate contamination action?',
      choices: ['Reject always', 'Accept if mild', 'Rework via RCA clean'],
      correctIndex: 2,
    },
    {
      prompt: 'Day 1 tools are…',
      choices: ['Stylus + 4-point probe', 'SEM only', 'Ellipsometry only'],
      correctIndex: 0,
    },
  ],
  2: [
    {
      prompt: 'STI void correct call?',
      choices: ['Rework', 'Reject / scrap', 'Accept'],
      correctIndex: 1,
    },
    {
      prompt: 'CMP calibration arms…',
      choices: ['Salary boost', 'Safety brake on next wafers', 'Quiz skip'],
      correctIndex: 1,
    },
    {
      prompt: 'Interface roughness is…',
      choices: ['Parametric — reject', 'Catastrophic — rework', 'Always clean'],
      correctIndex: 0,
    },
  ],
  3: [
    {
      prompt: 'Silicide bridge early catch?',
      choices: ['Reject only', 'Rework C49 wash', 'Accept'],
      correctIndex: 1,
    },
    {
      prompt: 'Tungsten plug void?',
      choices: ['Rework', 'Reject — open circuit', 'CMP'],
      correctIndex: 1,
    },
    {
      prompt: 'Certification needs…',
      choices: ['Either gate', 'Both salary + competency gates', 'Speed only'],
      correctIndex: 1,
    },
  ],
};

/** Shift-end micro-quiz board — permanent competency boosts (GDD §12). */
export class QuizBoard {
  readonly root: TransformNode;
  readonly choiceButtons: AbstractMesh[] = [];
  private tex: DynamicTexture;
  private questions: readonly QuizQuestion[] = [];
  private index = 0;
  private correct = 0;
  private active = false;
  private finished = false;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('quizBoard', scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(0, 1.6, -0.2);
    this.root.setEnabled(false);

    const board = CreateBox('quizFace', { width: 0.9, height: 0.5, depth: 0.03 }, scene);
    board.parent = this.root;
    this.tex = applyLabel(board, scene, {
      width: 640,
      height: 360,
      font: 'bold 22px monospace',
      lines: ['MICRO-QUIZ'],
      lineHeight: 28,
    });
    board.isPickable = false;

    for (let i = 0; i < 3; i++) {
      const btn = CreateBox(`quizChoice${i}`, { width: 0.7, height: 0.06, depth: 0.03 }, scene);
      btn.parent = this.root;
      btn.position.set(0, -0.18 - i * 0.08, 0.04);
      btn.material = matte(scene, `quizChoiceMat${i}`, COLORS.accent, 0.25);
      btn.isPickable = true;
      btn.metadata = { interact: 'quizChoice', choice: i };
      applyLabel(btn, scene, {
        width: 512,
        height: 48,
        fill: '#143028',
        ink: '#dfffee',
        font: 'bold 16px monospace',
        lines: [`${i + 1}.`],
        lineHeight: 22,
      });
      this.choiceButtons.push(btn);
    }
  }

  open(dayNumber: number): void {
    this.questions = DAY_QUIZZES[dayNumber] ?? DAY_QUIZZES[1]!;
    this.index = 0;
    this.correct = 0;
    this.active = true;
    this.finished = false;
    this.root.setEnabled(true);
    this.paint();
  }

  get isActive(): boolean {
    return this.active && !this.finished;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** Boosts earned this quiz (0..3). */
  get boostsEarned(): number {
    return this.correct;
  }

  answer(choice: number): void {
    if (!this.isActive) return;
    const q = this.questions[this.index];
    if (!q) return;
    if (choice === q.correctIndex) this.correct += 1;
    this.index += 1;
    if (this.index >= this.questions.length) {
      this.finished = true;
      this.active = false;
      rewriteLabel(this.tex, {
        width: 640,
        height: 360,
        font: 'bold 24px monospace',
        align: 'center',
        lines: ['QUIZ COMPLETE', `${this.correct}/${this.questions.length} correct`, `+${this.correct} competency boost`],
        lineHeight: 36,
      });
      for (const b of this.choiceButtons) b.setEnabled(false);
      return;
    }
    this.paint();
  }

  hide(): void {
    this.root.setEnabled(false);
    this.active = false;
  }

  private paint(): void {
    const q = this.questions[this.index]!;
    rewriteLabel(this.tex, {
      width: 640,
      height: 360,
      font: 'bold 20px monospace',
      lines: [`Q${this.index + 1}/${this.questions.length}`, q.prompt, '', ...q.choices.map((c, i) => `${i + 1}. ${c}`)],
      lineHeight: 28,
    });
    for (let i = 0; i < this.choiceButtons.length; i++) {
      const btn = this.choiceButtons[i]!;
      btn.setEnabled(true);
      applyLabel(btn, btn.getScene(), {
        width: 512,
        height: 48,
        fill: '#143028',
        ink: '#dfffee',
        font: 'bold 15px monospace',
        lines: [`${i + 1}. ${q.choices[i] ?? ''}`],
        lineHeight: 22,
      });
    }
  }
}
