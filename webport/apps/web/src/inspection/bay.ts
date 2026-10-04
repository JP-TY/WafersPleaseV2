/**
 * The cleanroom bay (GDD §4 platform, §13 workspace).
 *
 * Every object in the inspection station sits at a coordinate defined HERE. The
 * views used to carry their own magic numbers, which made it impossible to keep
 * the workspace coherent — the clipboard ended up intersecting the wafer chuck,
 * and the briefing board ended up behind the camera.
 *
 * Axes: Babylon's ArcRotateCamera with alpha = -PI/2 places the viewer on -Z
 * looking toward +Z. So:
 *
 *   -Z  is toward the operator (nearest the viewer)
 *   +Z  is into the room (the back wall)
 *   +Y  is up
 *
 * Screens are CreatePlane, whose visible face points toward -Z, i.e. toward the
 * operator. Anything mounted on a wall therefore sits at +Z with its backing at a
 * larger +Z still.
 */

import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import type { Scene } from '@babylonjs/core/scene.js';

/** Bench working height. A seated operator's hands, roughly. */
export const BENCH_Y = 1.42;

/** Depth of the bench front-to-back. */
export const BENCH_DEPTH = 0.72;
/** Width across the bay. */
export const BENCH_WIDTH = 3.0;

/** Z of the back wall. Everything wall-mounted hangs off this. */
export const WALL_Z = 1.9;

/** Where each piece of the station lives. */
export const LAYOUT = {
  /** Wafer stage, dead centre in front of the operator. */
  wafer: new Vector3(0, 0, 0.02),
  /** Traveler clipboard, left, canted in. */
  traveler: new Vector3(-0.8, 0, -0.1),
  /** Stamp bank, right, within easy reach. */
  stamps: new Vector3(0.92, 0, -0.06),
  /** Instrument rack: above the bench, behind the wafer. */
  cluster: new Vector3(0, 1.68, 0.34),
  /** Briefing / incident printer, on the back wall. */
  board: new Vector3(0, 2.02, WALL_Z),
} as const;

/**
 * Yaw for the canted clipboard.
 *
 * NEGATIVE, because the clipboard sits on the operator's left (x < 0) and a
 * screen's face points toward -Z. To turn that face back toward an operator at
 * the origin you yaw the other way from +Y. The earlier positive value aimed it
 * at the wall.
 */
export const TRAVELER_YAW = -0.5;

/**
 * Build the room: floor, bench, and back wall with the cleanroom panelling the
 * GDD's "no floating HUD" rule implies should be there.
 *
 * The wall exists for a functional reason, not decoration: the briefing and
 * incident-printer boards hang on it, so the room has a back and the camera has
 * somewhere to put large text that the player has to read.
 */
export function buildBay(scene: Scene): TransformNode {
  const root = new TransformNode('bay', scene);

  const metal = (name: string, color: Color3, spec = 0.1) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = color;
    m.specularColor = new Color3(spec, spec, spec);
    return m;
  };

  // Floor.
  const floor = CreateBox('bay-floor', { width: 14, height: 0.1, depth: 14 }, scene);
  floor.parent = root;
  floor.position = new Vector3(0, -0.05, 2);
  floor.material = metal('bay-floor-mat', new Color3(0.1, 0.11, 0.13), 0.02);

  // Back wall.
  const wall = CreateBox('bay-wall', { width: 14, height: 4.2, depth: 0.1 }, scene);
  wall.parent = root;
  wall.position = new Vector3(0, 2.05, WALL_Z + 0.15);
  wall.material = metal('bay-wall-mat', new Color3(0.17, 0.19, 0.22), 0.06);

  // Cleanroom wall panelling: horizontal seams, so the wall reads as built
  // panels rather than a flat backdrop.
  for (let i = 0; i < 7; i++) {
    const seam = CreateBox(`bay-wall-seam-${i}`, { width: 14, height: 0.012, depth: 0.02 }, scene);
    seam.parent = root;
    seam.position = new Vector3(0, 0.42 + i * 0.55, WALL_Z + 0.09);
    seam.material = metal(`bay-wall-seam-mat-${i}`, new Color3(0.13, 0.14, 0.16), 0.05);
  }

  // Bench top: a perforated stainless surface, which is what a wafer-stage bench
  // actually is. The perforations matter visually because the wafer is held over
  // them and the shadow they cast is what sells the wafer as sitting above.
  const top = CreateBox('bay-bench-top', { width: BENCH_WIDTH, height: 0.05, depth: BENCH_DEPTH }, scene);
  top.parent = root;
  top.position = new Vector3(0, BENCH_Y - 0.025, 0.1);
  top.material = metal('bay-bench-mat', new Color3(0.22, 0.23, 0.26), 0.28);

  // Front edge rail, and legs.
  const rail = CreateBox('bay-bench-rail', { width: BENCH_WIDTH, height: 0.05, depth: 0.04 }, scene);
  rail.parent = root;
  rail.position = new Vector3(0, BENCH_Y - 0.08, 0.1 - BENCH_DEPTH / 2);
  rail.material = metal('bay-bench-rail-mat', new Color3(0.3, 0.31, 0.34), 0.4);

  for (const sx of [-1, 1]) {
    const leg = CreateBox(`bay-bench-leg-${sx}`, { width: 0.06, height: BENCH_Y - 0.11, depth: 0.06 }, scene);
    leg.parent = root;
    leg.position = new Vector3(sx * (BENCH_WIDTH / 2 - 0.09), (BENCH_Y - 0.11) / 2, 0.28);
    leg.material = metal(`bay-bench-leg-mat-${sx}`, new Color3(0.14, 0.15, 0.17), 0.2);
  }

  // Perforation grid on the bench top, drawn as a shallow inset texture rather
  // than hundreds of meshes.
  const perf = CreatePlane('bay-bench-perf', { width: BENCH_WIDTH - 0.1, height: BENCH_DEPTH - 0.08 }, scene);
  perf.parent = root;
  perf.rotation.x = Math.PI / 2;
  perf.position = new Vector3(0, BENCH_Y + 0.001, 0.1);
  perf.material = perforationMaterial(scene);

  return root;
}

/** A small procedural texture of the bench's perforated stainless surface. */
function perforationMaterial(scene: Scene): StandardMaterial {
  const size = 256;
  const tex = new DynamicTexture('bench-perf-tex', { width: size, height: size }, scene, true);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = '#3a3f47';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#20242a';
  const step = 16;
  for (let y = step / 2; y < size; y += step) {
    for (let x = step / 2; x < size; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  tex.update();
  tex.uScale = 24;
  tex.vScale = 6;

  const mat = new StandardMaterial('bay-bench-perf-mat', scene);
  mat.diffuseTexture = tex;
  mat.specularColor = new Color3(0.25, 0.26, 0.28);
  return mat;
}