/**
 * Shared bench mounting.
 *
 * All three rework benches are the same physical object: an instrument screen
 * with a bezel, sitting on a bench top. Only the panel contents differ. Keeping
 * the mounting here means the diegetic setup exists once, and Phase 5 reuses the
 * identical path when the real instrument cluster is assembled.
 */

import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Panel } from './panel.js';
import { bezel, matte, screenFromPanel } from '../scene.js';

export interface BenchMount {
  /** Parent node — move or hide this to take the whole station off-stage. */
  readonly root: TransformNode;
  /** The pickable screen, for raycasting pointer input to texture coordinates. */
  readonly screen: AbstractMesh;
  setVisible(visible: boolean): void;
}

export const SCREEN_W = 1.15;
export const SCREEN_H = 0.575;
const BENCH_Y = 1.42;
const BENCH_DEPTH = 0.02;

export function mountBench(scene: Scene, name: string, panel: Panel): BenchMount {
  const root = new TransformNode(`${name}-root`, scene);

  const screen = screenFromPanel(scene, panel.texture, `${name}-screen`, SCREEN_W, SCREEN_H);
  screen.parent = root;
  screen.position = new Vector3(0, BENCH_Y, 0);

  const frame = bezel(scene, `${name}-bezel`, SCREEN_W, SCREEN_H);
  frame.parent = root;
  frame.position = new Vector3(0, BENCH_Y, BENCH_DEPTH);

  // Bench top, so the instrument reads as hardware on a surface rather than a
  // quad floating in space.
  const bench = CreateBox(`${name}-bench`, { width: 1.5, height: 0.05, depth: 0.42 }, scene);
  bench.parent = root;
  bench.material = matte(scene, `${name}-bench-mat`, new Color3(0.16, 0.17, 0.19), 0.06);
  bench.position = new Vector3(0, BENCH_Y - SCREEN_H / 2 - 0.06, 0.1);

  return {
    root,
    screen,
    setVisible(visible: boolean) {
      root.setEnabled(visible);
    },
  };
}

/** Panel-pixel coordinates for a pointer event that hit a screen mesh. */
export function pickPanel(
  scene: Scene,
  screen: AbstractMesh,
  w: number,
  h: number,
): { px: number; py: number } | null {
  const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m === screen);
  const uv = pick?.getTextureCoordinates?.();
  if (!pick?.hit || !uv) return null;
  return { px: uv.x * w, py: (1 - uv.y) * h };
}