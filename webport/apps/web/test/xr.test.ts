import { describe, expect, it } from 'vitest';
import { probeXr } from '../src/xr/plan.js';

describe('WebXR path', () => {
  it('probeXr returns a structured plan in Node (unsupported)', async () => {
    const plan = await probeXr();
    expect(plan).toHaveProperty('supported');
    expect(plan).toHaveProperty('note');
    expect(typeof plan.note).toBe('string');
    // jsdom/node has no navigator.xr
    expect(plan.supported).toBe(false);
  });
});
