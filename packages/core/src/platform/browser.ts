/**
 * Browser bindings: there is no filesystem and no package resolution.
 *
 * Every local-data capability is answered with `undefined` rather than an
 * approximation. A browser caller must pass `configureDataSource({ endpoint })`
 * pointing at data they serve themselves; until they do, conversions fail with
 * `DATA_NOT_CONFIGURED`, which is the same explicit refusal Node gives when no
 * dataset is installed.
 *
 * This module must never import from `node:`, and neither may anything it
 * pulls in — it is the whole reason the browser build is bundleable.
 */

import type { Platform } from './types.js';

export const browserPlatform: Platform = {
  name: 'browser',

  // A `file:` URL cannot be fetched from a page (browsers block it), so there
  // is nothing to attempt: `configureDataSource({ dataDir })` never produces
  // one here in the first place — see `dataDirToEndpoint` below.
  readFileUrl(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  },

  resolveBundledDataDir(): string | undefined {
    return undefined;
  },

  dataDirToEndpoint(): string | undefined {
    return undefined;
  },
};
