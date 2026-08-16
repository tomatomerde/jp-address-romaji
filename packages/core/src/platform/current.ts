/**
 * Which platform bindings are in effect.
 *
 * The entry point installs them: `index.ts` (Node) calls `setPlatform` with
 * the Node bindings, `index.browser.ts` with the browser ones. The default
 * below is the browser implementation, because it is the one with no `node:`
 * imports — a module graph that never reaches `platform/node.ts` is exactly
 * what a browser bundle needs.
 *
 * A consequence worth knowing when working on this repository: importing the
 * internal modules directly (as every test file does) does NOT install the
 * Node bindings, so dataset reads come back empty. `test/setup.ts` imports the
 * real entry point for that reason, rather than calling `setPlatform` itself —
 * losing the wiring in `index.ts` then turns the whole suite red instead of
 * going unnoticed.
 */

import { browserPlatform } from './browser.js';
import type { Platform } from './types.js';

let current: Platform = browserPlatform;

export function setPlatform(platform: Platform): void {
  current = platform;
}

export function getPlatform(): Platform {
  return current;
}
