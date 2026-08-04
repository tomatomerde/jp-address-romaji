/**
 * Locator for the bundled address dataset.
 *
 * `jp-address-romaji` finds this package automatically; you normally do not
 * need to import it. It is exported for setups that resolve the directory
 * themselves (bundlers, containers, read-only filesystems).
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Absolute path to the dataset directory (the parent of `ja.json`). */
export const dataDir: string = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

/** Has the dataset actually been generated into this package? */
export function isDataPresent(): boolean {
  return fs.existsSync(path.join(dataDir, 'ja.json'));
}
