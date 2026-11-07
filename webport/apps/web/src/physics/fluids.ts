/**
 * Physical feel for the wet benches: liquid that responds to what you put in it,
 * and instruments that move like objects with mass.
 *
 * Everything here is presentation. See `boundary.ts` for why, and for the rule
 * that keeps physical state away from any graded outcome.
 *
 * The physics in this file is deliberately simple and specific. A general
 * fluid solver is the wrong tool: it is expensive, it is not deterministic
 * across frame rates, and it would produce motion the player cannot interpret.
 * What makes a bath feel wet is a small number of legible cues -- the level
 * rises when a wafer displaces it, it sloshes when something enters fast, and it
 * settles again -- and a damped oscillator reproduces all three convincingly at
 * a fraction of the cost.
 */

import { Body, Spring, SpringProfile, PhysicsWorld } from './rigid.js';
import type { Vector3Like } from './rigid.js';

/**
 * A rectangular volume of liquid in a bath, with sloshing.
 *
 * Modelled as a height field rather than a particle system: the surface is
 * described by its mean level plus two tilt components (tilt along each
 * horizontal axis). That is enough to produce the behaviour a player reads as
 * "liquid": it rises when displaced, tips toward the disturbance, and oscillates
 * as it settles. It costs two springs per bath instead of thousands of particles,
 * and it cannot flicker or explode.
 */
export class LiquidVolume {
  /** Mean surface height in metres, relative to the bath floor. */
  private readonly level: Spring;

  /** Surface tilt about each horizontal axis, in radians. Drives the visual
   * slope of the surface and the direction it sloshes toward. */
  private readonly tiltX: Spring;
  private readonly tiltZ: Spring;

  /** Set while something is submerged, so the level can be held up. */
  private submerged = false;

  constructor(
    world: PhysicsWorld,
    opts: {
      /** Resting depth of the bath in metres. */
      depth: number;
      /** Bath plan area in square metres; sets how much the level rises. */
      area: number;
      /** Cross-section the player sees, in metres. */
      width: number;
    },
  ) {
    this.level = world.addSpring(new Spring(opts.depth, SpringProfile.OVER));
    this.tiltX = world.addSpring(new Spring(0, SpringProfile.UNDER));
    this.tiltZ = world.addSpring(new Spring(0, SpringProfile.UNDER));
    this.area = opts.area;
    /** Width of the surface the player sees, so a bench can size its mesh. */
    this.surfaceWidth = opts.width;
  }

  private readonly area: number;
  /** Width of the liquid surface in metres, for the bench to render. */
  readonly surfaceWidth: number;

  /**
   * Put an object into the bath.
   *
   * `volume` is the displaced volume in cubic metres and `entrySpeed` is how fast
   * it came in. The level rises by the displaced volume over the plan area, and
   * a fast entry kicks the slosh -- which is why a careful dunk settles and a
   * careless one slops over the rim.
   */
  submerge(volume: number, entrySpeed: number): void {
    this.submerged = true;
    const rise = volume / Math.max(this.area, 1e-4);
    this.level.target = this.level.value + rise;
    // Slosh scales with entry speed: gentle entry disturbs the surface, a fast
    // one throws it.
    const kick = Math.min(Math.abs(entrySpeed), 6) * 0.05;
    this.tiltX.impulse(kick * 0.6);
    this.tiltZ.impulse(kick * 0.4);
  }

  /** Take the object back out. The level falls as the volume is released. */
  emerge(volume: number): void {
    this.submerged = false;
    this.level.target = Math.max(0.02, this.level.value - volume / Math.max(this.area, 1e-4));
  }

  /**
   * How close the bath is to overflowing, in [0,1].
   *
   * Read by the bench to raise a warning telltale. It is a *display* quantity:
   * whether a dunk actually spills is decided by the simulation, not by this.
   */
  get brimFactor(): number {
    return Math.max(0, Math.min(1, (this.sloshMagnitude - 0.12) / 0.28));
  }

  /** Combined tilt magnitude, the visual and audible signature of sloshing. */
  get sloshMagnitude(): number {
    return Math.hypot(this.tiltX.value, this.tiltZ.value);
  }

  /** Current mean depth. */
  get depth(): number {
    return this.level.value;
  }

  /** Surface tilt about X, for orienting the surface mesh. */
  get tilt(): { x: number; z: number } {
    return { x: this.tiltX.value, z: this.tiltZ.value };
  }

  get isSubmerged(): boolean {
    return this.submerged;
  }

  /** Slowly relax the level back to its resting depth when nothing is in it. */
  relax(dt: number): void {
    if (!this.submerged) {
      const rest = this.level.target;
      this.level.target += (rest - this.level.target) * Math.min(1, dt * 0.5);
    }
    // Bleed off tilt very slightly faster than the spring would on its own, so a
    // bath does not slosh forever after a disturbance.
    this.tiltX.velocity *= 0.985;
    this.tiltZ.velocity *= 0.985;
  }
}

