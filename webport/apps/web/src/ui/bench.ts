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
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import type { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Panel } from './panel.js';
import { bezel, matte, screenFromPanel } from '../scene.js';
import { steel } from '../scene/lighting.js';
import { paper, cardboard } from '../scene/physical.js';

export interface BenchMount {
  /** Parent node — move or hide this to take the whole station off-stage. */
  readonly root: TransformNode;
  /** The pickable screen, for raycasting pointer input to texture coordinates. */
  readonly screen: AbstractMesh;
  setVisible(visible: boolean): void;
}

export const SCREEN_W = 1.15;
export const SCREEN_H = 0.575;
export const BENCH_Y = 1.42;
const BENCH_DEPTH = 0.02;

/**
 * Mount a portrait panel as a clipboard on a tilted easel.
 *
 * `mountBench` assumes a landscape 2:1 instrument screen. A traveler is a
 * portrait sheet, and forcing it through the landscape mount stretched the text
 * to the point of being unreadable — so it gets its own geometry.
 *
 * More importantly the sheet is DIFFUSE PAPER, not an emissive panel. That is the
 * difference between a clipboard and a monitor showing a picture of one: lit paper
 * catches the room light, receives shadow, and dims when the lamps dim. An
 * emissive "printed form" cannot do any of those, which is why it reads as a
 * screen no matter how much paper texture is painted onto it.
 */
export function mountClipboard(scene: Scene, name: string, panel: Panel, w: number, h: number): BenchMount {
  const root = new TransformNode(`${name}-root`, scene);

  // Tilt lives on an intermediate node so the sheet AND its backing share it.
  const tilt = new TransformNode(`${name}-tilt`, scene);
  tilt.parent = root;
  // Raise the pivot by half the sheet height so the BOTTOM EDGE clears the bench
  // top. Centring the sheet on the bench surface drove its lower half through the
  // bench, and the part that poked out read as a stray wedge of paper.
  tilt.position = new Vector3(0, BENCH_Y + (h / 2) * Math.cos(0.34) + 0.012, 0.012);
  // Positive: the top edge tips TOWARD the operator, so the sheet faces up and
  // out of the bench. Negative pointed the normal down and away from the player.
  tilt.rotation.x = 0.34;

  const sheet = CreatePlane(`${name}-sheet`, { width: w, height: h }, scene);
  sheet.parent = tilt;
  sheet.material = paper(scene, `${name}-paper-mat`, panel.texture as unknown as DynamicTexture);

  // Greyboard backing, so the sheet has thickness and an edge when seen from the side.
  const back = CreateBox(`${name}-back`, { width: w + 0.005, height: h + 0.005, depth: 0.004 }, scene);
  back.parent = tilt;
  back.position = new Vector3(0, 0, 0.0035);
  back.material = cardboard(scene, `${name}-back-mat`);

  // Steel spring clip with a lever. This one detail is most of what says
  // "clipboard" rather than "framed picture".
  const clipBar = CreateBox(`${name}-clip`, { width: 0.1, height: 0.022, depth: 0.011 }, scene);
  clipBar.parent = tilt;
  clipBar.position = new Vector3(0, h / 2 - 0.011, -0.005);
  clipBar.material = steel(scene, `${name}-clip-mat`, '#aab4c0');

  const clipLever = CreateCylinder(`${name}-clip-lever`, { diameter: 0.011, height: 0.066, tessellation: 12 }, scene);
  clipLever.parent = tilt;
  clipLever.rotation.x = Math.PI / 2;
  clipLever.position = new Vector3(0, h / 2 - 0.022, -0.011);
  clipLever.material = steel(scene, `${name}-clip-lever-mat`, '#c2ccd8');

  // Easel legs, upright and NOT tilted, so the sheet is actually held up.
  for (const sx of [-1, 1]) {
    const leg = CreateBox(`${name}-leg-${sx}`, { width: 0.016, height: 0.13, depth: 0.016 }, scene);
    leg.parent = root;
    leg.position = new Vector3(sx * (w / 2 - 0.035), BENCH_Y - 0.05, 0.07);
    leg.rotation.x = 0.34;
    leg.material = steel(scene, `${name}-leg-mat-${sx}`, '#6d757f');
  }

  return {
    root,
    // The pickable surface is the sheet itself.
    screen: sheet,
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

/**
 * Re-seat an instrument screen that shares a surface with a purpose-built bench.
 *
 * `mountBench` lays a screen out for a bench that IS the instrument: it positions
 * the screen at bench height on the centreline and adds a bench top of its own.
 * A wet bench is the opposite — it has a deck with chemistry on it, and the screen
 * is a small instrument standing at the back. Left alone the screen ends up at
 * (0, BENCH_Y, 0), which is *inside* the deck box, and the duplicate bench top
 * renders through the chemistry.
 *
 * `tilt` leans the top away from the operator, so a screen at the back of a deep
 * bench still faces the person sitting in front of it.
 */
export function placeInstrument(
  mount: BenchMount,
  opts: { y: number; z: number; x?: number; tilt?: number },
): void {
  const x = opts.x ?? 0;
  const tilt = opts.tilt ?? 0;
  for (const mesh of mount.root.getChildMeshes()) {
    if (mesh.name.endsWith('-bench')) {
      // The real bench supplies its own deck; this one would z-fight with it.
      mesh.setEnabled(false);
      continue;
    }
    if (mesh.name.endsWith('-screen') || mesh.name.endsWith('-bezel')) {
      mesh.position.set(x, opts.y, opts.z);
      mesh.rotation.set(tilt, 0, 0);
    }
  }
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