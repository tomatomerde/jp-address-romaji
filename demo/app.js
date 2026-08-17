/**
 * Demo page logic.
 *
 * Everything here runs against the published bundle in ./vendor/, loaded once
 * on page load, with the address dataset served from ./data/ on this same
 * origin. scripts/verify-demo.mjs drives this page in a real browser and
 * asserts the claims it makes.
 *
 * Three rules this file follows throughout:
 *
 *   1. **Nodes are built with textContent, never innerHTML.** Visitor input is
 *      echoed back into the page, and so are library error messages, which
 *      quote the input back verbatim.
 *   2. **Facts about the library are read from the library**, and facts about
 *      the data being served are read from the manifest the build generated
 *      out of the files it actually copied. The only hand-off from the build
 *      is the handful of `__…__` placeholders below, and verify-demo.mjs
 *      cross-checks each of them against the built site.
 *   3. **The network is the subject, not an implementation detail.** Unlike
 *      the sibling demos, this page cannot claim zero requests: converting an
 *      address fetches the municipality's town file. So the page lists every
 *      request it made and takes the position that the list itself is the
 *      evidence — the prefecture and municipality are in those URLs, and
 *      nothing past them is.
 */

import { SERVED_MUNICIPALITIES } from './served-data.js';

/* ---------- values stamped in by demo/build.sh ---------- */

/** Version of `jp-address-romaji` bundled into ./vendor/. */
const CORE_VERSION = '__CORE_VERSION__';
/** Version of the upstream normalizer that ended up in the bundle. */
const NORMALIZER_VERSION = '__NORMALIZER_VERSION__';
/** Municipalities in the shipped index, counted from ja.json at build time. */
const MUNICIPALITY_COUNT = '__MUNICIPALITY_COUNT__';
/** gzip size of the shipped index, measured at build time. */
const INDEX_GZIP_KB = '__INDEX_GZIP_KB__';

/** Where the browser build is told to fetch the dataset from. */
const DATA_ENDPOINT = new URL('./data/ja', window.location.href).href;

/** For the one place the page links to an issue about its own subject matter. */
const REPO_URL = 'https://github.com/tomatomerde/jp-address-romaji';

/* ---------- small DOM helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function kv(list, key, value, note) {
  list.append(el('dt', 'kv-key', key));
  const dd = el('dd', 'kv-value');
  dd.append(el('span', 'kv-text', value));
  if (note) dd.append(el('span', 'kv-note', note));
  list.append(dd);
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Renders a thrown value.
 *
 * A throw is not supposed to happen here: this library returns failures as
 * values so that callers are forced to handle them. One case where the
 * published version does throw is a municipality file the endpoint does not
 * serve — which is exactly the configuration this page runs in — so the throw
 * is displayed as its own outcome rather than folded into "refused".
 */
function errorParts(err) {
  if (err && typeof err.name === 'string' && typeof err.message === 'string') {
    return { name: err.name, message: err.message };
  }
  return { name: 'Error', message: String(err) };
}

/* ---------- the slice of the dataset this page serves ---------- */

const SERVED_KEYS = new Set(SERVED_MUNICIPALITIES.map((m) => `${m.prefecture}/${m.municipality}`));

/**
 * Is this failure about the demo's own incompleteness rather than about the
 * address?
 *
 * The library reports "no town data for 東京都渋谷区" the same way whether the
 * dataset was never built or the endpoint simply does not carry that one file.
 * On this page it is always the second, and saying "DATA_NOT_CONFIGURED" to a
 * visitor who typed their own address would blame the library for a limit this
 * page chose. So the two are told apart here and labelled differently.
 */
function unservedMunicipality(partial) {
  const prefecture = partial?.prefecture?.ja;
  if (!prefecture) return undefined;
  const municipality = `${partial.county?.ja ?? ''}${partial.city?.ja ?? ''}${partial.ward?.ja ?? ''}`;
  if (!municipality) return undefined;
  const key = `${prefecture}/${municipality}`;
  return SERVED_KEYS.has(key) ? undefined : { prefecture, municipality };
}

/** The box shown when the address is fine but this page does not carry its data. */
function demoLimitBox(where) {
  const box = el('div', 'warn warn-demo');
  const head = el('p', 'warn-head');
  head.append(el('code', 'err-name', 'このデモの都合'));
  head.append(
    el(
      'span',
      'err-lead',
      where
        ? `${where.prefecture}${where.municipality} の町データを、このページは配っていません`
        : 'このページが配っていない市区町村のようです',
    ),
  );
  box.append(head);
  box.append(
    el(
      'p',
      'err-message',
      `ライブラリの答えではなく、このデモが ${SERVED_MUNICIPALITIES.length} 市区町村ぶんしか` +
        `データを置いていないことによる失敗です（全国は ${MUNICIPALITY_COUNT} 市区町村）。` +
        'npm から使う場合は全国ぶんが同梱されているので、この失敗は起きません。',
    ),
  );
  const link = el('a', 'warn-link', '配っている市区町村の一覧を見る');
  link.href = '#served-list';
  box.append(link);
  return box;
}

