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
import { painted } from '../scene/lighting.js';

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

/**
 * Mount a portrait panel as a clipboard on a tilted easel.
 *
 * `mountBench` assumes a landscape 2:1 instrument screen. A traveler is a
 * portrait sheet, and forcing it through the landscape mount stretched the text
 * to the point of being unreadable — so it gets its own geometry: a taller
 * panel, canted back 22 degrees like a clipboard on a desk easel.
 */
export function mountClipboard(scene: Scene, name: string, panel: Panel, w: number, h: number): BenchMount {
  const root = new TransformNode(`${name}-root`, scene);

  // Tilt lives on an intermediate node so the screen AND its bezel share it.
  // Tilting only the screen left the bezel standing vertical behind it, which
  // showed as a large black slab jutting out of the top of the clipboard.
  const tilt = new TransformNode(`${name}-tilt`, scene);
  tilt.parent = root;
  tilt.position = new Vector3(0, BENCH_Y + 0.02, 0);
  // Canted back so it faces an operator looking slightly down at the bench.
  tilt.rotation.x = -0.34;

  const frame = CreateBox(`${name}-bezel`, { width: w + 0.03, height: h + 0.03, depth: 0.018 }, scene);
  frame.parent = tilt;
  frame.position = new Vector3(0, 0, 0.028);
  frame.material = painted(scene, `${name}-bezel-mat`, '#2b303a', 0.55);

  const screen = screenFromPanel(scene, panel.texture, `${name}-screen`, w, h);
  screen.parent = tilt;
  screen.position = new Vector3(0, 0, 0);

  // Easel legs, upright and NOT tilted, so the sheet is actually held up.
  for (const sx of [-1, 1]) {
    const leg = CreateBox(`${name}-leg-${sx}`, { width: 0.018, height: 0.14, depth: 0.018 }, scene);
    leg.parent = root;
    leg.position = new Vector3(sx * (w / 2 - 0.035), BENCH_Y - 0.05, 0.05);
    leg.rotation.x = -0.34;
    leg.material = matte(scene, `${name}-leg-mat-${sx}`, new Color3(0.2, 0.21, 0.24), 0.24);
  }

  return {
    root,
    screen,
    setVisible(visible: boolean) {
      root.setEnabled(visible);
    },
  };
}

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