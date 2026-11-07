import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js';
import { DEFAULT_ALPHA, DEFAULT_BETA, DEFAULT_RADIUS, DEFAULT_TARGET } from '../bootstrap/engine.js';

/**
 * Soft follow toward a workspace focus. Suspended while a bench owns framing (§4.1).
 */
export class FollowCamera {
  private suspended = false;
  private target = DEFAULT_TARGET.clone();
  private radius = DEFAULT_RADIUS;
  private alpha = DEFAULT_ALPHA;
  private beta = DEFAULT_BETA;

  static create(): FollowCamera {
    return new FollowCamera();
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(camera: ArcRotateCamera): void {
    this.suspended = false;
    this.resync(camera);
  }

  get isSuspended(): boolean {
    return this.suspended;
  }

  setFocus(target: Vector3, radius = DEFAULT_RADIUS): void {
    this.target.copyFrom(target);
    this.radius = radius;
  }

  resync(camera: ArcRotateCamera): void {
    this.target.copyFrom(camera.getTarget());
    this.radius = camera.radius;
    this.alpha = camera.alpha;
    this.beta = camera.beta;
  }

  update(camera: ArcRotateCamera, dt: number): void {
    if (this.suspended) return;
    const k = 1 - Math.exp(-3.5 * dt);
    const cur = camera.getTarget();
    camera.setTarget(
      new Vector3(
        cur.x + (this.target.x - cur.x) * k,
        cur.y + (this.target.y - cur.y) * k,
        cur.z + (this.target.z - cur.z) * k,
      ),
    );
    // Adopt user zoom instead of fighting the wheel every frame.
    this.radius = camera.radius;
    // Preserve player orbit; alpha/beta only tracked for resync.
    void this.alpha;
    void this.beta;
  }
}