/** The box shown for a genuine, typed refusal from the library. */
function failureBox(result, lead) {
  const box = el('div', 'warn');
  const head = el('p', 'warn-head');
  head.append(el('code', 'err-name', result.reason));
  head.append(el('span', 'err-lead', lead));
  box.append(head);
  box.append(el('p', 'err-message', result.message));
  return box;
}

/**
 * The box shown when a call threw instead of returning a failure.
 *
 * Not expected to render. It exists because it once did: until 0.1.7 the
 * forward direction threw for a municipality this page does not carry, which
 * is the most likely thing a visitor does here (issue #58, found by building
 * this demo). Keeping the box means a return of that shape shows up as itself
 * rather than as a blank panel — and `scripts/verify-demo.mjs` asserts it stays
 * absent, so it doubles as the check that the fix is still in the pinned
 * version.
 */
function throwBox(err) {
  const { name, message } = errorParts(err);
  const box = el('div', 'warn warn-throw');
  const head = el('p', 'warn-head');
  head.append(el('code', 'err-name', name));
  head.append(el('span', 'err-lead', '例外が投げられました（失敗が値で返っていません）'));
  box.append(head);
  box.append(el('p', 'err-message', message));
  box.append(
    el(
      'p',
      'err-message',
      `これは起きてはいけません。このライブラリは失敗を例外ではなく ` +
        `{ ok: false, reason } という値で返す設計で、それが呼び出し側に分岐を強制する仕組み` +
        `だからです。jp-address-romaji ${CORE_VERSION} で出たのなら不具合です:`,
    ),
  );
  const link = el('a', 'warn-link', 'イシューとして報告する');
  link.href = `${REPO_URL}/issues`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  box.append(link);
  return box;
}

/* ---------- component tables ---------- */

const COMPONENT_LABELS = [
  ['prefecture', '都道府県'],
  ['county', '郡'],
  ['city', '市区町村'],
  ['ward', '区'],
  ['town', '町名'],
  ['koaza', '小字'],
];

function renderParsed(parsed, out) {
  const list = el('dl', 'kv-list');
  for (const [key, label] of COMPONENT_LABELS) {
    const value = parsed[key];
    if (!value) continue;
    const parts = [value.ja];
    if (value.kana) parts.push(value.kana);
    parts.push(value.romaji ?? '（ローマ字なし）');
    kv(list, `${key}（${label}）`, parts.join(' / '));
  }
  if (parsed.chome !== undefined) kv(list, 'chome（丁目）', String(parsed.chome));
  if (parsed.blockNumbers?.length) kv(list, 'blockNumbers（番・号）', parsed.blockNumbers.join('-'));
  if (parsed.postalCode) kv(list, 'postalCode（郵便番号）', parsed.postalCode);
  if (parsed.kyotoStreet) {
    kv(
      list,
      'kyotoStreet（通り名）',
      parsed.kyotoStreet,
      'ローマ字化していません。データに通り名の読みが無いので、推測しないためです',
    );
  }
  if (parsed.unparsed) {
    kv(list, 'unparsed（建物名・宛名）', parsed.unparsed, '解釈も翻訳もせず、原文のまま持ち回ります');
  }
  kv(list, 'level（正規化の深さ）', String(parsed.level));
  out.append(list);
}

/* ---------- panel 1: Japanese -> romaji ---------- */

