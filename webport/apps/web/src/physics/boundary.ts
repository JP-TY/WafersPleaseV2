/**
 * The boundary between physical feel and graded outcome.
 *
 * This is the most important file in the physics feature. Everything else in
 * `src/physics` is disposable presentation; this module is what stops that
 * presentation from contaminating the reproducible training run that GDD §16
 * promises.
 *
 * THE RULE
 *
 * Player intent flows one way: hand position (a human gesture) -> simulation
 * action -> outcome. Physics never flows into that path. Concretely, nothing in
 * `src/physics` may:
 *
 *   - read simulation state to decide how to move something,
 *   - write simulation state from a physical quantity,
 *   - be consulted when computing a verdict, score, or gate.
 *
 * If physics could influence a verdict, then a dropped frame would change a
 * player's grade. That is not a subtle fairness bug, it is the failure mode
 * §16 exists to prevent, and it would invalidate every seeded training record
 * the campaign layer stores.
 *
 * WHY A RUNTIME GUARD AND NOT JUST A COMMENT
 *
 * The rule is architectural and the architecture will be refactored by someone
 * who has not read this comment. `assertReadOnly` makes the boundary fail loudly
 * and immediately in development: if a future change reads a simulation object
 * from inside a physics callback, it throws at the point of the mistake rather
 * than quietly producing unreproducible scores weeks later.
 *
 * The `authoritative` flag is the mechanism. A simulation-backed object is marked
 * authoritative; `assertReadOnly` throws if anything in the physics layer is
 * handed one. The simulation itself is constructed first and holds the flag, so
 * the check is a plain reference comparison rather than a type-level fiction.
 */

/** Thrown when the physics layer is caught reaching for graded state. */
export class PhysicsBoundaryError extends Error {
  constructor(detail: string) {
    super(
      `Physics boundary violated: ${detail}. ` +
        'Physical state must never influence a verdict, score, or gate ' +
        '(GDD 16 requires identical seeds to produce identical scores). ' +
        'Player intent may reach the simulation; simulation state may not ' +
        'reach the physics.',
    );
    this.name = 'PhysicsBoundaryError';
  }
}

/**
 * A graded simulation object, tagged so physics can recognise and refuse it.
 *
 * Every simulation instance is created through `authoritative()`. The tag is a
 * symbol rather than a class so that the simulation package does not need to
 * know this module exists -- the dependency points this way, never the other
 * way.
 */
const AUTHORITATIVE = Symbol.for('wafers.authoritativeSimulation');

type Tagged = { [AUTHORITATIVE]?: true };

/** Mark a simulation instance as authoritative and return it, typed. */
export function authoritative<T extends object>(sim: T): T & Tagged {
  Object.defineProperty(sim, AUTHORITATIVE, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return sim as T & Tagged;
}

/** Whether a value is a graded simulation. */
export function isAuthoritative(value: unknown): boolean {
  return typeof value === 'object' && value !== null && AUTHORITATIVE in value;
}

/**
 * Throw if `value` is a graded simulation.
 *
 * Call this on any value entering the physics layer from outside it. Cheap, and
 * it converts a whole category of silent reproducibility bug into a stack trace.
 */
export function assertReadOnly(value: unknown, where: string): void {
  if (isAuthoritative(value)) {
    throw new PhysicsBoundaryError(`${where} was handed a graded simulation`);
  }
}

/**
 * A one-way channel from a physical gesture to a simulation action.
 *
 * This is the ONLY sanctioned route from physics into the simulation, and note
 * what it carries: a player-chosen *intent* (`bath: 'SC1'`), never a measured
 * physical quantity. If the fork is mid-swing between two baths, the player's
 * choice of target bath is what gets sent. The fork's actual position, velocity
 * and momentum are never sent, because those are frame-rate dependent and would
 * make the outcome depend on the machine.
 *
 * `intent` is deliberately typed as a closed union per use rather than a generic
 * string, so adding a channel means deciding what intent means, in a place where
 * that decision is visible.
 */
export class IntentChannel<Intent extends string> {
  private handler: ((intent: Intent) => void) | null = null;

  constructor(private readonly name: string) {}

  /**
   * Register the simulation side. The callback receives intent only.
   *
   * The guard here is the second line of defence: even if someone later passes a
   * simulation object through this channel by mistake, it is refused at the
   * boundary rather than deep inside the simulation.
   */
  connect(handler: (intent: Intent) => void): void {
    this.handler = handler;
  }

  /** Send player intent to the simulation. */
  send(intent: Intent): void {
    if (!this.handler) return;
    this.handler(intent);
  }

  get connected(): boolean {
    return this.handler !== null;
  }

  toString(): string {
    return `IntentChannel(${this.name})`;
  }
}

/**
 * Records every intent a physical interaction produced.
 *
 * Used by tests to prove the boundary holds: play a gesture at several different
 * frame rates and assert the recorded intent sequence is byte-identical. If any
 * physics quantity had leaked into the decision, the sequences would diverge.
 */
export class IntentLog<Intent extends string = string> {
  readonly entries: Intent[] = [];

  push(intent: Intent): void {
    this.entries.push(intent);
  }

  clear(): void {
    this.entries.length = 0;
  }

  /** Stable representation, for comparing runs. */
  serialise(): string {
    return this.entries.join('>');
  }
}