/**
 * An instrument on a hinge -- a hood lamp, a swinging telltale.
 *
 * A single rotational degree of freedom about the hinge axis, which is all a
 * hinged lamp has. Using one spring rather than a full rigid body makes the hinge
 * constraint exact: the lamp can never drift off its pivot, which a free body
 * would do slowly under numerical error.
 */
export class HingedInstrument {
  readonly angle: Spring;

  constructor(
    world: PhysicsWorld,
    opts: {
      /** Rest angle in radians. */
      rest: number;
      /** How far the hinge can swing from rest, in radians. */
      limit: number;
      profile?: SpringProfile;
    },
  ) {
    this.angle = world.addSpring(new Spring(opts.rest, opts.profile ?? SpringProfile.UNDER));
    this.limit = opts.limit;
    this.rest = opts.rest;
    // Enforced every step, not just at the moment of the bump: without this the
    // spring integrates straight through the stop and the hinge buzzes.
    this.angle.min = opts.rest - opts.limit;
    this.angle.max = opts.rest + opts.limit;
  }

  /** Travel limit either side of rest, in radians. */
  readonly limit: number;
  /** Resting angle in radians. */
  readonly rest: number;

  /**
   * Nudge the hinge, as if the bench were bumped or the carriage passed by.
   *
   * `strength` is in radians per second. The bump is clamped to the hinge limit
   * so a strong knock swings the lamp to its stop rather than spinning it.
   */
  bump(strength: number): void {
    // The kick lands on the spring's velocity: `strength` is an angular velocity
    // in rad/s, so it *is* a velocity impulse. Travel limits are enforced by the
    // spring itself on every step.
    this.angle.impulse(strength);
  }

  /** Stop the hinge dead, e.g. when the player grabs it. */
  arrest(): void {
    this.angle.velocity = 0;
  }
}

/**
 * A carriage that travels along a rail and carries something.
 *
 * This is the RCA wafer fork and the silicide probe carriage, and it is the piece
 * that most changes how the benches feel. Previously the fork teleported between
 * baths with a lerp; it now has mass, so it accelerates into a move, overshoots
 * slightly and settles, and a fast move slops the bath it left.
 */
export class Carriage {
  private readonly position: Spring;
  private speed = 0;

  constructor(
    world: PhysicsWorld,
    opts: {
      start: number;
      /** Farthest the carriage may travel from its start, in metres. */
      travel: number;
      profile?: SpringProfile;
    },
  ) {
    this.position = world.addSpring(new Spring(opts.start, opts.profile ?? SpringProfile.NEAR_CRITICAL));
    this.travel = opts.travel;
  }

  private readonly travel: number;
  private lastPosition = 0;

  /** Where the carriage is, in metres from its origin. */
  get value(): number {
    return this.position.value;
  }

  /** Current speed in m/s, signed. Used to decide how much a move disturbs a
   * bath, and to drive motion blur on the carried object. */
  get velocity(): number {
    return this.speed;
  }

  /** Ask the carriage to move to `x`, clamped to its rail. */
  moveTo(x: number): void {
    this.position.target = Math.max(-this.travel, Math.min(this.travel, x));
  }

  /** Called once per rendered frame, after the physics steps. */
  sync(): void {
    this.speed = this.position.value - this.lastPosition;
    this.lastPosition = this.position.value;
  }

  /** Prime the speed tracker so the first frame does not report a huge jump. */
  reset(): void {
    this.lastPosition = this.position.value;
    this.speed = 0;
  }
}

/**
 * A wafer on a fork, with real mass and inertia.
 *
 * Kept as a full body rather than a spring so that it can be genuinely pushed
 * around: swinging on the fork as the carriage accelerates, and settling as it
 * stops. The fork constrains it, so this is a body with a strong spring pulling it
 * to the fork's position -- mass and damping are what give the motion its weight.
 */
export class CarriedWafer {
  readonly body: Body;
  private readonly home: Spring;

  constructor(
    world: PhysicsWorld,
    opts: {
      /** Wafer mass. A 300 mm wafer is a few hundred grams; it feels heavier
       * than that through a fork, which is the point. */
      mass?: number;
    } = {},
  ) {
    this.body = world.add(new Body());
    this.body.mass = opts.mass ?? 0.32;
    // Retention per second: low values settle fast, which is what a wafer on
    // a fork does -- it stops almost as soon as the carriage does.
    this.body.linearDamping = 0.03;
    this.home = world.addSpring(new Spring(0, SpringProfile.NEAR_CRITICAL));
  }

  /** Where the fork is; the wafer is pulled toward it. */
  hold(x: number, y: number, z: number): void {
    this.home.target = y;
    // Pull toward the fork rather than teleporting, so the wafer lags and swings.
    this.body.addForce((x - this.body.position.x) * 6, 0, (z - this.body.position.z) * 6);
  }

  /** Release the wafer. */
  drop(): void {
    this.body.held = false;
  }

  /** Grab the wafer: it stops responding to gravity until released. */
  grab(): void {
    this.body.held = true;
  }
}

/** Convenience: build a physics world with a body and springs already in it. */
export function createWorld(): PhysicsWorld {
  return new PhysicsWorld();
}

export type { Vector3Like };