const PRESET_FORWARD = [
  {
    label: '東京都新宿区西新宿三丁目5番12号',
    value: '東京都新宿区西新宿三丁目5番12号',
    note: '基本形。丁目と番・号が分解され、西洋語順に組み直される',
  },
  {
    label: '〒160-0023 東京都新宿区西新宿３ー５ー１２',
    value: '〒160-0023 東京都新宿区西新宿３ー５ー１２',
    note: '郵便番号・全角数字・全角ハイフン。表記ゆれの吸収は正規化器の仕事',
  },
  {
    label: '建物名と宛名つき',
    value: '東京都新宿区西新宿3-5-12 ○○ビル7F 山田太郎様',
    note: '建物名も宛名も unparsed として素通し。翻訳しない（できないものは触らない）',
  },
  {
    label: '北海道札幌市中央区北一条東1-1',
    value: '北海道札幌市中央区北一条東1-1',
    note: '末尾の数字は町名の一部（Kita1-Johigashi）。剥がすと別の町になる',
  },
  {
    label: '北海道札幌市中央区円山1-1',
    value: '北海道札幌市中央区円山1-1',
    note: 'データにローマ字が無く、かな読みから翻字した例。全体の約1割がこの経路',
  },
  {
    label: '三重県伊賀市西明寺字天津川1-1',
    value: '三重県伊賀市西明寺字天津川1-1',
    note: '小字の読みが名前全体を覆っていると確認できたので、ローマ字化して出す',
  },
  {
    label: '京都府京都市中京区烏丸通四条上ル笋町123',
    value: '京都府京都市中京区烏丸通四条上ル笋町123',
    note: '通り名を正規化の前に切り離す。原文のまま保持し、ローマ字化はしない',
  },
  {
    label: '長野県飯田市本町三丁目大横1-1（断る）',
    value: '長野県飯田市本町三丁目大横1-1',
    note: 'かな読みが「３チョウメ」で止まっていて大横に届かない。小字を落として成功させない',
  },
  {
    label: '北海道札幌市白石区菊水上町1-1（断る）',
    value: '北海道札幌市白石区菊水上町1-1',
    note: 'ローマ字もかなも無い町。札幌市内でも起きる（エラー文が言う「郊外」に限らない）',
  },
  {
    label: '東京都渋谷区神南一丁目1-1（デモの都合で失敗）',
    value: '東京都渋谷区神南一丁目1-1',
    note: 'このページが配っていない市区町村。ライブラリの答えではなくデモの限界',
  },
];

async function renderForward(lib, input, options, out) {
  out.replaceChildren();

  let result;
  try {
    result = await lib.toRomaji(input, options);
  } catch (err) {
    out.append(throwBox(err));
    return;
  }

  if (!result.ok) {
    const unserved = unservedMunicipality(result.partial);
    if (unserved && result.reason === 'DATA_NOT_CONFIGURED') {
      out.append(demoLimitBox(unserved));
    } else {
      out.append(
        failureBox(
          result,
          '変換できませんでした（推測で綴りを作るより、断るほうを選んでいます）',
        ),
      );
    }
    if (result.partial) {
      out.append(el('h3', 'sub', 'ここまでは解決できていました'));
      renderParsed(result.partial, out);
    }
    return;
  }

  const head = el('div', 'verdict verdict-ok');
  const from = el('div', 'verdict-from');
  from.append(el('span', 'verdict-in', input));
  from.append(el('span', 'verdict-arrow', '→'));
  head.append(from);
  head.append(el('span', 'verdict-name', result.value.formatted));
  out.append(head);

  out.append(el('h3', 'sub', '内訳（parsed）'));
  renderParsed(result.value.parsed, out);

  // The commerce adapters, run for real. They are a large part of why someone
  // would install this rather than romanize a string themselves, and they are
  // cheap to show once the address is already parsed.
  out.append(el('h3', 'sub', 'toFormat() — 各サービスの住所フィールドへ'));
  const formats = el('div', 'formats');
  for (const target of ['google-i18n', 'shopify', 'stripe']) {
    const block = el('div', 'format');
    block.append(el('h4', 'format-name', target));
    block.append(el('pre', 'format-body', JSON.stringify(lib.toFormat(result.value.parsed, target), null, 2)));
    formats.append(block);
  }
  out.append(formats);
}

/* ---------- panel 2: romaji -> Japanese ---------- */

const PRESET_REVERSE = [
  {
    label: '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo',
    value: '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo',
    note: '往復。上の1つ目の出力を戻すと、丁目つきの日本語に復元される',
  },
  {
    label: '1-1-1 Umeda, Kita-ku, Osaka-shi, Osaka',
    value: '1-1-1 Umeda, Kita-ku, Osaka-shi, Osaka',
    note: '政令市の区。市と区の両方を解決してから町名を探す',
  },
  {
    label: '1-1 Omoromachi, Naha-shi, Okinawa',
    value: '1-1 Omoromachi, Naha-shi, Okinawa',
    note: 'ひらがなの町名（おもろまち）。復元先は漢字とは限らない',
  },
  {
    label: '1-1 Toya, Kushiro-cho, Hokkaido（候補が2つ）',
    value: '1-1 Toya, Kushiro-cho, Hokkaido',
    note: '字遠野と遠矢の両方に当たる。勝手に選ばず候補を返す',
  },
  {
    label: '3-5-12 Nishishinjuku, Shinjuku-ku（断る）',
    value: '3-5-12 Nishishinjuku, Shinjuku-ku',
    note: '都道府県が無い。外側から内側へしか解決しないので、ここで止まる',
  },
  {
    label: '東京都新宿区西新宿三丁目5-12（断る）',
    value: '東京都新宿区西新宿三丁目5-12',
    note: '日本語は受け付けない。逆変換の入力は西洋語順のローマ字だけ',
  },
  {
    label: '1-1 Jinnan, Shibuya-ku, Tokyo（デモの都合で失敗）',
    value: '1-1 Jinnan, Shibuya-ku, Tokyo',
    note: 'このページが配っていない市区町村。こちらは例外ではなく値で返る',
  },
];

