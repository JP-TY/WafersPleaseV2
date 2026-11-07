/**
 * The operator: a body you move around the bay.
 *
 * WHY A BODY AND NOT A DIFFERENT CAMERA
 *
 * GDD 4 specifies "left-click + drag to tilt and rotate the wafer under
 * cross-lighting", and that orbit camera is the correct tool for the job -- it is
 * how you get a clean look at a wafer surface and how the rework benches frame
 * themselves. Replacing it with a first-person camera would have made inspecting
 * a 300 mm wafer much worse, because you would be panning a flat view across it
 * rather than orbiting it.
 *
 * So the camera stays. What was missing was a sense of a person standing at the
 * bench: GDD 2 asks for a player fantasy of a technician who has to live with
 * their process decisions, and you cannot feel accountable for a decision made
 * by an invisible eye. The operator is the thing that makes the room a place.
 *
 * WHERE THE OPERATOR MAY GO
 *
 * The bay is a small, deliberately authored space -- one bench, one wall, one
 * workstation. Movement is therefore constrained to the floor in front of and
 * beside the bench, not the fourteen-metre box the floor mesh happens to be. A
 * technician cannot walk through the bench, cannot leave the bay, and cannot
 * wander behind the back wall, because those places were never built and walking
 * into unbuilt space is how you end up staring at the inside of a wall.
 *
 * Like everything else in the physics layer, none of this affects an outcome.
 * Walking is player intent and presentation; `boundary.ts` has the details, and
 * the test suite proves it.
 */

import type { Scene } from '@babylonjs/core/scene.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { Color3 } from '@babylonjs/core/Maths/math.color.js';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';

import { steel } from '../scene/lighting.js';
import { matte } from '../scene/lighting.js';
import { Spring, SpringProfile } from '../physics/rigid.js';

/** Eye height of the operator, metres. Matches the seated height in `createStage`. */
export const OPERATOR_EYE_Y = 1.6;

/**
 * The walkable rectangle, in metres.
 *
 * Derived from the bay rather than invented: `x` spans a little wider than the
 * 2.5 m bench so the operator can stand at either end of it, and `z` stops short
 * of the back wall and starts in front of the bench front edge.
 */
export const WALK_AREA = {
  minX: -2.1,
  maxX: 2.1,
  /**
   * Behind the bench front edge.
   *
   * The bench spans z -0.33..0.33 and the operator stands at z = -0.86, which
   * leaves ~0.27 m of clearance between the body radius and the bench face: close
   * enough to work, far enough that walking forward is not immediately a
   * collision.
   */
  minZ: -1.42,
  /** Short of the back wall at z = 1.9, with room to stand back and read the board. */
  maxZ: 1.2,
} as const;

/** Radius of the operator's body, used for wall collision. */
const BODY_RADIUS = 0.26;

/** Walk speed in m/s. A technician moves deliberately, not at a sprint. */
const WALK_SPEED = 1.15;

/**
 * A jointed low-poly technician in a cleanroom suit.
 *
 * Built from primitives deliberately: a fab bunny suit is unglamorous, and the
 * silhouette that reads is the hood, the shoulders and the apron -- not detail.
 * Every part hangs off a joint so the walk cycle can actually articulate rather
 * than sliding a rigid mannequin around.
 */
export class Operator {
  readonly root: TransformNode;

  private readonly hips: TransformNode;
  private readonly torso: TransformNode;
  private readonly head: TransformNode;
  private readonly legL: TransformNode;
  private readonly legR: TransformNode;
  private readonly armL: TransformNode;
  private readonly armR: TransformNode;

  /**
   * Gait phase in radians. Advanced by distance travelled, not by time, so the
   * legs stay in step with the feet: a time-driven cycle on a stationary
   * operator shuffles in place, which reads as broken rather than as breathing.
   */
  private gait = 0;

  /** Horizontal velocity, m/s. Drives the lean and the arm swing. */
  private readonly vx: Spring;
  private readonly vz: Spring;

  /** Where the operator is standing. */
  // Standing position: in front of the bench, not under it. The bench occupies
  // |x| < 1.25 across z -0.33..0.33, so an operator at the origin would be
  // standing inside the workstation with every forward step blocked by it.
  //
  // Offset to the LEFT of centre. The orbit camera sits at z ~ -1.67 looking at the
  // wafer stage, so an operator standing at x = 0 is directly between the lens and
  // the instrument and hides the thing the player is trying to measure. Standing at
  // the traveller's side frames the bench over the operator's shoulder instead,
  // which is the only framing where both the body and the wafer are readable.
  private x = -0.62;
  private z = -0.8;

  /** Facing, radians about Y. */
  private yaw = 0;

