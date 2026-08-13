import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 60000,
    hookTimeout: 120000,
    // e2e tests are sequential — only one mini program instance
    fileParallelism: false,
    // Allow 60s for mini program launch
    setupFiles: [],
  },
});