async function renderReverse(lib, input, out) {
  out.replaceChildren();

  let result;
  try {
    result = await lib.fromRomaji(input);
  } catch (err) {
    out.append(throwBox(err));
    return;
  }

  if (!result.ok) {
    const unserved = unservedMunicipality(result.partial);
    if (unserved && result.reason === 'DATA_NOT_CONFIGURED') {
      out.append(demoLimitBox(unserved));
    } else {
      out.append(failureBox(result, '日本語に戻せませんでした'));
    }

    if (result.candidates?.length) {
      out.append(el('h3', 'sub', `候補 ${result.candidates.length} 件（選ぶのは呼び出し側）`));
      const list = el('ul', 'candidates');
      for (const candidate of result.candidates) {
        const li = el('li', 'candidate');
        li.append(el('span', 'cand-name', lib.renderJapanese(candidate)));
        li.append(
          el(
            'span',
            'cand-meta',
            `${candidate.town?.ja ?? ''}（${candidate.town?.kana ?? '—'} / ${candidate.town?.romaji ?? '—'}）`,
          ),
        );
        list.append(li);
      }
      out.append(list);
    }

    if (result.partial) {
      out.append(el('h3', 'sub', 'ここまでは解決できていました'));
      renderParsed(result.partial, out);
    }
    return;
  }

  const head = el('div', 'verdict verdict-ok');
  const from = el('div', 'verdict-from');
  from.append(el('span', 'verdict-in', input));
  from.append(el('span', 'verdict-arrow', '→'));
  head.append(from);
  head.append(el('span', 'verdict-name', result.value.formatted));
  out.append(head);

  out.append(el('h3', 'sub', '内訳（parsed）'));
  renderParsed(result.value.parsed, out);
}

/* ---------- panel 3: what this page asked the server for ---------- */

const DATA_PREFIX = new URL('./data/', window.location.href).href;

/**
 * Classifies one resource-timing entry for display.
 *
 * The dataset requests are split out from the page's own assets, and the
 * dataset ones are decomposed into the two path segments they carry, because
 * those two segments *are* the privacy claim: a URL under ./data/ja/ has
 * exactly `<prefecture>/<municipality>` after the prefix and nothing else. A
 * third segment would mean part of an address had been put in a URL, so it is
 * rendered as an alarm rather than as another row.
 */
function classifyRequest(url) {
  if (!url.startsWith(window.location.origin)) {
    return { kind: 'foreign', label: '別のオリジン', alarm: true };
  }
  // The query string is dropped before matching: the upstream normalizer
  // appends `?v=<ja.json の meta.updated>` as a cache buster, so the town-file
  // URLs carry a suffix that is a property of the dataset build, not of the
  // visitor or the address. It stays in the displayed URL — this list is only
  // worth reading if it shows what was actually sent — but it must not be
  // mistaken for a third path segment.
  const withoutQuery = url.split('?')[0];
  if (withoutQuery === `${DATA_ENDPOINT}.json`) {
    return { kind: 'index', label: '住所データ（全国の索引）' };
  }
  if (withoutQuery.startsWith(`${DATA_PREFIX}ja/`)) {
    const rest = decodeURIComponent(withoutQuery.slice(`${DATA_PREFIX}ja/`.length)).replace(/\.json$/, '');
    const segments = rest.split('/');
    if (segments.length !== 2) {
      return { kind: 'data', label: '住所データ（想定外の深さ）', detail: rest, alarm: true };
    }
    return {
      kind: 'data',
      label: '住所データ（市区町村）',
      prefecture: segments[0],
      municipality: segments[1],
    };
  }
  return { kind: 'asset', label: 'ページ本体（HTML・CSS・JS）' };
}

/** Every request the page has made, oldest first. Filled by the observer. */
const REQUESTS = [];

/**
 * How many rows of the request list are rendered.
 *
 * Normal use cannot reach this: the page's own assets plus both directions of
 * all served municipalities is about 24. It is reachable by typing addresses in
 * municipalities this demo does not carry, because a 404 is not cached — each
 * attempt is a fresh request. Rather than let the list grow without limit, the
 * oldest rows are dropped and the omission is stated with its count. A list
 * offered as "everything this page sent" must not silently become "some of it".
 */