  constructor(private readonly world: Scene) {
    this.root = new TransformNode('operator', world);
    // The origin is the operator's feet; the rig hangs upward from it.
    this.root.position = new Vector3(this.x, 0, this.z);

    // Vertical joints offset on Y (the skeleton stacks upward from the feet);
    // shoulder and hip joints offset on X (the body has width).
    this.hips = joint(world, this.root, 'op-hips', 0, 0.86);
    this.torso = joint(world, this.hips, 'op-torso', 0, 0.26);
    this.head = joint(world, this.torso, 'op-head', 0, 0.42);
    this.legL = joint(world, this.hips, 'op-leg-l', -0.11, 0);
    this.legR = joint(world, this.hips, 'op-leg-r', 0.11, 0);
    this.armL = joint(world, this.torso, 'op-arm-l', -0.23, 0);
    this.armR = joint(world, this.torso, 'op-arm-r', 0.23, 0);

    this.build();

    this.vx = new Spring(0, SpringProfile.OVER);
    this.vz = new Spring(0, SpringProfile.OVER);
  }

  private build(): void {
    const suit = matte(this.world, 'op-suit-mat', Color3.FromHexString('#e6ebf2'), 0.05);
    // A slightly darker apron and hood trim: a pure white figure on a white bench
    // disappears, and the operator has to read against the workstation.
    const trim = matte(this.world, 'op-trim-mat', Color3.FromHexString('#9fb0c4'), 0.05);
    const visor = steel(this.world, 'op-visor-mat', '#2b3540');
    const glove = matte(this.world, 'op-glove-mat', Color3.FromHexString('#c8d2e0'), 0.05);

    // Torso: a slightly tapered box reads as a body without a model.
    const chest = CreateBox('op-chest', { width: 0.34, height: 0.44, depth: 0.22 }, this.world);
    chest.parent = this.torso;
    chest.material = suit;

    // Apron front panel, in the darker trim.
    const apron = CreateBox('op-apron', { width: 0.3, height: 0.34, depth: 0.02 }, this.world);
    apron.parent = this.torso;
    apron.position = new Vector3(0, -0.04, -0.115);
    apron.material = trim;

    // Hood: a sphere reads as a hooded head far better than a box does.
    const hood = CreateSphere('op-hood', { diameter: 0.235, segments: 10 }, this.world);
    hood.parent = this.head;
    hood.material = suit;
    const face = CreateBox('op-visor', { width: 0.16, height: 0.085, depth: 0.03 }, this.world);
    face.parent = this.head;
    face.position = new Vector3(0, 0.01, -0.098);
    face.material = visor;

    for (const [joint, name, sign] of [
      [this.legL, 'l', -1],
      [this.legR, 'r', 1],
    ] as const) {
      const leg = CreateCylinder(`op-leg-${name}`, { diameter: 0.115, height: 0.66, tessellation: 10 }, this.world);
      leg.parent = joint;
      leg.position = new Vector3(0, -0.33, 0);
      leg.material = suit;
      const boot = CreateBox(`op-boot-${name}`, { width: 0.13, height: 0.075, depth: 0.22 }, this.world);
      boot.parent = joint;
      boot.position = new Vector3(0, -0.66, -0.035);
      boot.material = trim;
      void sign;
    }

    for (const [joint, name] of [
      [this.armL, 'l'],
      [this.armR, 'r'],
    ] as const) {
      const arm = CreateCylinder(`op-arm-${name}`, { diameter: 0.085, height: 0.5, tessellation: 10 }, this.world);
      arm.parent = joint;
      arm.position = new Vector3(0, -0.25, 0);
      arm.material = suit;
      const hand = CreateSphere(`op-hand-${name}`, { diameter: 0.085, segments: 8 }, this.world);
      hand.parent = joint;
      hand.position = new Vector3(0, -0.51, 0);
      hand.material = glove;
    }
  }

  /** Where the operator is standing, for camera targeting. */
  get position(): { x: number; z: number } {
    return { x: this.x, z: this.z };
  }

  /** Eye position, for a first-person or VR camera. */
  get eye(): Vector3 {
    return new Vector3(this.x, OPERATOR_EYE_Y, this.z);
  }

  get facing(): number {
    return this.yaw;
  }

  /** Whether the operator is currently walking. */
  get moving(): boolean {
    return Math.hypot(this.vx.value, this.vz.value) > 0.08;
  }

  /**
   * Walk toward a world-space direction.
   *
   * `dir` is in camera-relative space and is expected to be normalised by the
   * caller. The operator accelerates rather than snapping: `vx`/`vz` are heavily
   * damped springs, so starting and stopping have weight. Instant velocity on a
   * walking figure looks like a cursor, not a person.
   */
  move(dir: { x: number; z: number }, dt: number): void {
    const targetVx = dir.x * WALK_SPEED;
    const targetVz = dir.z * WALK_SPEED;
    this.vx.target = targetVx;
    this.vz.target = targetVz;
    this.vx.step(dt);
    this.vz.step(dt);

    const speed = Math.hypot(this.vx.value, this.vz.value);
    if (speed > 0.02) {
      this.x += this.vx.value * dt;
      this.z += this.vz.value * dt;
      this.clampToBay();
      // Face the direction of travel, smoothly.
      const heading = Math.atan2(this.vx.value, this.vz.value);
      this.yaw = angleTowards(this.yaw, heading, dt * 9);
    }

    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.rotation.y = this.yaw;

    // Advance the gait by distance, so the legs track the feet.
    this.gait += speed * dt * 3.1;
    this.pose();
  }

