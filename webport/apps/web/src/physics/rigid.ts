/**
 * A small, deterministic rigid-body solver for bench feel.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A PHYSICS ENGINE
 *
 * GDD §16 requires that identical procedural lot seeds produce identical
 * performance scores. That rules out coupling the graded simulation to
 * frame-rate-dependent physics: physics would decide outcomes, outcomes would
 * depend on how fast the player's machine happens to be running, and a seeded
 * training run would stop being reproducible. Two players on different hardware
 * would get different scores from the same seed, which is exactly what §16
 * forbids.
 *
 * So this module is deliberately NOT allowed to decide anything. The simulation
 * in `@wafers/sim` remains the only source of truth for every outcome: the
 * verdict, the score, the defect, the pass or fail. Everything here is sensory.
 * A wafer that swings when you dunk it, a bath that sloshes, a lamp that swings
 * on its hinge when you move the carriage -- all of that is computed here and
 * none of it is ever read back by the simulation.
 *
 * The one direction that matters is player intent -> simulation. Dragging the
 * fork into SC-1 calls a simulation action. The physics state is never the input
 * to that action, only the rendered position of the player's hand is.
 *
 * WHY DETERMINISTIC ANYWAY
 *
 * It costs nothing to be deterministic and it buys real benefits: the same
 * gesture replays identically, tests can assert on trajectories without a
 * renderer, and nothing can drift between the mouse path and a future VR path
 * (§16 asks for identical scores across mouse and VR). Fixed-timestep
 * integration with a fixed solver order gives all three for free.
 */

/** Fixed integration step, in seconds. */
export const FIXED_DT = 1 / 120;

const GRAVITY = -9.81;

/** Terminal velocity, so a dropped prop never tunnels through the bench. */
const MAX_SPEED = 12;

/** Angular damping per second, applied as an exponential decay. */
const ANGULAR_DAMPING = 0.86;

/**
 * A rigid body with spherical inertia, integrated semi-implicitly.
 *
 * Semi-implicit (symplectic) Euler rather than explicit Euler because it is
 * stable for springs and does not pump energy into the system the way explicit
 * Euler does -- an explicit spring at 60 Hz visibly gains amplitude over a few
 * seconds, which reads as the simulation "breaking" rather than as physics.
 */
export class Body {
  /** Current position in metres. Mutated in place by `step`. */
  readonly position: Vector3Like = { x: 0, y: 0, z: 0 };
  /** Current velocity in metres per second. */
  readonly velocity: Vector3Like = { x: 0, y: 0, z: 0 };

  /** Orientation as a unit quaternion, integrated from angular velocity. */
  readonly orientation: QuatLike = { x: 0, y: 0, z: 0, w: 1 };
  /** Angular velocity in radians per second, world frame. */
  readonly angular: Vector3Like = { x: 0, y: 0, z: 0 };

  /** Mass in kilograms. Zero mass means the body is kinematic and never moves
   * under a force, which is how the bench and the fixtures are modelled. */
  mass = 1;

  /**
   * Linear drag. Higher values settle faster. This is a *fraction retained per
   * second*, not a rate, so it is clamped to [0,1): values above 1 would make the
   * per-step base negative and a fractional power of a negative number is NaN.
   */
  linearDamping = 0.4;

  /** Whether gravity applies. Off for things resting on a surface constraint. */
  gravity = true;

  /** Set false to freeze the body: it keeps integrating but ignores forces,
   * which is how a held prop behaves. */
  held = false;

  /** Accumulated force for the current step, cleared by `step`. */
  private readonly force: Vector3Like = { x: 0, y: 0, z: 0 };

  /** True while the body is below its resting plane, used for impact sounds. */
  grounded = false;

  addForce(x: number, y: number, z: number): void {
    this.force.x += x;
    this.force.y += y;
    this.force.z += z;
  }

  addImpulse(x: number, y: number, z: number): void {
    if (this.mass <= 0) return;
    this.velocity.x += x / this.mass;
    this.velocity.y += y / this.mass;
    this.velocity.z += z / this.mass;
  }

