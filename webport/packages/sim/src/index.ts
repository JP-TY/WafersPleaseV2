/**
 * @wafers/sim — deterministic simulation core.
 *
 * Hard constraint, enforced by `npm run typecheck` plus the import ban in
 * `test/purity.test.ts`: nothing in this package may import an engine, the DOM,
 * or Node built-ins. Every module here is a pure function of its inputs, which
 * is what makes the whole assessment surface testable headlessly.
 */
export * from './rng.js';
export * from './generation/wafer.js';
export * from './generation/lot-generator.js';
export * from './evaluation/disposition.js';
export * from './rework/recipes.js';
export * from './assessment/metrology.js';
export * from './evaluation/scoring.js';
export * from './assessment/metrics.js';
export * from './shift/shift-director.js';
export * from './rework/process.js';
export * from './rework/rca-clean.js';
export * from './rework/silicide-etch.js';
export * from './rework/cmp-endpoint.js';