const REQUEST_ROW_LIMIT = 40;

function renderRequests(out) {
  out.replaceChildren();

  const dataCount = REQUESTS.filter((r) => r.info.kind === 'data' || r.info.kind === 'index').length;
  const summary = el('p', 'summary');
  summary.textContent =
    `合計 ${REQUESTS.length} 件（うち住所データ ${dataCount} 件）。` +
    '住所データ以外は、このページ自身の HTML・CSS・JavaScript です。';
  out.append(summary);

  // Two things a reader will notice and wonder about, said before they have to
  // guess. Both are real and neither is hidden: the page would rather explain
  // a duplicate request than quietly collapse it in the list.
  out.append(
    el(
      'p',
      'summary',
      '同じファイルが2回出ていることがあります。順方向（正規化）と逆方向（逆引き）は' +
        '別々のキャッシュを持っているためで、2回目以降は各々のキャッシュで止まります。' +
        '町名ファイルに付く ?v=… は索引 ja.json の meta.updated（データセットの生成時刻）で、' +
        '上流の正規化器がキャッシュ回避に使っています——閲覧者にも住所にも関係しません。',
    ),
  );

  const omitted = Math.max(0, REQUESTS.length - REQUEST_ROW_LIMIT);
  if (omitted > 0) {
    out.append(
      el(
        'p',
        'summary summary-truncated',
        `↑ 古いほうの ${omitted} 件は表示を省略しています（新しい ${REQUEST_ROW_LIMIT} 件だけを出しています）。` +
          '省略されるのはたいてい、このデモが配っていない市区町村への繰り返しのリクエストです——' +
          '404 はキャッシュされないので、入力するたびに1件ずつ増えます。',
      ),
    );
  }

  const list = el('ol', 'requests');
  for (const entry of REQUESTS.slice(-REQUEST_ROW_LIMIT)) {
    const li = el('li', 'request' + (entry.info.alarm ? ' request-alarm' : ''));
    li.append(el('span', `req-kind req-${entry.info.kind}`, entry.info.label));
    li.append(el('code', 'req-url', entry.display));
    if (entry.info.kind === 'data') {
      const parts = el('span', 'req-parts');
      parts.append(el('span', 'req-part', `都道府県: ${entry.info.prefecture ?? '—'}`));
      parts.append(el('span', 'req-part', `市区町村: ${entry.info.municipality ?? '—'}`));
      parts.append(el('span', 'req-part req-part-none', '番地から先: 含まれていません'));
      li.append(parts);
    }
    if (entry.status >= 400) {
      li.append(
        el(
          'span',
          'req-parts',
          `HTTP ${entry.status}。このデモが配っていない市区町村を取りに行った結果です`,
        ),
      );
    }
    if (entry.info.alarm) {
      li.append(
        el(
          'span',
          'case-alarm',
          'このページの主張と食い違うリクエストです。不具合として報告してください。',
        ),
      );
    }
    list.append(li);
  }
  out.append(list);

  out.append(
    el(
      'p',
      'panel-lead',
      'このうち住所データの行に出ているのは、都道府県名と市区町村名だけです。' +
        '上の入力欄に打った番地・建物名・宛名は、どの行にも現れません——' +
        'それらはページの中で照合されていて、サーバーに問い合わせていないからです。',
    ),
  );
}

function renderServed(out) {
  out.replaceChildren();

  const totalBytes = SERVED_MUNICIPALITIES.reduce((sum, m) => sum + m.bytes, 0);
  const table = el('ul', 'served');
  for (const m of SERVED_MUNICIPALITIES) {
    const li = el('li', 'served-item');
    li.append(el('span', 'served-name', `${m.prefecture} ${m.municipality}`));
    li.append(el('span', 'served-size', formatBytes(m.bytes)));
    li.append(el('code', 'served-path', `/data/ja/${m.prefecture}/${m.municipality}.json`));
    table.append(li);
  }
  out.append(table);
  out.append(
    el(
      'p',
      'summary',
      `${SERVED_MUNICIPALITIES.length} 件・合計 ${formatBytes(totalBytes)}。` +
        '1回の変換で取りに行くのは、このうち1件だけです（同じ市区町村の2回目からは取りに行きません）。',
    ),
  );
}

/* ---------- panel 4: what the library accepts and refuses ---------- */