  /** Torque about the centre of mass. */
  addTorque(x: number, y: number, z: number): void {
    this.angular.x += x;
    this.angular.y += y;
    this.angular.z += z;
  }

  step(dt: number): void {
    if (this.held) {
      // A hand holding a prop means the prop is not moving, full stop. Merely
      // damping is not enough: an impulse applied every frame (a drag gesture)
      // still accumulates against any finite damping and the prop creeps out of
      // the hand. Zeroing is both the correct model and the stable one.
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.velocity.z = 0;
      this.angular.x = 0;
      this.angular.y = 0;
      this.angular.z = 0;
      this.clearForces();
      return;
    }

    if (this.mass <= 0) {
      // Kinematic: other bodies may move it, it never moves itself.
      this.clearForces();
      return;
    }

    // Gravity, then accumulated force, both divided by mass.
    let ax = this.force.x / this.mass;
    let ay = this.force.y / this.mass + (this.gravity ? GRAVITY : 0);
    let az = this.force.z / this.mass;

    // Semi-implicit: velocity first, then position from the NEW velocity.
    this.velocity.x += ax * dt;
    this.velocity.y += ay * dt;
    this.velocity.z += az * dt;

    damp(this.velocity, this.linearDamping, dt);
    clampLength(this.velocity, MAX_SPEED);

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Orientation: integrate the quaternion by its angular velocity.
    integrateQuat(this.orientation, this.angular, dt);
    damp(this.angular, ANGULAR_DAMPING, dt);

    this.clearForces();
  }

  private clearForces(): void {
    this.force.x = 0;
    this.force.y = 0;
    this.force.z = 0;
  }
}

/**
 * A damped spring, used for anything that should overshoot and settle:
 * a lamp swinging on its hinge, a probe carriage returning to rest, a knob
 * finding its detent.
 *
 * Stiffness and damping are named rather than tuned per call site so that the
 * whole game shares one vocabulary of motion. `UNDER` is underdamped (oscillates
 * visibly), `NEAR_CRITICAL` settles fast with a hint of overshoot, `OVER` is
 * sluggish and never overshoots.
 */
export enum SpringProfile {
  /** Visible wobble. For things that should feel light and physical. */
  UNDER = 'under',
  /** One small overshoot then settle. The default for mechanical motion. */
  NEAR_CRITICAL = 'near-critical',
  /** No overshoot at all. For anything that must look controlled. */
  OVER = 'over',
}

const PROFILES: Record<SpringProfile, { k: number; c: number }> = {
  [SpringProfile.UNDER]: { k: 90, c: 6 },
  [SpringProfile.NEAR_CRITICAL]: { k: 160, c: 22 },
  [SpringProfile.OVER]: { k: 320, c: 40 },
};

/** One scalar degree of freedom with spring behaviour. */
export class Spring {
  value: number;
  velocity = 0;
  target: number;
  private k: number;
  private c: number;

  /** The damping profile in use. Readable so callers can introspect a spring. */
  readonly profileName: SpringProfile;

  /** Optional hard travel limits, enforced every step. */
  min: number | null = null;
  max: number | null = null;

  constructor(initial: number, profile: SpringProfile = SpringProfile.NEAR_CRITICAL) {
    this.profileName = profile;
    this.value = initial;
    this.target = initial;
    const p = PROFILES[profile];
    this.k = p.k;
    this.c = p.c;
  }

  /** Nudge the spring, e.g. when something is struck. */
  impulse(v: number): void {
    this.velocity += v;
  }

  setProfile(profile: SpringProfile): void {
    (this as { profileName: SpringProfile }).profileName = profile;
    const p = PROFILES[profile];
    this.k = p.k;
    this.c = p.c;
  }

  step(dt: number): void {
    const a = -this.k * (this.value - this.target) - this.c * this.velocity;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
    this.clampToTravel();
  }

  /**
   * Enforce the travel limits, killing velocity at a stop.
   *
   * A hard mechanical stop does not bounce: energy is lost in the impact. Zeroing
   * velocity at the stop is what stops a hinge from buzzing against its limit.
   */
  clampToTravel(): void {
    if (this.min !== null && this.value < this.min) {
      this.value = this.min;
      if (this.velocity < 0) this.velocity = 0;
    }
    if (this.max !== null && this.value > this.max) {
      this.value = this.max;
      if (this.velocity > 0) this.velocity = 0;
    }
  }

