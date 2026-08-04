import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    // Data loading is cached per process; keep suites isolated.
    pool: 'forks',
    testTimeout: 20_000,
  },
});