/**
 * The input cases.
 *
 * Every case is run in front of the visitor and its outcome compared with
 * `expect`. The point is not the list itself but the comparison: this page
 * loads the *published* package, so nothing else in this repository would
 * notice if a release changed which inputs are accepted. The repository's own
 * tests run against the working tree.
 *
 * `expect` has three values, not two. `throw` is one of them because the
 * published version really does throw for a municipality file the endpoint
 * does not serve, and recording that as "refused" would paper over the
 * difference between a typed failure and an uncaught exception — which is the
 * distinction this library's error handling is built on. When that is fixed
 * upstream of the pin, this case flips to `refuse` and the page says so.
 */
const INPUT_CASES = [
  {
    group: '受け付ける形',
    cases: [
      {
        expr: `toRomaji('東京都新宿区西新宿三丁目5番12号')`,
        expect: 'accept',
        note: '丁目・番・号の漢数字と単位',
        run: (lib) => lib.toRomaji('東京都新宿区西新宿三丁目5番12号'),
      },
      {
        expr: `toRomaji('東京都新宿区西新宿３ー５ー１２')`,
        expect: 'accept',
        note: '全角数字と全角ハイフン',
        run: (lib) => lib.toRomaji('東京都新宿区西新宿３ー５ー１２'),
      },
      {
        expr: `toRomaji('新宿区西新宿3-5-12')`,
        expect: 'accept',
        note: '都道府県の省略。市区町村名が全国で一意なら補える',
        run: (lib) => lib.toRomaji('新宿区西新宿3-5-12'),
      },
      {
        expr: `toRomaji('〒160-0023 東京都新宿区西新宿3-5-12')`,
        expect: 'accept',
        note: '郵便番号は切り出して postalCode に入れる',
        run: (lib) => lib.toRomaji('〒160-0023 東京都新宿区西新宿3-5-12'),
      },
      {
        expr: `fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023')`,
        expect: 'accept',
        note: '逆方向。郵便番号が付いていても読む',
        run: (lib) => lib.fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023'),
      },
    ],
  },
  {
    group: '受け付けない形（黙って別の住所を返さない）',
    cases: [
      {
        expr: `toRomaji('')`,
        expect: 'refuse',
        note: 'EMPTY_INPUT。空文字を「変換できた」ことにしない',
        run: (lib) => lib.toRomaji(''),
      },
      {
        expr: `toRomaji('あいうえお')`,
        expect: 'refuse',
        note: 'PREFECTURE_NOT_FOUND。住所に見えないものを住所として読まない',
        run: (lib) => lib.toRomaji('あいうえお'),
      },
      {
        expr: `toRomaji('北海道札幌市白石区菊水上町1-1')`,
        expect: 'refuse',
        note: 'NO_ROMAJI_DATA。ローマ字もかなも無いので、綴りを作らない',
        run: (lib) => lib.toRomaji('北海道札幌市白石区菊水上町1-1'),
      },
      {
        expr: `toRomaji('長野県飯田市本町三丁目大横1-1')`,
        expect: 'refuse',
        note: 'KOAZA_READING_INCOMPLETE。小字を黙って落として成功させない',
        run: (lib) => lib.toRomaji('長野県飯田市本町三丁目大横1-1'),
      },
      {
        expr: `fromRomaji('1-1 Toya, Kushiro-cho, Hokkaido')`,
        expect: 'refuse',
        note: 'AMBIGUOUS。2つの実在する町に当たるので、選ばずに候補を返す',
        run: (lib) => lib.fromRomaji('1-1 Toya, Kushiro-cho, Hokkaido'),
      },
      {
        expr: `fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku')`,
        expect: 'refuse',
        note: 'PREFECTURE_NOT_FOUND。外側から内側へしか解決しない',
        run: (lib) => lib.fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku'),
      },
      {
        expr: `fromRomaji('東京都新宿区西新宿三丁目5-12')`,
        expect: 'refuse',
        note: 'EMPTY_INPUT。逆変換は西洋語順のローマ字しか受けない',
        run: (lib) => lib.fromRomaji('東京都新宿区西新宿三丁目5-12'),
      },
    ],
  },
  {
    group: 'このデモが配っていない市区町村（ライブラリの性質ではなく、この構成の性質）',
    cases: [
      {
        expr: `fromRomaji('1-1 Jinnan, Shibuya-ku, Tokyo')`,
        expect: 'refuse',
        note: 'DATA_NOT_CONFIGURED。どの市区町村のデータが無いかまで書いて失敗する',
        run: (lib) => lib.fromRomaji('1-1 Jinnan, Shibuya-ku, Tokyo'),
      },
      {
        expr: `toRomaji('東京都渋谷区神南一丁目1-1')`,
        expect: 'refuse',
        note:
          '順方向も同じ理由で断る。0.1.6 まではここが例外になっていた（イシュー #58。' +
          '正規化を委譲している上流が 404 の本文を JSON として読もうとするため）。' +
          '0.1.7 で、市区町村名を添えた DATA_NOT_CONFIGURED になった',
        run: (lib) => lib.toRomaji('東京都渋谷区神南一丁目1-1'),
      },
    ],
  },
];