  /**
   * Stop dead and stand at ease.
   *
   * Called when a bench takes the view. The operator does not keep drifting across
   * the room while the player is working at a bath, and does not wander into frame
   * in front of an instrument they are trying to read.
   */
  stand(): void {
    this.vx.target = 0;
    this.vz.target = 0;
    this.vx.value = 0;
    this.vz.value = 0;
    this.vx.velocity = 0;
    this.vz.velocity = 0;
  }

  /** Snap to a standing position without animating. Used when a bench opens. */
  placeAt(x: number, z: number, yaw?: number): void {
    this.stand();
    this.x = clamp(x, WALK_AREA.minX + BODY_RADIUS, WALK_AREA.maxX - BODY_RADIUS);
    this.z = clamp(z, WALK_AREA.minZ + BODY_RADIUS, WALK_AREA.maxZ - BODY_RADIUS);
    if (yaw !== undefined) this.yaw = yaw;
    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.rotation.y = this.yaw;
  }

  /** Hide the operator, e.g. when framing tightly on a bath. */
  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  /**
   * Keep the operator inside the bay and out of the bench.
   *
   * Two constraints: the walkable rectangle, and the bench itself, which occupies
   * x -1.25..1.25 at z -0.33..0.33. A technician standing at the bench is at
   * z < -0.33; walking into the bench is the obvious thing to get wrong, so it is
   * resolved by pushing out along the shortest axis rather than by refusing input,
   * which would make the operator stick to the obstacle.
   */
  private clampToBay(): void {
    const minX = WALK_AREA.minX + BODY_RADIUS;
    const maxX = WALK_AREA.maxX - BODY_RADIUS;
    const minZ = WALK_AREA.minZ + BODY_RADIUS;
    const maxZ = WALK_AREA.maxZ - BODY_RADIUS;
    this.x = clamp(this.x, minX, maxX);
    this.z = clamp(this.z, minZ, maxZ);

    // Bench collision. The operator is pushed to whichever side they are nearer.
    const benchHalfX = 1.25 + BODY_RADIUS * 0.5;
    const benchFrontZ = -0.33 - BODY_RADIUS;
    const benchBackZ = 0.33 + BODY_RADIUS;
    if (Math.abs(this.x) < benchHalfX && this.z > benchFrontZ && this.z < benchBackZ) {
      this.z = this.z - 0.33 < 0.33 - this.z ? benchFrontZ : benchBackZ;
    }
  }

  /**
   * Articulate the walk cycle.
   *
   * Legs swing in antiphase from the gait phase; arms swing opposite the leg on the
   * same side, which is what makes a walk read as a walk. A small vertical bob at
   * twice the gait rate sells the weight, and the torso leans very slightly into
   * the direction of travel.
   */
  private pose(): void {
    const swing = 0.52;
    const s = Math.sin(this.gait);
    const c = Math.cos(this.gait);
    this.legL.rotation.x = s * swing;
    this.legR.rotation.x = -s * swing;
    this.armL.rotation.x = -s * swing * 0.7;
    this.armR.rotation.x = s * swing * 0.7;
    // Knees stay mostly straight; a little counter-rotation stops the legs looking
    // like they are on rails.
    this.legL.rotation.z = c * 0.05;
    this.legR.rotation.z = -c * 0.05;

    const speed = Math.hypot(this.vx.value, this.vz.value);
    const bob = Math.abs(Math.sin(this.gait)) * 0.022 * Math.min(1, speed / WALK_SPEED);
    this.hips.position.y = 0.86 + bob;
    this.hips.rotation.x = Math.min(0.09, speed * 0.06);
    this.torso.rotation.y = -s * 0.06;
    this.head.rotation.x = -this.hips.rotation.x * 0.6;
  }
}

/**
 * A rig joint.
 *
 * `x` is body width (shoulders, hips) and `y` is height up the skeleton. Taking
 * both explicitly rather than one `offset` is deliberate: a single-axis helper
 * makes it trivially easy to build a vertical rig sideways, which is invisible in
 * code review and obvious on screen.
 */
function joint(scene: Scene, parent: TransformNode, name: string, x: number, y: number): TransformNode {
  const n = new TransformNode(name, scene);
  n.parent = parent;
  n.position = new Vector3(x, y, 0);
  return n;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Shortest-arc angular approach, so turning never unwinds the long way. */
function angleTowards(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}

/** Meshes the operator owns, for tests that assert the body exists. */
export function operatorMeshes(root: TransformNode): AbstractMesh[] {
  return root.getChildMeshes(false);
}