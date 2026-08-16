/**
 * jp-address-romaji — Node entry point (the package default).
 *
 * Installs the Node platform bindings and re-exports the API. The dataset is
 * read from the filesystem here: `configureDataSource({ dataDir })` works, and
 * an installed `jp-address-romaji-data` is found automatically, so nothing an
 * address is converted against ever leaves the machine.
 *
 * Browsers get `index.browser.ts` instead, through the `browser` condition in
 * this package's `exports` map. The two files differ only in these three
 * lines; the API itself lives in `api.ts`.
 */

import { setPlatform } from './platform/current.js';
import { nodePlatform } from './platform/node.js';

setPlatform(nodePlatform);

export * from './api.js';
