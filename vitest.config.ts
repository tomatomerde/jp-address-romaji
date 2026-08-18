import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Installs the Node platform bindings the way the package entry point
    // does — test files import the internal modules directly, which skips it.
    // See the file itself for why it is not a plain `setPlatform` call.
    setupFiles: ['./packages/core/test/setup.ts'],
    environment: 'node',
    // Data loading is cached per process; keep suites isolated.
    pool: 'forks',
    // The round-trip property test converts several thousand addresses twice
    // over and has measured anywhere from 13s to 20s depending on machine load.
    // A 20s limit made it flake; this is headroom, not an expectation.
    testTimeout: 60_000,
  },
});