const OUTCOME_LABEL = {
  accept: '受け付けた',
  refuse: '受け付けず、理由を返した',
  throw: '例外を投げた',
};

async function renderInputCases(lib, out) {
  out.replaceChildren();

  for (const section of INPUT_CASES) {
    out.append(el('h3', 'case-group', section.group));
    const list = el('ul', 'cases');
    for (const c of section.cases) {
      const li = el('li', 'case');
      li.append(el('code', 'case-expr', c.expr));

      let outcome;
      let rendered;
      try {
        const value = await c.run(lib);
        if (value.ok) {
          outcome = 'accept';
          rendered = value.value.formatted;
        } else {
          outcome = 'refuse';
          rendered = `${value.reason}: ${value.message}`;
        }
      } catch (err) {
        outcome = 'throw';
        const { name, message } = errorParts(err);
        rendered = `${name}: ${message}`;
      }

      const asExpected = outcome === c.expect;
      const verdict = el(
        'span',
        `case-verdict case-${outcome}` + (asExpected ? '' : ' case-unexpected'),
      );
      verdict.textContent = OUTCOME_LABEL[outcome];
      li.append(verdict);
      li.append(el('span', 'case-result', rendered));
      li.append(el('span', 'case-note', c.note));

      // Should never render. If it does, the published library changed its
      // mind about an input and this page is the thing that noticed.
      if (!asExpected) {
        li.append(
          el(
            'span',
            'case-alarm',
            `想定と違います（このページは "${c.expect}" を期待していました）。` +
              `公開されている jp-address-romaji ${CORE_VERSION} の挙動が変わった可能性があります。`,
          ),
        );
      }
      list.append(li);
    }
    out.append(list);
  }
}

/* ---------- facts ---------- */

/**
 * Fills in the figures the page states.
 *
 * The prefecture count comes out of the library's own table, the served slice
 * out of the manifest the build generated from the files it copied, and the
 * two that cannot be computed in a page (the municipality count and the gzip
 * size of the index) are stamped in by the build and re-derived from the built
 * site by scripts/verify-demo.mjs.
 */
function renderFacts(lib) {
  const totalBytes = SERVED_MUNICIPALITIES.reduce((sum, m) => sum + m.bytes, 0);
  const values = {
    'prefecture-count': String(lib.PREFECTURES.length),
    'municipality-count': Number(MUNICIPALITY_COUNT).toLocaleString('ja-JP'),
    'served-count': String(SERVED_MUNICIPALITIES.length),
    'slice-kb': formatBytes(totalBytes),
    'index-kb': `gzip 約 ${INDEX_GZIP_KB} KB`,
    normalizer: NORMALIZER_VERSION,
  };
  for (const node of document.querySelectorAll('[data-fact]')) {
    const value = values[node.dataset.fact];
    // Left visibly unfilled rather than silently blank: an unknown key means
    // the page asked for a figure this function does not know how to produce.
    node.textContent = value ?? `（未知の項目: ${node.dataset.fact}）`;
  }
}

/* ---------- wiring ---------- */

/**
 * Runs `fn` once the visitor stops typing.
 *
 * Not a nicety. A municipality this demo does not carry answers 404, and a 404
 * is not cached anywhere — so without this, every keystroke of an address the
 * page has no data for costs a request: typing 東京都渋谷区神南一丁目1-1 one
 * character at a time produced nine. That is noise in the very list this page
 * asks visitors to read, and it is also what any real address form would avoid.
 * Conversions inside a served municipality are free either way, because the
 * town file is cached after the first fetch.
 */
