/**
 * Serves the built demo (demo/_site) and drives it in a real browser.
 *
 * The page makes claims that only a real engine can check, and each one is
 * asserted here rather than assumed:
 *
 *   1. "何も打たなくても結果が見える" — both directions, and at least one
 *      refusal, must be on screen before anyone types.
 *   2. "番地・建物名・宛名は、どこにも送信されません" — an address with a
 *      building name and an addressee is typed in, and every request the
 *      browser then makes is searched for the parts that must not be in one.
 *      This is the claim the whole page exists to make, and the only one whose
 *      failure would make publishing the demo worse than not publishing it.
 *   3. The on-page request list agrees with what the browser actually did.
 *      A page that reassures visitors with a number it computed itself is
 *      worth nothing unless the number is checked from outside.
 *   4. Every figure the page states is re-derived from the built site: the
 *      served municipalities from the files on disk, the nationwide counts
 *      from the shipped index, the prefecture count from the library's own
 *      table, the versions from the pins.
 *   5. Every input case behaved the way the page says it does — the check on
 *      the *published* package that nothing else in this repository performs.
 *
 * Run: pnpm test:demo   (after ./demo/build.sh)
 */
import { createServer } from 'node:http';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

/** Some sandboxes ship a fixed Chromium rather than a downloaded one. */
function resolveExecutablePath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const preinstalled = '/opt/pw-browsers/chromium';
  if (existsSync(preinstalled)) return preinstalled;
  return undefined;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(root, 'demo/_site');
const PINNED = (await readFile(path.join(root, 'demo/pinned-version.txt'), 'utf8')).trim();
const PINNED_DATA = (await readFile(path.join(root, 'demo/pinned-data-version.txt'), 'utf8')).trim();

if (!existsSync(path.join(SITE, 'index.html'))) {
  console.error(`no built demo at ${SITE} — run ./demo/build.sh first`);
  process.exit(1);
}

// The bundle the page will load, imported here so the library's own tables can
// be the reference the page is checked against.
const bundled = await import(path.join(SITE, 'vendor/jp-address-romaji.js'));
const { SERVED_MUNICIPALITIES } = await import(path.join(SITE, 'served-data.js'));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  // Resolve under SITE and reject anything that escapes it.
  const file = path.join(SITE, path.normalize(decodeURIComponent(rel)));
  if (!file.startsWith(SITE)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  let body;
  try {
    body = await readFile(file);
  } catch {
    // Deliberately an HTML body, the way GitHub Pages answers a missing file.
    // A JSON 404 would let the upstream normalizer parse the error page and
    // fail somewhere else entirely, so the demo would be verified against a
    // situation that cannot happen in production.
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }).end('<h1>404</h1>');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  res.end(body);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const origin = `http://127.0.0.1:${port}`;

const executablePath = resolveExecutablePath();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
let failure = null;

