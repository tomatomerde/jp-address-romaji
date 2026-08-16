/**
 * Node bindings: the filesystem and package resolution.
 *
 * This is the only module in the package that imports `node:` builtins. It is
 * reachable exclusively from `index.ts` (the default entry point), so a
 * bundler resolving the `browser` export condition never pulls it in — which
 * is what makes the browser build possible at all.
 */

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

import type { Platform } from './types.js';

export const nodePlatform: Platform = {
  name: 'node',

  // Rejects when the file is missing or unreadable; `dataAccess.ts` catches
  // that and reports absence, the same as a failed fetch.
  readFileUrl(url: URL): Promise<string | undefined> {
    return fsp.readFile(fileURLToPath(url), 'utf-8');
  },

  resolveBundledDataDir(): string | undefined {
    try {
      const require = createRequire(import.meta.url);
      // The data package exposes its directory through its package.json.
      const pkgPath = require.resolve('jp-address-romaji-data/package.json');
      const dir = path.join(path.dirname(pkgPath), 'data');
      return fs.existsSync(path.join(dir, 'ja.json')) ? dir : undefined;
    } catch {
      return undefined;
    }
  },

  // The upstream library concatenates `${api}${input}`, where input is
  // ".json" or "/<pref>/<city>.json" — so the endpoint ends at "ja".
  dataDirToEndpoint(dir: string): string {
    return pathToFileURL(path.join(dir, 'ja')).toString();
  },
};
