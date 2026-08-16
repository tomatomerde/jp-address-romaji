/**
 * Global test setup: install the Node platform bindings.
 *
 * Test files import the modules under test directly (`../src/normalizer.js`),
 * not through the package entry point, and it is the entry point that installs
 * the bindings (see `src/platform/current.ts`). Without this file every
 * dataset read would come back empty and the whole suite would fail for a
 * reason that has nothing to do with what it is testing.
 *
 * This imports the real entry point rather than calling `setPlatform` itself,
 * deliberately: the suite then runs against the same wiring a consumer gets,
 * and deleting that wiring from `index.ts` turns the suite red instead of
 * going unnoticed. `browserEntry.test.ts` swaps the bindings back per test.
 *
 * Registered in the root `vitest.config.ts`.
 */

import '../src/index.js';
