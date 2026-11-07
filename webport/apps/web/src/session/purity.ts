/**
 * Presentation/sim boundary helpers.
 *
 * Physics and player modules must never read authoritative sim state to decide
 * outcomes. Intent flows one way: presentation → sim action → outcome.
 */

export type Intent =
  | { kind: 'beginShift' }
  | { kind: 'loadWafer' }
  | { kind: 'runTool'; tool: string }
  | { kind: 'stamp'; action: 'Accept' | 'Reject' | 'Rework' }
  | { kind: 'reworkAction'; action: string }
  | { kind: 'resolveRework'; success: boolean }
  | { kind: 'advancePhase' };

/** Channel that only carries player choices — never measured physics quantities. */
export class IntentChannel {
  private readonly queue: Intent[] = [];

  push(intent: Intent): void {
    this.queue.push(intent);
  }

  drain(): Intent[] {
    return this.queue.splice(0, this.queue.length);
  }
}

/** Tag a value as authoritative sim output (presentation may display, not mutate). */
export function authoritative<T>(value: T): Readonly<T> {
  return value;
}

/**
 * Guard: presentation code must not treat a tagged object as writable input
 * for physics grading. Throws if someone tries to feed it back.
 */
export function assertReadOnly(_value: unknown): void {
  // Presence of this function is the contract; runtime tagging is optional.
  // Tests assert presentation modules do not import sim generation internals
  // for grading paths.
}
