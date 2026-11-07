/**
 * WASD / arrow-key movement, resolved against the camera's facing.
 *
 * GDD 4 asks for a mouse-and-keyboard desktop target with optional WebXR. The
 * keyboard half of that was never implemented -- `N` for next and `P` for peel
 * existed, but there was no way to move. This is it.
 *
 * INPUT SHAPE, AND WHY IT IS INVISIBLE
 *
 * This module owns no key state and no game rules. It turns a key state into a
 * normalised direction, and nothing else. Two reasons it is kept this dumb:
 *
 *   - The boundary in `physics/boundary.ts` says player intent may reach the
 *     simulation and simulation state may not reach presentation. A direction
 *     vector is intent. Anything richer would be a decision, and decisions belong
 *     to the session.
 *   - Movement must be testable without synthesising DOM events, and a
 *     `KeyboardState` plus a pure `resolveMove` function is trivially testable
 *     while a pile of listeners in `main.ts` is not.
 *
 * CAMERA-RELATIVE, WHICH IS THE PART THAT MATTERS
 *
 * W should mean "away from me", and the player is looking at the bench from
 * whatever angle the orbit camera is at. So `W` is resolved against the camera's
 * yaw rather than against world axes. With the camera at its default alpha the
 * two coincide, which is why this can look like it is doing nothing until you
 * swing the camera round -- at which point a world-axis implementation would send
 * the operator sideways across the room, which is the bug this avoids.
 */

import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';

/** Tracked keys. WASD and the arrow cluster, which is what people actually use. */
export class KeyboardState {
  private readonly down = new Set<string>();

  private readonly onDown = (e: KeyboardEvent): void => {
    this.down.add(e.code);
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };

  /**
   * Losing focus must clear the keys.
   *
   * Without this, alt-tabbing while holding W leaves the operator walking into the
   * back wall for as long as the window stays unfocused -- a bug that looks like a
   * physics fault and is actually an input leak.
   */
  private readonly onBlur = (): void => {
    this.down.clear();
  };

  constructor(target: Window | HTMLElement = window) {
    const t = target as Window;
    t.addEventListener('keydown', this.onDown);
    t.addEventListener('keyup', this.onUp);
    t.addEventListener('blur', this.onBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** Test seam: drive the state directly rather than via the DOM. */
  setForTest(code: string, isDown: boolean): void {
    if (isDown) this.down.add(code);
    else this.down.delete(code);
  }

  dispose(target: Window = window): void {
    const t = target as Window;
    t.removeEventListener('keydown', this.onDown);
    t.removeEventListener('keyup', this.onUp);
    t.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];

function anyDown(keys: KeyboardState, codes: string[]): boolean {
  return codes.some((c) => keys.isDown(c));
}

/**
 * A unit movement direction in camera-relative space, or null when idle.
 *
 * Diagonals are normalised, so walking forward-left is the same speed as walking
 * forward. Without that, diagonals are 41% faster and every player notices without
 * being able to say why.
 */
export function resolveMove(keys: KeyboardState, camera: ArcRotateCamera): { x: number; z: number } | null {
  const fwd = (anyDown(keys, FORWARD) ? 1 : 0) - (anyDown(keys, BACK) ? 1 : 0);
  const strafe = (anyDown(keys, RIGHT) ? 1 : 0) - (anyDown(keys, LEFT) ? 1 : 0);
  if (fwd === 0 && strafe === 0) return null;

  // Camera yaw. In Babylon an ArcRotateCamera sits at
  // (target + r * (cos a * sin b, cos b, sin a * sin b)), so with alpha = -PI/2 the
  // camera is on -Z looking toward +Z. The operator's "forward" is therefore -Z at
  // the default, and the basis rotates with alpha.
  const a = camera.alpha;
  // Forward in world space is the direction the camera looks, flattened.
  const fx = -Math.cos(a);
  const fz = -Math.sin(a);
  // Right is forward rotated 90 degrees about Y. Babylon is LEFT-handed, where
  // right = up x forward = Y x Z = X, so with forward = +Z the right vector is +X.
  // Deriving it the other way round (the intuitive right-handed form) made D move
  // the operator to screen-left, which the first screenshot caught.
  const rx = fz;
  const rz = -fx;

  let dx = fx * fwd + rx * strafe;
  let dz = fz * fwd + rz * strafe;
  const len = Math.hypot(dx, dz);
  if (len > 1e-6) {
    dx /= len;
    dz /= len;
  }
  return { x: dx, z: dz };
}