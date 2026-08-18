/**
 * Prove the browser build works in a browser.
 *
 * Everything else about the browser support is checked by things that are not
 * browsers: `packages/core/test/browserEntry.test.ts` runs the browser
 * platform bindings under Node, and typecheck/build run over the source. None
 * of that would notice the failure this exists to catch — a `node:` import
 * back in the shared module graph, which no Node test can see because Node
 * resolves it happily.
 *
 * So this consumes the package the way a front-end developer does:
 *
 *   1. pack the tarball and install it into a scratch project;
 *   2. bundle `import 'jp-address-romaji'` with esbuild targeting the browser,
 *      which resolves the `browser` export condition and FAILS if anything in
 *      the graph imports a Node builtin;
 *   3. serve the bundle and the repository's fixture dataset over HTTP;
 *   4. drive headless Chromium through the same conversions the README shows,
 *      including one that must be refused;
 *   5. assert that the page talked to nobody but its own origin.
 *
 * Step 5 is the privacy claim in its browser form. The dataset request carries
 * the prefecture and the municipality; the rest of the address never leaves
 * the page. That is weaker than the Node guarantee (where nothing leaves the
 * process at all), which is exactly why it is measured rather than asserted in
 * prose.
 *
 * Usage: node scripts/browser-smoke.mjs [--keep]
 *   --keep  leave the scratch directory in place and print its path
 */

import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CORE_DIR = path.join(REPO_ROOT, 'packages', 'core');
const FIXTURE_DATA_DIR = path.join(CORE_DIR, 'test', 'fixtures', 'data');

const keep = process.argv.includes('--keep');

/** Addresses the page must handle, and what it must answer. Asserted below. */
const EXPECTED = {
  forward: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan',
  reverse: '東京都新宿区西新宿二丁目8-1',
  refusalReason: 'NO_ROMAJI_DATA',
  unconfiguredReason: 'DATA_NOT_CONFIGURED',
};

