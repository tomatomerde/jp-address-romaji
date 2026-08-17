/**
 * Issue #58 in the exact shape it was reported: a browser-style endpoint that
 * serves only some municipalities, answering 404 for the rest.
 *
 * The sibling `missingTownFile.test.ts` covers the same defect through
 * `dataDir`, where the read fails with ENOENT. This one goes over HTTP with an
 * HTML 404 body, which is what a static host actually returns and what the
 * upstream normalizer hands to `JSON.parse`. Both used to escape `toRomaji` as
 * an uncaught exception.
 *
 * ## Why this is a separate file
 *
 * The upstream normalizer caches resolved municipalities per process and keys
 * that cache on the address, not on the endpoint — so a test that resolved
 * 東京都渋谷区 against a complete dataset earlier in the same process is still
 * answered from that cache after the endpoint is repointed here, and this file
 * would pass while measuring nothing. `vitest.config.ts` runs each test file in
 * its own fork for exactly this reason; the split is what keeps the cache cold.
 */

import path from 'node:path';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configureDataSource } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';
import { toRomaji } from '../src/toRomaji.js';
import { useFixtureData } from './helpers.js';

/** `../fixtures/data` with `ja/東京都/渋谷区.json` removed. See its README. */
const MISSING_TOWN_FILE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-missing-town-file',
  'data',
);

/** In the fixture index, not on the host. */
const UNSERVED_JA = '東京都渋谷区神南一丁目1-1';
/** On the host, so the same endpoint must still convert it. */
const SERVED_JA = '東京都新宿区西新宿三丁目5番12号';
const SERVED_ROMAJI = '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan';

describe('a municipality whose town file the endpoint answers 404 for (issue #58 as reported)', () => {
  let server: Server;
  let origin: string;
  /** Every path the page-equivalent asked for, to assert what was fetched. */
  const requested: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
      requested.push(rel);
      // The same subset the dataDir case uses, served over HTTP: a complete
      // index, and every town file except 東京都渋谷区.
      readFile(path.join(MISSING_TOWN_FILE_DATA_DIR, rel)).then(
        (body) => {
          res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(body);
        },
        () => {
          // HTML, the way GitHub Pages and most static hosts answer a missing
          // file. A JSON 404 body would be parsed successfully and the bug
          // would surface somewhere else entirely, so the test would be
          // rehearsing a situation that does not happen.
          res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>404</h1>');
        },
      );
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    useFixtureData();
  });

  afterEach(() => useFixtureData());

  function useServedSubset(): void {
    clearDataCache();
    requested.length = 0;
    // Serving over HTTP is opt-in, and this is what opting in looks like — the
    // browser entry point has no other way to reach data. The offline
    // guarantee is about the default, not about forbidding a host the caller
    // chose; see DataSourceOptions.endpoint.
    configureDataSource({ endpoint: `${origin}/ja` });
  }

  it('returns a typed failure rather than a JSON parse error', async () => {
    useServedSubset();
    const result = await toRomaji(UNSERVED_JA);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('DATA_NOT_CONFIGURED');
    expect(result.message).toContain('東京都渋谷区');
    expect(result.partial?.city?.ja).toBe('渋谷区');
  });

  it('still converts over the same endpoint what the host does serve', async () => {
    useServedSubset();
    const result = await toRomaji(SERVED_JA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe(SERVED_ROMAJI);
  });

  it('costs no extra request to recover: the retry reads only the cached index', async () => {
    useServedSubset();
    await toRomaji(UNSERVED_JA);
    // The failing attempt reads the index and the missing town file. The
    // municipality-level retry that produces the error message must not add a
    // third: it re-reads the index, which the upstream normalizer has cached.
    // If this count grows, every unserved address costs a visitor an extra
    // round trip — and the demo says it does not.
    //
    // Only the town-level reads are pinned. Whether the index is fetched at
    // all depends on the upstream normalizer's own cache, which this suite
    // cannot clear and which earlier tests in this file have already warmed;
    // asserting on it would make the test pass or fail by execution order.
    // The town file is never cached on a 404, so a second read of it would
    // show up here — which is the thing worth catching.
    expect(requested.filter((rel) => rel.startsWith('/ja/'))).toEqual([
      '/ja/東京都/渋谷区.json',
    ]);
  });

  it('never puts anything past the municipality in a URL', async () => {
    useServedSubset();
    await toRomaji('東京都渋谷区神南一丁目1-1 サンプルビル9F 宛名太郎');
    for (const rel of requested) {
      for (const secret of ['神南', 'サンプルビル', '宛名太郎', '9F', '1-1']) {
        expect(rel).not.toContain(secret);
      }
    }
  });
});