try {
  const context = await browser.newContext({ locale: 'ja-JP' });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  /** Every request the browser makes, from the very first one. */
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto(`${origin}/`, { waitUntil: 'load' });
  await page.waitForSelector("body[data-ready='1']", { timeout: 60_000 });
  await page.waitForLoadState('networkidle');

  assert.deepEqual(pageErrors, [], 'uncaught page errors during load');

  /* 1. Nothing but this origin, ever. A demo that phones out while arguing
   *    about privacy is worse than no demo. */
  const foreign = requests.filter((u) => !u.startsWith(`${origin}/`));
  assert.deepEqual(foreign, [], 'the page requested a third-party origin');

  /* 2. Results are on screen without anyone typing — in both directions. */
  const forwardHead = (await page.locator('#forward-output .verdict-name').first().textContent()).trim();
  assert.equal(
    forwardHead,
    '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan',
    'the default Japanese address should already be converted on load',
  );
  const reverseHead = (await page.locator('#reverse-output .verdict-name').first().textContent()).trim();
  assert.equal(
    reverseHead,
    '東京都新宿区西新宿二丁目8-1',
    'the default romaji address should already be converted back on load',
  );

  /* 3. A refusal is visible on load too. This library's whole argument is that
   *    it declines rather than guesses, so a page showing only successes would
   *    misrepresent it. */
  const refusals = await page.locator('#cases-output .case-refuse').count();
  assert.ok(refusals >= 7, `expected the refused-input cases to render, got ${refusals}`);
  const accepted = await page.locator('#cases-output .case-accept').count();
  assert.ok(accepted >= 5, `expected the accepted-input cases to render, got ${accepted}`);

  /* 4. Every case behaved the way the page claims. `case-unexpected` renders
   *    when a case lands somewhere other than its declared column — i.e. when
   *    the *published* library changed its mind about an input. Nothing else in
   *    this repository would notice that, because the tests here run against
   *    the working tree, and the page runs against the registry. */
  assert.equal(
    await page.locator('#cases-output .case-unexpected').count(),
    0,
    'an input case behaved differently from what the page claims — the published package may have changed',
  );
  assert.equal(
    await page.locator('#cases-output .case-alarm').count(),
    0,
    'an input case rendered its alarm text',
  );

  /* 5. The figures on the page, re-derived from the built site.
   *
   *    Each of these is stated in prose next to a claim, which is how a number
   *    goes stale without anyone noticing: the data is refreshed, the sentence
   *    is not. */
  const shippedIndex = JSON.parse(await readFile(path.join(SITE, 'data/ja.json'), 'utf8'));
  const municipalityCount = shippedIndex.data.reduce((n, p) => n + p.cities.length, 0);
  const totalBytes = SERVED_MUNICIPALITIES.reduce((sum, m) => sum + m.bytes, 0);
  // Mirrors app.js's formatBytes, both branches. Reproducing only the MB one
  // would turn a trimmed slice into a failing check about nothing.
  const formatBytes = (bytes) =>
    bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  const expectedFacts = {
    'prefecture-count': String(bundled.PREFECTURES.length),
    'municipality-count': municipalityCount.toLocaleString('ja-JP'),
    'served-count': String(SERVED_MUNICIPALITIES.length),
    'slice-kb': formatBytes(totalBytes),
  };
  assert.equal(
    shippedIndex.data.length,
    bundled.PREFECTURES.length,
    "the shipped index and the library's prefecture table disagree",
  );
  const facts = await page.$$eval('[data-fact]', (nodes) =>
    nodes.map((n) => ({ key: n.dataset.fact, text: n.textContent.trim() })),
  );
  assert.ok(facts.length >= 6, `expected the page to state several facts, got ${facts.length}`);
  for (const { key, text } of facts) {
    assert.ok(!text.includes('未知の項目'), `the page left "${key}" unfilled`);
    assert.ok(text.length > 0, `the page left "${key}" empty`);
    if (key in expectedFacts) {
      assert.equal(text, expectedFacts[key], `the page's "${key}" disagrees with the built site`);
    }
  }
  // The two figures that cannot be computed in a page are stamped in by the
  // build; check they name the right thing rather than merely being non-empty.
  assert.match(
    facts.find((f) => f.key === 'normalizer').text,
    /^\d+\.\d+\.\d+/,
    'the page should name the bundled normalizer version',
  );
  assert.match(
    facts.find((f) => f.key === 'index-kb').text,
    /^gzip 約 \d+ KB$/,
    "the page should state the index's gzip size",
  );

  /* 6. The served slice on the page is the slice on disk. The manifest is
   *    generated by the build, so this catches a page that lists a
   *    municipality it does not actually carry — which would show up to a
   *    visitor as the library failing on an address the page promised. */
  const onDisk = [];
  const jaDir = path.join(SITE, 'data/ja');
  for (const pref of readdirSync(jaDir)) {
    for (const file of readdirSync(path.join(jaDir, pref))) {
      onDisk.push({
        prefecture: pref,
        municipality: file.replace(/\.json$/, ''),
        bytes: statSync(path.join(jaDir, pref, file)).size,
      });
    }
  }
  const sortKey = (m) => `${m.prefecture}/${m.municipality}`;
  assert.deepEqual(
    [...SERVED_MUNICIPALITIES].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    onDisk.sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    'the manifest the page renders disagrees with the files being served',
  );
  const servedRows = await page.locator('#served-output .served-item').count();
  assert.equal(servedRows, SERVED_MUNICIPALITIES.length, 'the served list is not fully rendered');

  /* 7. The versions the page advertises are the pins, everywhere it says so. */
  assert.equal((await page.locator('.version').textContent()).trim(), `v${PINNED}`);
  const bodyText = await page.locator('body').textContent();
  assert.ok(
    bodyText.includes(`jp-address-romaji@${PINNED}`),
    'the install command should name the pinned library version',
  );
  assert.ok(
    bodyText.includes(`jp-address-romaji-data@${PINNED_DATA}`),
    'the page should name the pinned dataset version',
  );

  /* 8. The dataset requests carry a prefecture and a municipality, and nothing
   *    else. Structural, so it cannot pass by coincidence: a URL under
   *    /data/ja/ must have exactly two path segments. */
  const datasetRequests = requests
    .filter((u) => u.startsWith(`${origin}/data/ja/`))
    .map((u) => decodeURIComponent(u.slice(`${origin}/data/ja/`.length)).replace(/\.json$/, ''));
  assert.ok(datasetRequests.length > 0, 'the page never fetched any town data');
  for (const rel of datasetRequests) {
    assert.equal(
      rel.split('/').length,
      2,
      `a dataset request carried more than <prefecture>/<municipality>: ${rel}`,
    );
  }

  /* 9. THE claim.
   *
   *    An address is typed in with a building name and an addressee attached,
   *    and every request made from that moment on is searched for the parts of
   *    it that must never appear in a URL. The municipality is expected to
   *    appear — the page says so in as many words — so it is asserted to
   *    appear rather than quietly tolerated: a check that only looks for
   *    absence would also pass on a page that stopped fetching anything.
   */
  const LEAKED = ['梅田', 'サンプルビル', '宛名太郎', '9F', '1-1-1', '一丁目'];
  const before = requests.length;
  await page.fill('#forward-input', '大阪府大阪市北区梅田一丁目1番1号 サンプルビル9F 宛名太郎');
  await page.waitForFunction(
    (n) => document.querySelector('#forward-output .verdict-name')?.textContent?.includes(n),
    'Umeda',
    { timeout: 30_000 },
  );
  await page.waitForTimeout(700);

  const afterTyping = requests.slice(before);
  assert.ok(
    afterTyping.some((u) => decodeURIComponent(u).includes('/data/ja/大阪府/大阪市北区.json')),
    `typing an Osaka address should fetch that municipality; saw ${JSON.stringify(afterTyping)}`,
  );
  for (const url of afterTyping) {
    const decoded = decodeURIComponent(url);
    for (const secret of LEAKED) {
      assert.ok(
        !decoded.includes(secret),
        `"${secret}" reached the server in a URL: ${decoded} — the page's central claim is false`,
      );
    }
  }

  /* 10. And the same for the reverse direction, which uses this library's own
   *     data access rather than the upstream normalizer's. Two code paths, two
   *     chances to put an address in a URL. */
  const beforeReverse = requests.length;
  await page.fill('#reverse-input', '1-1 Omoromachi, Naha-shi, Okinawa');
  await page.waitForFunction(
    () => document.querySelector('#reverse-output .verdict-name')?.textContent?.includes('那覇市'),
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(700);
  for (const url of requests.slice(beforeReverse)) {
    const decoded = decodeURIComponent(url);
    for (const secret of ['Omoromachi', 'おもろまち', '1-1']) {
      assert.ok(!secret || !decoded.includes(secret), `"${secret}" reached the server: ${decoded}`);
    }
  }

  /* 11. What the meter's copy claims about caching, measured rather than
   *     assumed. The page says two things: a municipality already fetched costs
   *     nothing, and the two directions each pay once because they cache
   *     separately. Both are asserted, because stating only the first would be
   *     a rule a visitor's own browser contradicts on the second click — press
   *     a reverse preset, then convert the same municipality forward, and a
   *     request appears next to copy saying it would not. */
  const beforeRepeat = requests.length;
  await page.fill('#forward-input', '大阪府大阪市北区梅田2-2-2');
  await page.waitForTimeout(900);
  assert.deepEqual(
    requests.slice(beforeRepeat),
    [],
    'a second conversion in the same direction and municipality made a request — the page says it does not',
  );

  const beforeCrossDirection = requests.length;
  await page.fill('#reverse-input', '2-2 Umeda, Kita-ku, Osaka-shi, Osaka');
  await page.waitForTimeout(900);
  const crossDirection = requests.slice(beforeCrossDirection).map((u) => decodeURIComponent(u));
  assert.equal(
    crossDirection.length,
    1,
    `the other direction should fetch the same municipality exactly once more (separate caches), got ${JSON.stringify(crossDirection)}`,
  );
  assert.match(crossDirection[0], /大阪市北区\.json/);
  const beforeCrossRepeat = requests.length;
  await page.fill('#reverse-input', '3-3 Umeda, Kita-ku, Osaka-shi, Osaka');
  await page.waitForTimeout(900);
  assert.deepEqual(
    requests.slice(beforeCrossRepeat),
    [],
    'the second direction should also cache after its first fetch',
  );

  /* 12. The on-page list agrees with what the browser did. Playwright's view is
   *     the truth; the list is what a visitor without DevTools reads. */
  const listed = await page.$$eval('#network-output .req-url', (nodes) =>
    nodes.map((n) => n.textContent.trim()),
  );
  const seenPaths = requests.map((u) => decodeURIComponent(u.slice(origin.length)));
  for (const entry of listed) {
    assert.ok(seenPaths.includes(entry), `the page listed a request the browser never made: ${entry}`);
  }
  // Compared as multisets, not as sets. The index really is fetched twice —
  // the upstream normalizer and this library's own reverse-direction data
  // access hold separate caches — and deduplicating here would let the page
  // hide a repeat fetch while claiming its cache stops them.
  const listedDataset = listed.filter((u) => u.startsWith('/data/')).sort();
  const seenDataset = seenPaths.filter((u) => u.startsWith('/data/')).sort();
  assert.deepEqual(
    listedDataset,
    seenDataset,
    'the on-page request list disagrees with the dataset requests the browser made',
  );
  assert.equal(
    await page.evaluate(() => document.body.dataset.requestAlarms),
    '0',
    'the page flagged one of its own requests as violating its claims',
  );
  assert.equal(
    await page.locator('#network-output .request-alarm').count(),
    0,
    'a request rendered in its alarm state',
  );

  /* 13. The demo's own limit is reported as the demo's limit, not as a defect
   *     in the library. A visitor typing their own address is the most likely
   *     first interaction on this page, and most addresses are not in the
   *     nine municipalities it carries. */
  await page.fill('#reverse-input', '1-1 Jinnan, Shibuya-ku, Tokyo');
  await page.waitForTimeout(700);
  const demoLimit = await page.locator('#reverse-output .warn-demo').count();
  assert.equal(demoLimit, 1, 'an unserved municipality should be explained as the demo’s own limit');
  assert.match(
    await page.locator('#reverse-output .warn-demo').textContent(),
    /東京都渋谷区/,
    'the demo-limit box should name the municipality it does not carry',
  );

  /* 13b. The forward direction answers an unserved municipality the same way
   *      the reverse one does, and does not throw.
   *
   *      This is the assertion that keeps issue #58 fixed in whatever version
   *      is pinned. Until 0.1.7 this exact interaction — the most likely first
   *      thing a visitor does, typing their own address — escaped as an
   *      uncaught SyntaxError from the upstream normalizer parsing a 404 page.
   *      Panel 4 pins the library's behaviour; this pins the page's, because a
   *      demo that renders a stack trace for the common case is broken even
   *      when the library underneath is not. */
  await page.fill('#forward-input', '東京都渋谷区神南一丁目1-1');
  await page.waitForSelector('#forward-output .warn-demo', { timeout: 30_000 });
  assert.match(
    await page.locator('#forward-output .warn-demo').textContent(),
    /東京都渋谷区/,
    'the forward direction should name the municipality this demo does not carry',
  );
  assert.equal(
    await page.locator('#forward-output .warn-throw').count(),
    0,
    'the forward direction threw for an unserved municipality — issue #58 has regressed in the pinned version',
  );
  // The page keeps working afterwards: a refusal must not wedge the panel.
  await page.fill('#forward-input', '東京都新宿区西新宿二丁目8番1号');
  await page.waitForSelector('#forward-output .verdict-ok', { timeout: 30_000 });

  /* 13c. Typing costs one request, not one per character.
   *
   *      The page states that the input settles for a quarter second before
   *      converting, and that claim exists because of this measurement: inside
   *      a municipality the demo does not carry, every keystroke used to be its
   *      own fetch — typing this address one character at a time produced nine
   *      requests, all 404, filling the list this page asks people to read. */
  const beforeTyping = requests.length;
  await page.fill('#forward-input', '');
  await page.locator('#forward-input').pressSequentially('東京都渋谷区神南一丁目1-1', { delay: 30 });
  await page.waitForSelector('#forward-output .warn-demo', { timeout: 30_000 });
  await page.waitForTimeout(700);
  const typingRequests = requests.slice(beforeTyping);
  assert.ok(
    typingRequests.length <= 2,
    `typing an address should settle into at most 2 requests, made ${typingRequests.length}: ${JSON.stringify(typingRequests.map((u) => decodeURIComponent(u)))}`,
  );
  assert.equal(
    await page.locator('#forward-output .warn-throw').count(),
    0,
    'typing an unserved address produced an uncaught throw',
  );
  await page.fill('#forward-input', '東京都新宿区西新宿二丁目8番1号');
  await page.waitForSelector('#forward-output .verdict-ok', { timeout: 30_000 });

  /* 14. Every off-site link opens in a new tab with rel=noopener, and every
   *     local link is a .txt — Pages serves an unknown extension as a
   *     download, so an attribution notice nobody can open is no notice. */
  const externals = await page.$$eval("a[href^='http']", (as) =>
    as.map((a) => ({ href: a.href, target: a.target, rel: a.rel })),
  );
  assert.ok(externals.length >= 6, `expected external links, got ${externals.length}`);
  for (const a of externals) {
    assert.equal(a.target, '_blank', `${a.href} should open in a new tab`);
    assert.match(a.rel, /noopener/, `${a.href} should carry rel=noopener`);
  }
  const localFiles = await page.$$eval("a[href^='./']", (as) => as.map((a) => a.getAttribute('href')));
  assert.ok(localFiles.length >= 3, `expected the attribution links, got ${localFiles.length}`);
  for (const href of localFiles) {
    assert.match(href, /\.txt$/, `${href} should be served as .txt so Pages renders it inline`);
  }

  /* 15. The provenance the page states is the provenance this repository
   *     records, and the attribution it links to is really in the shipped
   *     dataset package. A hand-typed source URL is exactly the kind of fact
   *     that rots silently. */
  const SOURCE_URL = 'https://www.digital.go.jp/policies/base_registry_address';
  assert.ok(
    externals.some((a) => a.href === SOURCE_URL),
    'the page should link to the Address Base Registry as the data source',
  );
  const claudeMd = await readFile(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(claudeMd.includes(SOURCE_URL), `CLAUDE.md does not name ${SOURCE_URL} as the data source`);
  const attribution = await readFile(path.join(SITE, 'vendor/ATTRIBUTION.txt'), 'utf8');
  assert.ok(
    attribution.includes('Geolonia'),
    'the shipped attribution notice does not mention Geolonia',
  );

  /* 15b. The two coverage percentages the page quotes exist in the generated
   *      coverage report.
   *
   *      These are the only figures on the page that a page cannot compute for
   *      itself — counting them means reading all 638,567 town rows, and the
   *      demo carries nine municipalities. So they are quoted, and a quoted
   *      measurement goes stale the moment the dataset is refreshed unless
   *      something compares it. `docs/coverage.md` is generated by
   *      scripts/measure-coverage.ts, which makes it the one place they can be
   *      checked against. */
  const coverage = await readFile(path.join(root, 'docs/coverage.md'), 'utf8');
  const quoted = (await page.locator('.notes').first().textContent()).match(/\d+\.\d+%/g) ?? [];
  assert.ok(quoted.length >= 2, `expected the page to quote coverage figures, got ${quoted.length}`);
  for (const figure of quoted) {
    assert.ok(
      coverage.includes(figure),
      `the page quotes ${figure}, which docs/coverage.md does not report — refresh one of the two`,
    );
  }

  /* 16. The request list truncates, and says so.
   *
   *     Left last, because it deliberately dirties the state the assertions
   *     above read. Reaching the limit takes work — the page's own assets plus
   *     both directions of every served municipality is about 24 — but a
   *     visitor typing addresses this demo has no data for gets there, since a
   *     404 is cached by nobody and each attempt is a fresh request. A list
   *     offered as "everything this page sent" must not quietly turn into some
   *     of it, so the omission is rendered with its count and checked here.
   *     Without this the truncation branch would never run in CI, and a check
   *     that cannot fire is worth as much as one that cannot pass. */
  const UNSERVED = ['Shibuya-ku', 'Nakano-ku', 'Toshima-ku', 'Ota-ku'];
  for (let i = 0; requests.length < 46 && i < 40; i++) {
    await page.fill('#reverse-input', `${i + 1}-1 Jinnan, ${UNSERVED[i % UNSERVED.length]}, Tokyo`);
    await page.waitForTimeout(450);
  }
  const total = Number(await page.evaluate(() => document.body.dataset.requestCount));
  assert.ok(total > 40, `expected to push the request list past its limit, reached ${total}`);
  const rows = await page.locator('#network-output .request').count();
  assert.equal(rows, 40, `the list should cap at 40 rows, rendered ${rows}`);
  const truncated = page.locator('#network-output .summary-truncated');
  assert.equal(await truncated.count(), 1, 'the page truncated its request list without saying so');
  assert.match(
    await truncated.textContent(),
    new RegExp(`古いほうの ${total - 40} 件`),
    'the truncation note should state how many rows were dropped',
  );
  assert.match(
    (await page.locator('#network-output .summary').first().textContent()).trim(),
    new RegExp(`合計 ${total} 件`),
    'the total must keep counting everything even while the list shows part of it',
  );

  assert.deepEqual(pageErrors, [], 'uncaught page errors during interaction');

  await context.close();

  console.log(
    `demo check OK — ${await browser.version()}; ` +
      `jp-address-romaji ${PINNED} / jp-address-romaji-data ${PINNED_DATA}; ` +
      `${accepted} accepted / ${refusals} refused input cases; ` +
      `${seenDataset.length} dataset request(s), all <prefecture>/<municipality>, ` +
      `none carrying the block number, building name or addressee`,
  );
} catch (err) {
  failure = err;
} finally {
  await browser.close();
  server.close();
}

if (failure) {
  console.error(failure);
  process.exit(1);
}