function debounce(fn, ms) {
  let timer;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Long enough to swallow a burst of typing, short enough to feel immediate. */
const TYPING_SETTLE_MS = 250;

function makePresets(container, presets, apply) {
  for (const preset of presets) {
    const button = el('button', 'preset');
    button.type = 'button';
    button.append(el('span', 'preset-label', preset.label));
    if (preset.note) button.append(el('span', 'preset-note', preset.note));
    button.addEventListener('click', () => apply(preset.value));
    container.append(button);
  }
}

/**
 * Watches the page's own network activity and keeps the list in panel 3 live.
 *
 * PerformanceObserver sees fetch/XHR/img/script/css alike, which is wider than
 * patching `fetch` would be: anything that costs a request shows up. `buffered:
 * true` replays the entries from before this ran, so the bundle and the
 * stylesheet are in the list too — a page arguing about which requests it makes
 * should not start counting after the interesting ones have already happened.
 *
 * Unlike the sibling demos this page does not claim zero. It claims that the
 * list contains no address past the municipality, which is a claim about
 * content rather than about count, so the URLs are shown rather than tallied.
 */
function startRequestMeter(onChange) {
  const output = document.getElementById('request-count');
  if (typeof PerformanceObserver === 'undefined') return;

  const record = (entries) => {
    for (const entry of entries) {
      const info = classifyRequest(entry.name);
      REQUESTS.push({
        display: decodeURIComponent(entry.name.replace(window.location.origin, '')),
        // `responseStatus` is a recent addition to resource timing; where it is
        // missing this reads 0 and the row simply says nothing about status,
        // rather than the page inventing one.
        status: entry.responseStatus ?? 0,
        info,
      });
    }
    if (output) output.textContent = `${REQUESTS.length} 件`;
    // Read by scripts/verify-demo.mjs, which compares these against what the
    // browser itself saw. A meter nobody checks is a number, not evidence.
    document.body.dataset.requestCount = String(REQUESTS.length);
    document.body.dataset.requestAlarms = String(REQUESTS.filter((r) => r.info.alarm).length);
    onChange();
  };

  const observer = new PerformanceObserver((list) => record(list.getEntries()));
  observer.observe({ type: 'resource', buffered: true });
}

async function main() {
  const loading = document.getElementById('loading');
  const loadError = document.getElementById('load-error');

  let lib;
  try {
    lib = await import('./vendor/jp-address-romaji.js');
  } catch (err) {
    loading.hidden = true;
    loadError.hidden = false;
    loadError.textContent = `ライブラリの読み込みに失敗しました: ${err.message}`;
    return;
  }

  // The one line that makes the browser build work. Without it every
  // conversion returns DATA_NOT_CONFIGURED — there is no hosted API to fall
  // back on, by design.
  lib.configureDataSource({ endpoint: DATA_ENDPOINT });

  renderFacts(lib);

  const networkOutput = document.getElementById('network-output');
  renderServed(document.getElementById('served-output'));

  /* panel 1 */
  const forwardInput = document.getElementById('forward-input');
  const forwardOutput = document.getElementById('forward-output');
  const optLongVowel = document.getElementById('opt-long-vowel');
  const optOrder = document.getElementById('opt-order');
  const optCapitalization = document.getElementById('opt-capitalization');
  const optIncludeCountry = document.getElementById('opt-include-country');
  const forwardOptions = () => ({
    longVowel: optLongVowel.value,
    order: optOrder.value,
    capitalization: optCapitalization.value,
    includeCountry: optIncludeCountry.checked,
  });
  const runForward = () =>
    renderForward(lib, forwardInput.value, forwardOptions(), forwardOutput);

  // Presets run immediately; typing waits for a pause. A preset is one
  // deliberate action, and delaying it would only make the page feel slow.
  makePresets(document.getElementById('forward-presets'), PRESET_FORWARD, (v) => {
    forwardInput.value = v;
    void runForward();
  });
  const forwardSettled = debounce(() => void runForward(), TYPING_SETTLE_MS);
  forwardInput.addEventListener('input', forwardSettled);
  for (const node of [optLongVowel, optOrder, optCapitalization, optIncludeCountry]) {
    node.addEventListener('change', () => void runForward());
  }

  /* panel 2 */
  const reverseInput = document.getElementById('reverse-input');
  const reverseOutput = document.getElementById('reverse-output');
  const runReverse = () => renderReverse(lib, reverseInput.value, reverseOutput);
  makePresets(document.getElementById('reverse-presets'), PRESET_REVERSE, (v) => {
    reverseInput.value = v;
    void runReverse();
  });
  reverseInput.addEventListener('input', debounce(() => void runReverse(), TYPING_SETTLE_MS));

  // Prefilled on purpose: the page must show real results — including at least
  // one refusal — before the visitor touches anything.
  forwardInput.value = PRESET_FORWARD[0].value;
  reverseInput.value = PRESET_REVERSE[0].value;
  await runForward();
  await runReverse();
  await renderInputCases(lib, document.getElementById('cases-output'));

  loading.hidden = true;
  for (const id of ['panel-forward', 'panel-reverse', 'panel-network', 'panel-cases']) {
    document.getElementById(id).hidden = false;
  }

  startRequestMeter(() => renderRequests(networkOutput));
  renderRequests(networkOutput);
  document.body.dataset.ready = '1';
}

void main();
