/**
 * Third-person follow camera.
 *
 * WHAT THIS REPLACES, AND WHAT IT MUST NOT BREAK
 *
 * The station camera was an ArcRotateCamera with a hard-coded target on the wafer
 * stage. That is a fine camera for a fixed viewpoint and a poor one for a room: the
 * player could walk three metres and the world would not move, which is the thing
 * that makes a space feel like a diorama.
 *
 * The camera stays an ArcRotateCamera rather than becoming a UniversalCamera,
 * because GDD 4 wants left-click drag to tilt and rotate the wafer under
 * cross-lighting, and the rework benches (`frameStation`) orbit a target to frame a
 * bath. A follow camera that swallowed mouse input would break both. So this class
 * owns exactly one thing -- WHERE the camera looks -- and leaves the orbit angles,
 * the radius and the zoom limits alone.
 *
 * THE CONFLICT THIS HAS TO RESOLVE
 *
 * Three things want to set the camera target: `frameWorkspace` on every phase
 * change, `frameStation` when a rework bench opens, and now the operator's
 * position. Left alone they overwrite each other and the camera snaps around,
 * which is the same class of bug as the bench framing that sat three commits
 * being fought in `313c88e`.
 *
 * The resolution is explicit ownership rather than last-writer-wins:
 *
 *   - While a rework bench owns the screen, the follow camera is SUSPENDED and the
 *     bench's own framing is authoritative. The operator is hidden at that point
 *     anyway, so there is nobody to follow.
 *   - At the station, the follow camera is authoritative and `frameWorkspace`'s
 *     target is only the value the follow camera seeds itself from.
 *
 * WHY THE TARGET IS OFFSET, NOT THE OPERATOR
 *
 * Aiming at the operator's chest puts the operator dead centre and the bench
 * directly behind them, so the body occludes the instruments. The target is
 * therefore pushed toward the bench, and biased laterally, which frames the
 * workstation over the operator's shoulder. That is the same framing a camera
 * operator would choose by hand, and it is the only arrangement where the person
 * and the thing they are working on are both readable.
 *
 * The bias fades out as the player walks away from the bench, so crossing the room
 * genuinely follows the body rather than dragging the bench along behind it.
 */

import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';

import { Spring, SpringProfile } from '../physics/rigid.js';

/** Where the bay's instruments are, for the framing bias. */
const FOCUS = new Vector3(0, 1.15, 0.05);

/** How far the target leans toward the bench when standing at it. */
const MAX_BIAS = 0.8;

/** Distance from the bench at which the bias has faded out entirely. */
const BIAS_FALLOFF = 2.6;

/** Lateral offset, metres. Pushes the operator off the centre line. */
/**
 * Lateral offset, metres, so the operator sits off the centre line rather than
 * blocking it. Applied in full once the framing bias has faded, which is the
 * opposite of the earlier arrangement: standing at the bench the bias does the
 * work, and out in the room the shoulder offset does it.
 */
const SHOULDER = 0.62;

/** Height of the look-at point above the operator's feet. */
const LOOK_HEIGHT = 1.12;

export class FollowCamera {
  /**
   * Smoothed look-at point. Heavily damped: a camera that snaps to the player
   * makes walking feel like the world is being shoved, and a camera that lags too
   * far makes the operator slide around the frame. Near-critical settles in about
   * a fifth of a second, which is enough to feel like a camera rather than a magnet.
   */
  private readonly tx: Spring;
  private readonly ty: Spring;
  private readonly tz: Spring;

  /**
   * Suspended while a rework bench owns the screen.
   *
   * Not a boolean on the session: this is a presentation concern and the session
   * has no business knowing how the camera is arranged.
   */
  private suspended = false;

  /** Distance from the operator to the bench, for the framing bias. */
  private constructor() {
    this.tx = new Spring(0, SpringProfile.NEAR_CRITICAL);
    this.ty = new Spring(LOOK_HEIGHT, SpringProfile.NEAR_CRITICAL);
    this.tz = new Spring(0, SpringProfile.NEAR_CRITICAL);
  }

  static create(): FollowCamera {
    return new FollowCamera();
  }

  /**
   * Hand control to something else -- a rework bench framing itself.
   *
   * Also re-seeds from the camera's current target, so when control comes back the
   * follow camera continues from where the bench left it rather than sweeping
   * across the room.
   */
  suspend(camera: ArcRotateCamera): void {
    this.suspended = true;
    const t = camera.target;
    this.tx.value = t.x;
    this.ty.value = t.y;
    this.tz.value = t.z;
    this.tx.target = t.x;
    this.ty.target = t.y;
    this.tz.target = t.z;
  }

  /** Take control back, seeding from the camera so there is no jump. */
  resume(camera: ArcRotateCamera): void {
    this.suspended = false;
    const t = camera.target;
    this.tx.value = t.x;
    this.ty.value = t.y;
    this.tz.value = t.z;
  }

  /**
   * Re-seed the target from the camera without changing ownership.
   *
   * `frameWorkspace` sets a target on every phase change. Without this the follow
   * camera would spend a frame pulling the view back to the operator, which reads
   * as a stutter every time the shift advances.
   */
  resync(camera: ArcRotateCamera): void {
    if (this.suspended) return;
    const t = camera.target;
    this.tx.value = t.x;
    this.ty.value = t.y;
    this.tz.value = t.z;
    this.tx.target = t.x;
    this.ty.target = t.y;
    this.tz.target = t.z;
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  /**
   * Aim at the operator.
   *
   * `dt` is the fixed step, so the follow is frame-rate independent for the same
   * reason the rest of the simulation is: a camera that follows at a different
   * speed on a 144 Hz monitor is a visible difference between machines.
   */
  follow(
    camera: ArcRotateCamera,
    operator: { x: number; z: number },
    dt: number,
  ): void {
    if (this.suspended) return;

    // Bias toward the bench, fading with distance so walking away really does
    // release the framing.
    const dx = FOCUS.x - operator.x;
    const dz = FOCUS.z - operator.z;
    const dist = Math.hypot(dx, dz);
    const bias = MAX_BIAS * Math.max(0, 1 - dist / BIAS_FALLOFF);

    const alongX = dist > 1e-4 ? dx / dist : 0;
    const alongZ = dist > 1e-4 ? dz / dist : 0;

    this.tx.target = operator.x + alongX * bias;
    this.tz.target = operator.z + alongZ * bias;
    this.ty.target = LOOK_HEIGHT;

    // Shoulder offset is applied to the target, perpendicular to the view direction
    // is not known here, so it is applied along world X: at the default orbit angle
    // that is exactly left-right on screen. At other angles it degrades to a
    // slightly-off-centre subject, which is harmless.
    this.tx.target += SHOULDER * (1 - bias / MAX_BIAS);

    this.tx.step(dt);
    this.ty.step(dt);
    this.tz.step(dt);
    camera.setTarget(new Vector3(this.tx.value, this.ty.value, this.tz.value));
  }

  /** Current look-at point, for tests. */
  get target(): { x: number; y: number; z: number } {
    return { x: this.tx.value, y: this.ty.value, z: this.tz.value };
  }
}
