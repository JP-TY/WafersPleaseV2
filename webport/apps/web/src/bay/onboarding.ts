import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { COLORS, matte } from '../bootstrap/materials.js';
import { applyLabel, rewriteLabel } from './labels.js';

export interface OnboardingStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly target: Vector3;
}

const TOUR: readonly OnboardingStep[] = [
  {
    id: 'wafer',
    title: 'WAFER STAGE',
    body: 'Drag the wafer to tilt it under cross-lighting. Geometry defects show as bow.',
    target: new Vector3(0, 1.15, 0.15),
  },
  {
    id: 'tools',
    title: 'METROLOGY RACK',
    body: 'Click a screen or press 1–5. Wrong tools are blind to some defects.',
    target: new Vector3(0.72, 1.25, 0),
  },
  {
    id: 'traveler',
    title: 'TRAVELER',
    body: 'Today’s rules and teaching imprint after every stamp.',
    target: new Vector3(-0.35, 1.2, 0.45),
  },
  {
    id: 'stamps',
    title: 'ROUTING STAMPS',
    body: 'Accept / Reject / Rework — irreversible. Rework opens the wet bench.',
    target: new Vector3(0.35, 1.15, 0.42),
  },
];

export function shouldRunOnboarding(): boolean {
  if (typeof location !== 'undefined') {
    const flag = new URLSearchParams(location.search).get('onboarding');
    if (flag === '1') return true;
    if (flag === '0' || flag === 'skip') return false;
  }
  try {
    return localStorage.getItem('wp.onboarding.v1') !== 'done';
  } catch {
    return true;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem('wp.onboarding.v1', 'done');
  } catch {
    /* ignore */
  }
}

/** Diegetic station tour callout card (GDD §12). */
export class OnboardingTour {
  readonly root: TransformNode;
  readonly card: AbstractMesh;
  readonly skipBtn: AbstractMesh;
  readonly nextBtn: AbstractMesh;
  private tex: DynamicTexture;
  private step = 0;
  private active = false;

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('onboarding', scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(0, 1.55, 0.6);
    this.root.setEnabled(false);

    this.card = CreateBox('onboardCard', { width: 0.7, height: 0.32, depth: 0.02 }, scene);
    this.card.parent = this.root;
    this.tex = applyLabel(this.card, scene, {
      width: 640,
      height: 288,
      font: 'bold 22px monospace',
      lines: ['TOUR'],
      lineHeight: 30,
    });
    this.card.isPickable = false;

    this.nextBtn = CreateBox('onboardNext', { width: 0.16, height: 0.05, depth: 0.03 }, scene);
    this.nextBtn.parent = this.root;
    this.nextBtn.position.set(0.2, -0.22, 0.03);
    this.nextBtn.material = matte(scene, 'onNextMat', COLORS.accent, 0.4);
    this.nextBtn.isPickable = true;
    this.nextBtn.metadata = { interact: 'onboardNext' };
    applyLabel(this.nextBtn, scene, {
      width: 128,
      height: 48,
      fill: '#143028',
      ink: '#dfffee',
      align: 'center',
      font: 'bold 18px monospace',
      lines: ['NEXT'],
      lineHeight: 22,
    });

    this.skipBtn = CreateBox('onboardSkip', { width: 0.16, height: 0.05, depth: 0.03 }, scene);
    this.skipBtn.parent = this.root;
    this.skipBtn.position.set(-0.2, -0.22, 0.03);
    this.skipBtn.material = matte(scene, 'onSkipMat', COLORS.bench, 0.2);
    this.skipBtn.isPickable = true;
    this.skipBtn.metadata = { interact: 'onboardSkip' };
    applyLabel(this.skipBtn, scene, {
      width: 128,
      height: 48,
      fill: '#222',
      ink: '#ccc',
      align: 'center',
      font: 'bold 18px monospace',
      lines: ['SKIP'],
      lineHeight: 22,
    });
  }

  start(): void {
    this.active = true;
    this.step = 0;
    this.root.setEnabled(true);
    this.paint();
  }

  get isActive(): boolean {
    return this.active;
  }

  next(): boolean {
    if (!this.active) return false;
    this.step += 1;
    if (this.step >= TOUR.length) {
      this.finish();
      return true;
    }
    this.paint();
    return false;
  }

  finish(): void {
    this.active = false;
    this.root.setEnabled(false);
    markOnboardingDone();
  }

  currentTarget(): Vector3 | null {
    if (!this.active) return null;
    return TOUR[this.step]?.target.clone() ?? null;
  }

  private paint(): void {
    const s = TOUR[this.step]!;
    rewriteLabel(this.tex, {
      width: 640,
      height: 288,
      font: 'bold 22px monospace',
      lines: [`STATION TOUR ${this.step + 1}/${TOUR.length}`, s.title, '', ...wrap(s.body, 42)],
      lineHeight: 30,
    });
    this.root.position.copyFrom(s.target);
    this.root.position.y += 0.35;
  }
}

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
