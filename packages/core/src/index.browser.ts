/**
 * jp-address-romaji — browser entry point.
 *
 * Selected by bundlers through the `browser` condition in this package's
 * `exports` map. It exposes exactly the same API as the Node entry point, with
 * one difference that cannot be papered over: a page has no filesystem, so the
 * dataset has to come from an endpoint you serve yourself.
 *
 * ```ts
 * import { configureDataSource, toRomaji } from 'jp-address-romaji';
 *
 * configureDataSource({ endpoint: 'https://example.com/address-data/ja' });
 * await toRomaji('東京都新宿区西新宿三丁目5番12号');
 * ```
 *
 * `configureDataSource({ dataDir })` cannot work here and does not pretend to:
 * it leaves the library unconfigured, and conversions return
 * `DATA_NOT_CONFIGURED` rather than silently reaching for a remote default.
 *
 * What the privacy claim means in a browser: the request that fetches
 * `<endpoint>/<prefecture>/<municipality>.json` puts the prefecture and the
 * municipality in a URL on your server's access log. The block number, the
 * building name and the addressee never leave the page. That is a weaker
 * guarantee than the Node path, where nothing leaves the process at all — say
 * so where your users can see it.
 */

import { setPlatform } from './platform/current.js';
import { browserPlatform } from './platform/browser.js';

// Already the default in `platform/current.ts`; stated here so that the two
// entry points read the same way and neither depends on which one that is.
setPlatform(browserPlatform);

export * from './api.js';
