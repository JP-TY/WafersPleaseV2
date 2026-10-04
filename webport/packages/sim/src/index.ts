/**
 * @wafers/sim — deterministic simulation core.
 *
 * Hard constraint, enforced by `npm run typecheck` plus the import ban in
 * `test/purity.test.ts`: nothing in this package may import an engine, the DOM,
 * or Node built-ins. Every module here is a pure function of its inputs, which
 * is what makes the whole assessment surface testable headlessly.
 */
export * from './rng.js';
export * from './rework/process.js';
export * from './rework/rca-clean.js';
export * from './rework/silicide-etch.js';
export * from './rework/cmp-endpoint.js';