function run(command, args, cwd) {
  return execFileSync(command, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function log(message) {
  console.log(`[browser-smoke] ${message}`);
}

/** Static file server for the scratch web root, bound to loopback. */
function serve(root) {
  const seen = [];
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    seen.push(requested);
    const file = path.join(root, path.normalize(requested === '/' ? '/index.html' : requested));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    fsp.readFile(file).then(
      (body) => {
        const type = file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : file.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : 'application/json; charset=utf-8';
        res.writeHead(200, { 'content-type': type }).end(body);
      },
      () => {
        res.writeHead(404).end();
      },
    );
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/**
 * The page. All browser-side code lives here rather than in a `page.evaluate`
 * callback, so that it is never linted or type-checked as if it were Node.
 *
 * It reports through `window.__smoke`, which Playwright waits for: a thrown
 * error inside a module script would otherwise be a silent blank page.
 */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>jp-address-romaji browser smoke test</title>
<body>
<script type="module">
import { configureDataSource, isDataConfigured, toRomaji, fromRomaji } from './lib.js';

const out = { steps: {} };
try {
  // 1. A dataDir cannot work in a page. It must refuse, not half-configure.
  configureDataSource({ dataDir: '/address-data' });
  out.steps.dataDirConfigured = isDataConfigured();
  out.steps.unconfigured = await toRomaji('東京都新宿区西新宿二丁目8番1号');

  // 2. Data served from this origin.
  configureDataSource({ endpoint: window.location.origin + '/data/ja' });
  out.steps.endpointConfigured = isDataConfigured();
  out.steps.forward = await toRomaji('東京都新宿区西新宿二丁目8番1号');
  out.steps.reverse = await fromRomaji('2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo');

  // 3. A town whose dataset row carries no usable reading is still refused.
  out.steps.refused = await toRomaji('青森県青森市大字三内字丸山1-1');
} catch (error) {
  out.error = String(error && error.stack ? error.stack : error);
}
window.__smoke = out;
</script>
</body>
`;

const failures = [];
function check(condition, message) {
  if (!condition) failures.push(message);
}

const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), 'jp-address-romaji-browser-'));
let server;
let browser;
try {
  if (!fs.existsSync(path.join(CORE_DIR, 'dist', 'index.browser.js'))) {
    throw new Error('packages/core/dist is missing or stale — run `pnpm -r build` first.');
  }

  const tarballDir = path.join(scratch, 'tarball');
  const consumer = path.join(scratch, 'consumer');
  const www = path.join(scratch, 'www');
  // `npm pack --pack-destination` does not create its destination; it fails
  // with ENOENT if it is missing.
  await fsp.mkdir(tarballDir, { recursive: true });
  await fsp.mkdir(consumer, { recursive: true });
  await fsp.mkdir(www, { recursive: true });

  log('packing packages/core');
  run('npm', ['pack', '--pack-destination', tarballDir, '--silent'], CORE_DIR);
  const tarball = path.join(tarballDir, (await fsp.readdir(tarballDir))[0]);

  // --omit=peer: the peer dependency is the ~100 MB dataset. The fixture
  // directory served below exercises the same code path without it.
  log('installing the tarball into a scratch project');
  run('npm', ['init', '-y'], consumer);
  run('npm', ['install', '--omit=peer', '--no-audit', '--no-fund', '--silent', tarball], consumer);

  // A bare specifier, so that resolution goes through the package's `exports`
  // map — bundling `dist/index.browser.js` by path would prove nothing about
  // the `browser` condition being wired up correctly.
  await fsp.writeFile(
    path.join(consumer, 'entry.js'),
    "export { configureDataSource, isDataConfigured, toRomaji, fromRomaji } from 'jp-address-romaji';\n",
  );

  log('bundling for the browser (esbuild, platform=browser)');
  try {
    run(
      path.join(REPO_ROOT, 'node_modules', '.bin', 'esbuild'),
      [
        path.join(consumer, 'entry.js'),
        '--bundle',
        '--format=esm',
        '--platform=browser',
        `--outfile=${path.join(www, 'lib.js')}`,
        '--log-level=warning',
      ],
      consumer,
    );
  } catch {
    // esbuild has already printed what it could not resolve. Name the likely
    // cause, because the fix is never in the bundler: a module reachable from
    // `src/index.browser.ts` imports something Node-only, and it belongs
    // behind the platform bindings in `src/platform/`.
    throw new Error(
      'the browser bundle did not build (see esbuild output above). ' +
        'If it names a `node:` module, something reachable from src/index.browser.ts ' +
        'imports it directly — move it into src/platform/node.ts.',
    );
  }

  // Belt and braces: esbuild fails on an unresolvable `node:` import, but a
  // future bundler flag or a shim could turn that into a silent stub. The
  // built file must contain no reference to one at all.
  const bundle = await fsp.readFile(path.join(www, 'lib.js'), 'utf-8');
  const nodeBuiltin = bundle.match(/["']node:[a-z/]+["']/);
  check(nodeBuiltin === null, `bundle references a Node builtin: ${nodeBuiltin?.[0]}`);

  await fsp.cp(FIXTURE_DATA_DIR, path.join(www, 'data'), { recursive: true });
  await fsp.writeFile(path.join(www, 'index.html'), PAGE);

  const served = await serve(www);
  server = served.server;
  const { origin, seen } = served;

  const { chromium } = await import('playwright');
  log('launching headless Chromium');
  browser = await chromium.launch();
  const page = await browser.newPage();

  const external = [];
  const pageErrors = [];
  page.on('request', (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url());
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await page.goto(`${origin}/index.html`);
  await page.waitForFunction('window.__smoke !== undefined', null, { timeout: 30_000 });
  const result = await page.evaluate('window.__smoke');

  check(!result.error, `the page threw: ${result.error}`);
  check(pageErrors.length === 0, `uncaught page errors: ${pageErrors.join(', ')}`);

  const s = result.steps ?? {};
  check(s.dataDirConfigured === false, 'configureDataSource({ dataDir }) claimed to be configured');
  check(
    s.unconfigured?.ok === false && s.unconfigured?.reason === EXPECTED.unconfiguredReason,
    `expected ${EXPECTED.unconfiguredReason}, got ${JSON.stringify(s.unconfigured)}`,
  );
  check(s.endpointConfigured === true, 'configureDataSource({ endpoint }) did not configure');
  check(
    s.forward?.ok === true && s.forward?.value?.formatted === EXPECTED.forward,
    `toRomaji: expected "${EXPECTED.forward}", got ${JSON.stringify(s.forward)}`,
  );
  check(
    s.reverse?.ok === true && s.reverse?.value?.formatted === EXPECTED.reverse,
    `fromRomaji: expected "${EXPECTED.reverse}", got ${JSON.stringify(s.reverse)}`,
  );
  check(
    s.refused?.ok === false && s.refused?.reason === EXPECTED.refusalReason,
    `expected ${EXPECTED.refusalReason}, got ${JSON.stringify(s.refused)}`,
  );

  check(external.length === 0, `the page contacted another origin: ${external.join(', ')}`);
  const dataRequests = seen.filter((p) => p.startsWith('/data/'));
  check(
    dataRequests.includes('/data/ja/東京都/新宿区.json'),
    `the municipality file was never requested; saw ${JSON.stringify(dataRequests)}`,
  );
  check(
    !dataRequests.some((p) => p.includes('西新宿') || p.includes('5-12')),
    `an address component past the municipality reached the server: ${JSON.stringify(dataRequests)}`,
  );

  const version = JSON.parse(
    await fsp.readFile(path.join(consumer, 'node_modules', 'jp-address-romaji', 'package.json'), 'utf-8'),
  ).version;

  if (failures.length > 0) {
    console.error(`\n[browser-smoke] FAILED (${failures.length}):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    log(`jp-address-romaji ${version} converts in Chromium, refuses what it should,`);
    log(`and requested only: ${dataRequests.join(', ')}`);
    log('OK');
  }
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  if (keep) {
    log(`scratch directory kept at ${scratch}`);
  } else {
    await fsp.rm(scratch, { recursive: true, force: true });
  }
}