  /** True once the spring has effectively stopped moving. */
  get settled(): boolean {
    return Math.abs(this.velocity) < 1e-3 && Math.abs(this.value - this.target) < 1e-3;
  }
}

/**
 * Fixed-timestep accumulator.
 *
 * Rendering runs at whatever rate the display allows, which varies with the
 * machine and with WebXR. Everything physical therefore integrates at a fixed
 * step, and leftover time is carried to the next frame instead of being scaled
 * into the step size. Without this, motion would be visibly different on a
 * 144 Hz monitor than on a struggling laptop -- and, more importantly, the same
 * gesture would produce different trajectories on different hardware.
 *
 * A maximum frame time stops a long stall (a tab regaining focus, a GC pause)
 * from trying to catch up hundreds of steps at once, which would look like a
 * teleport rather than a recovery.
 */
export class PhysicsWorld {
  private accumulator = 0;
  private readonly bodies: Body[] = [];
  private readonly springs: Spring[] = [];

  /** Total steps integrated, exposed so tests can assert determinism. */
  steps = 0;

  add(body: Body): Body {
    this.bodies.push(body);
    return body;
  }

  addSpring(spring: Spring): Spring {
    this.springs.push(spring);
    return spring;
  }

  /**
   * Advance by `frameDt` seconds of wall time, integrating in fixed steps.
   *
   * `frameDt` is clamped, so a long stall degrades to slow motion for a moment
   * rather than exploding. That is the correct trade for a training sim: a brief
   * slow-motion glitch is far less harmful than a prop tunnelling through the
   * bench or a trajectory that depends on frame timing.
   */
  update(frameDt: number, onStep?: (dt: number) => void): void {
    const MAX_FRAME = 0.25;
    this.accumulator += Math.min(Math.max(frameDt, 0), MAX_FRAME);
    while (this.accumulator >= FIXED_DT) {
      for (const b of this.bodies) b.step(FIXED_DT);
      for (const s of this.springs) s.step(FIXED_DT);
      onStep?.(FIXED_DT);
      this.accumulator -= FIXED_DT;
      this.steps++;
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal vector maths. Kept local and allocation-free on purpose: these run
// thousands of times per second per body, and Babylon's Vector3 allocates.
// ---------------------------------------------------------------------------

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QuatLike {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Fraction of velocity retained over `dt`, for a per-second retention `perSecond`.
 *
 * `pow` of a negative base with a fractional exponent is NaN, which is why the
 * retention is clamped rather than trusted.
 */
function retain(perSecond: number, dt: number): number {
  return Math.pow(Math.max(0, Math.min(1, perSecond)), dt);
}

function damp(v: Vector3Like, perSecond: number, dt: number): void {
  const f = retain(perSecond, dt);
  v.x *= f;
  v.y *= f;
  v.z *= f;
}

function clampLength(v: Vector3Like, max: number): void {
  const lenSq = v.x * v.x + v.y * v.y + v.z * v.z;
  if (lenSq <= max * max || lenSq === 0) return;
  const scale = max / Math.sqrt(lenSq);
  v.x *= scale;
  v.y *= scale;
  v.z *= scale;
}

/** q += 0.5 * omega * q * dt, then renormalise. */
function integrateQuat(q: QuatLike, omega: Vector3Like, dt: number): void {
  const half = dt * 0.5;
  const dx = half * (omega.x * q.w + omega.y * q.z - omega.z * q.y);
  const dy = half * (-omega.x * q.z + omega.y * q.w + omega.z * q.x);
  const dz = half * (omega.x * q.y - omega.y * q.x + omega.z * q.w);
  const dw = half * (-omega.x * q.x - omega.y * q.y - omega.z * q.z);
  q.x += dx;
  q.y += dy;
  q.z += dz;
  q.w += dw;
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len > 0) {
    q.x /= len;
    q.y /= len;
    q.z /= len;
    q.w /= len;
  }
}