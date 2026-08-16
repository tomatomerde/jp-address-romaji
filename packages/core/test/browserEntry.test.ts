/**
 * The browser build, exercised from Node.
 *
 * These tests install the browser platform bindings — the same ones a bundler
 * selects through the `browser` export condition — and then use the library
 * exactly as a page would: no filesystem, data served over HTTP from an
 * endpoint the caller names.
 *
 * They are not a substitute for running the thing in a browser. Node has no
 * bundler in the loop, so nothing here would notice a `node:` import creeping
 * back into the shared module graph; that is what `scripts/browser-smoke.mjs`
 * is for, and it runs in CI. What these tests pin down is the behaviour:
 * `dataDir` refuses instead of pretending, an HTTP endpoint converts, and a
 * refusal is still a refusal.
 *
 * The HTTP server below is bound to 127.0.0.1 and serves the repository's own
 * fixture dataset, so no test here reaches the network. The offline guarantee
 * covers the DEFAULT configuration; an endpoint the caller passes explicitly
 * is the documented opt-in, and it has to be tested somewhere.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { configureDataSource, isDataConfigured } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { browserPlatform } from '../src/platform/browser.js';
import { nodePlatform } from '../src/platform/node.js';
import { getPlatform, setPlatform } from '../src/platform/current.js';
import { FIXTURE_DATA_DIR } from './helpers.js';

/** Serve the fixture dataset over HTTP, the way a browser deployment would. */
function serveFixtures(): Promise<{ origin: string; server: Server; paths: string[] }> {
  const paths: string[] = [];
  const server = createServer((req, res) => {
    // Requests arrive percent-encoded (`/ja/%E6%9D%B1%E4%BA%AC%E9%83%BD/...`);
    // the files on disk carry the Japanese names.
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    paths.push(requested);
    const file = path.join(FIXTURE_DATA_DIR, path.normalize(requested));
    if (!file.startsWith(FIXTURE_DATA_DIR)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => {
        res.writeHead(200, { 'content-type': 'application/json' }).end(body);
      },
      () => {
        res.writeHead(404).end();
      },
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, server, paths });
    });
  });
}

describe('browser platform bindings', () => {
  let origin: string;
  let server: Server;
  let requestedPaths: string[];

  beforeAll(async () => {
    ({ origin, server, paths: requestedPaths } = await serveFixtures());
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  afterEach(() => {
    // Restore what `test/setup.ts` installed, so a failure here cannot leak
    // into the rest of the suite if these ever stop running in isolation.
    setPlatform(nodePlatform);
    clearDataCache();
  });

  it('refuses a dataDir instead of pretending it was configured', async () => {
    setPlatform(browserPlatform);
    clearDataCache();
    // A real directory that works fine under Node — the point is that the
    // browser bindings decline it rather than half-configuring the library.
    configureDataSource({ dataDir: FIXTURE_DATA_DIR });

    expect(isDataConfigured()).toBe(false);

    const forward = await toRomaji('東京都新宿区西新宿三丁目5番12号');
    expect(forward.ok).toBe(false);
    if (!forward.ok) expect(forward.reason).toBe('DATA_NOT_CONFIGURED');

    const back = await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.reason).toBe('DATA_NOT_CONFIGURED');
  });

  it('converts both ways against an HTTP endpoint', async () => {
    setPlatform(browserPlatform);
    clearDataCache();
    configureDataSource({ endpoint: `${origin}/ja` });
    expect(isDataConfigured()).toBe(true);

    const forward = await toRomaji('東京都新宿区西新宿三丁目5番12号');
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(forward.value.formatted).toBe('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan');

    const back = await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.formatted).toBe('東京都新宿区西新宿三丁目5-12');

    // What the endpoint actually saw: the prefecture and the municipality, and
    // nothing past them. This is the claim the browser documentation makes, so
    // it is asserted rather than described.
    expect(requestedPaths).toContain('/ja/東京都/新宿区.json');
    expect(requestedPaths.some((p) => p.includes('西新宿') || p.includes('5-12'))).toBe(false);
  });

  it('still refuses an address with no usable reading', async () => {
    setPlatform(browserPlatform);
    clearDataCache();
    configureDataSource({ endpoint: `${origin}/ja` });

    const result = await toRomaji('青森県青森市大字三内字丸山1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_ROMAJI_DATA');
    expect(result.partial?.city?.romaji).toBe('Aomori-shi');
  });

  it('is what the browser entry point installs', async () => {
    // Undo the Node bindings `test/setup.ts` put in place, then evaluate the
    // browser entry point for the first time in this process and check that it
    // is the entry point — not this file — that made the swap.
    setPlatform(nodePlatform);
    await import('../src/index.browser.js');
    expect(getPlatform().name).toBe('browser');
  });
});
