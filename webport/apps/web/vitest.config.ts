import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // NullEngine builds the real Babylon scene graph, which is slower to
    // construct than a plain module import, so give it room without masking a
    // genuine hang.
    testTimeout: 30_000,
    environment: 'node',
    setupFiles: ['./test/offscreen-stub.ts'],
  },
});
