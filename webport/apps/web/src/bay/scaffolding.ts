import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import type { DayConfig } from '@wafers/data';
import type { MetrologyReading, StampFeedback } from '@wafers/sim';
import { applyLabel, rewriteLabel } from './labels.js';

/**
 * GDD §12 scaffolded context prompts — fire on measurement / wrong stamp,
 * fade by Day 3 (calloutMode).
 */
export class Scaffolding {
  readonly root: TransformNode;
  private card: AbstractMesh;
  private tex: DynamicTexture;
  private ttl = 0;
  private day: DayConfig | null = null;
  private seenClasses = new Set<string>();

  constructor(scene: Scene, parent?: TransformNode) {
    this.root = new TransformNode('scaffolding', scene);
    if (parent) this.root.parent = parent;
    this.root.position = new Vector3(0, 1.7, 0.35);
    this.root.setEnabled(false);

    this.card = CreateBox('calloutCard', { width: 0.65, height: 0.22, depth: 0.015 }, scene);
    this.card.parent = this.root;
    this.tex = applyLabel(this.card, scene, {
      width: 512,
      height: 176,
      fill: '#1a2430',
      ink: '#d8e8f8',
      font: 'bold 20px monospace',
      lines: [''],
      lineHeight: 26,
    });
    this.card.isPickable = false;
  }

  setDay(day: DayConfig): void {
    this.day = day;
    this.seenClasses.clear();
  }

  onReading(reading: MetrologyReading): void {
    if (!this.allowsCallout()) return;
    if (!reading.outOfSpec || reading.resolved.length === 0) return;
    const d = reading.resolved[0]!;
    if (this.day?.calloutMode === 'FirstOccurrencePerDefectClass') {
      if (this.seenClasses.has(d.defectClass)) return;
      this.seenClasses.add(d.defectClass);
    }
    this.show(`${d.defectType} signal`, `${reading.signalLabel} out of spec — check the traveler rule.`);
  }

  onStamp(feedback: StampFeedback): void {
    if (!this.allowsCallout()) return;
    if (feedback.correct) return;
    this.show('Stamp fault', feedback.reasoning.slice(0, 90));
  }

  update(dt: number): void {
    if (this.ttl <= 0) return;
    this.ttl -= dt;
    if (this.ttl <= 0) this.root.setEnabled(false);
  }

  private allowsCallout(): boolean {
    if (!this.day?.showContextPrompts) return false;
    return this.day.calloutMode !== 'Disabled';
  }

  private show(title: string, body: string): void {
    rewriteLabel(this.tex, {
      width: 512,
      height: 176,
      fill: '#1a2430',
      ink: '#d8e8f8',
      font: 'bold 20px monospace',
      lines: [title, ...wrap(body, 40).slice(0, 3)],
      lineHeight: 28,
    });
    this.root.setEnabled(true);
    this.ttl = 4.5;
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
