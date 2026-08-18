# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#requirements)
[![ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#requirements)
[![no network at runtime in Node](https://img.shields.io/badge/network%20at%20runtime%20%28Node%29-none-brightgreen.svg)](#requirements)
[![browser: bring your own endpoint](https://img.shields.io/badge/browser-bring%20your%20own%20endpoint-blue.svg)](#in-the-browser)
[![Live demo](https://img.shields.io/badge/demo-live-1c5d99.svg)](https://tomatomerde.github.io/jp-address-romaji/)

**English** | [日本語](./README.ja.md)

Bidirectional conversion between Japanese addresses and their romanized, western-order equivalents.
For shipping labels, international checkout forms, and anywhere a Japanese address has to be
written in Latin script.

**Addresses are personal data, so this library never sends them anywhere.** There is no hosted API
and no service to sign up for. It reads a local copy of the address dataset and, by default, makes
no network requests at all — enforced by a test that replaces `fetch` with a stub that throws, so a
regression that reaches the network fails CI.

**[Try it in your browser](https://tomatomerde.github.io/jp-address-romaji/)** — the published
package, running on the page, with the dataset served from that page's own origin. The demo lists
every request it makes, which is how you can check the one caveat this library has in a browser:
the prefecture and the municipality appear in a URL, and nothing past them does. See
[In the browser](#in-the-browser).

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿二丁目8番1号');
// → { ok: true, value: { formatted: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿二丁目8-1', … } }
```

## What this is, and what it is not

This library does **not** implement address normalization. That is delegated entirely to
[`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses),
which already handles full-width digits, kanji numerals, `丁目/番/号` versus hyphen notation, omitted
prefectures, and character variants. This package implements the layer above it: romanization,
word order, reverse lookup, and output formats.

It also does not invent readings. Every romanization comes from the dataset — either its romaji
field or its kana reading, transliterated deterministically. When neither is available, the API
returns an explicit failure. A wrong shipping label is worse than a refused one.

## Install

```sh
npm install jp-address-romaji jp-address-romaji-data
```

> **Node.js 18+, ESM only.** There is no CommonJS build and none is planned —
> `require('jp-address-romaji')` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Use `import`, or a dynamic
> `import()` from CommonJS code. In Node the dataset is read from the filesystem and nothing leaves
> the machine. Browsers are supported too, with data you serve yourself — see
> [In the browser](#in-the-browser). Details under [Requirements](#requirements).

`jp-address-romaji-data` is optional but recommended: it is the offline dataset, and installing it
means everything works with zero configuration. To point at your own copy instead:

```ts
import { configureDataSource } from 'jp-address-romaji';
configureDataSource({ dataDir: './address-data' });
```

To build or refresh a dataset yourself:

```sh
npx jp-address-romaji-data build --out ./address-data
```

That download contacts Geolonia once. Converting addresses never does.

## In the browser

The package ships a browser entry point, selected automatically through the `browser` condition in
its `exports` map — any bundler that honours export conditions (Vite, webpack, esbuild, Rollup,
Parcel) picks it up with no configuration. The API is identical. What differs is where the dataset
comes from: a page has no filesystem, so you serve the data yourself and name it.

```ts
import { configureDataSource, toRomaji } from 'jp-address-romaji';

configureDataSource({ endpoint: 'https://your-site.example/address-data/ja' });

await toRomaji('東京都新宿区西新宿二丁目8番1号');
// → { ok: true, value: { formatted: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }
```

The endpoint is the dataset directory with `/ja` on the end. The library reads `<endpoint>.json` for
the prefecture and municipality index, then `<endpoint>/<prefecture>/<municipality>.json` for the
towns of the one municipality it needs. Build the dataset with
`npx jp-address-romaji-data build --out ./address-data` and serve `address-data/` as static files.
The full set is one file per municipality — about 1,900 of them — but a conversion fetches two, so
you can also publish only the municipalities you care about. If you do, an address in a
municipality you did not publish comes back as `DATA_NOT_CONFIGURED` naming that municipality —
a failure value like any other, not a thrown error. That needs `0.1.7` or newer; handle it the way
you handle the rest of the failure reasons rather than treating it as a broken install, because on
a partial dataset it is ordinary traffic.

**What the privacy claim means here, exactly.** The request for a municipality file puts the
prefecture and the municipality in a URL that reaches your server. Everything past that — block
number, building name, addressee — is matched inside the page and never sent anywhere. That is a
weaker guarantee than the Node path, where nothing leaves the process at all. If your users are
choosing this library for its privacy properties, tell them which of the two they are getting.

The [demo](https://tomatomerde.github.io/jp-address-romaji/) is this exact setup — a handful of
municipalities served from the page's own origin — and it lists every request the page has made, so
the paragraph above can be checked rather than taken on trust.

`configureDataSource({ dataDir })` cannot work in a browser and does not pretend to: it leaves the
library unconfigured, and conversions return `DATA_NOT_CONFIGURED`.

CI bundles the packed tarball for the browser and converts an address in headless Chromium on every
change (`scripts/browser-smoke.mjs`), including an assertion that the page contacts no origin but
its own.

## Requirements

Node.js 18+ for the Node entry point; any bundler that resolves export conditions for the browser
one. The offline dataset is read from the filesystem in Node — in a browser it comes from an
endpoint you host (see [In the browser](#in-the-browser)).

**ESM only, no CommonJS build.** Both packages ship `"type": "module"` with a single ESM entry
point — there is no `require()`-compatible `dist/*.cjs`, and none is planned. Use `import` (or
dynamic `import()` from CommonJS code); `require('jp-address-romaji')` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

## Coverage

Measured over all 638,567 town-level records of the shipped dataset:

| Segment | Entries | Usable |
| --- | ---: | ---: |
| **Chome-bearing (urban, 住居表示)** | 92,971 | **99.99%** |
| **`大字`-prefixed (rural)** | 61,330 | **99.96%** |
| National | 638,567 | **99.55%** |

Coverage is **not** uniform across prefectures, and the national figure hides the spread: 21 of the
47 prefectures are at 99.9% or better, but 6 are below 95% and 2 below 90% — Yamanashi (84.95%) and
Nagano (85.02%). Chome-bearing entries are the even part: every prefecture is at 99.96% or better
there, and Hokkaido is the only one not at exactly 100.00%. So urban addresses convert essentially
everywhere, while refusals concentrate in the non-chome entries of a few prefectures. The
per-prefecture table is in [docs/coverage.md](./docs/coverage.md).

Where a name has no usable reading — 0.45% of entries nationally — you get `NO_ROMAJI_DATA` rather
than a guess.

**Romaji and kana do not go missing together.** 89.51% of entries carry a romaji field but 99.55%
carry a kana reading, so roughly one entry in ten is romanized by transliterating its kana. That
path is not a fallback for rare cases; it is load-bearing.

These figures are produced by `scripts/measure-coverage.ts`, which lives in this repository rather
than in the published package: regenerating them for a different dataset version needs a clone and
a built dataset (`pnpm coverage:measure --data ./address-data`), not an `npm install`.

## Not supported

- **Geocoding accuracy.** Coordinates are deliberately excluded from the bundled town data.
- **Building-name translation or romanization.** Building names and room numbers are isolated as
  `unparsed` and passed through untouched. The type has no `romaji` field for them, by design.
- **Romanizing the Kyoto street phrase.** It is preserved, not translated — see below.
- **`fromRomaji` reads western order only.** It expects the prefecture last. Output produced with
  `order: 'japanese'` is for display, not for feeding back in — `fromRomaji` will reject it with
  `PREFECTURE_NOT_FOUND`. Round-tripping works with the default western order.
- **Reconstructing a koaza from romaji.** `fromRomaji` has no per-koaza index, so a koaza present in
  the original Japanese address cannot be recovered by round-tripping through romaji — see below.
- **A browser without a dataset you host.** There is no hosted API to fall back on, by design, so a
  page that names no endpoint converts nothing — see [In the browser](#in-the-browser).

### Kyoto street-name addresses

Central Kyoto is customarily addressed by naming an intersection and a direction before the town.
These are supported:

```ts
await toRomaji('京都府京都市中京区烏丸通四条上ル笋町123');
// formatted:   '123 Takannacho, Nakagyo-ku, Kyoto-shi, Kyoto, Japan'
// kyotoStreet: '烏丸通四条上ル'
```

The street phrase is separated out **before** normalization, which is not optional: street names
contain the same kanji numerals as chome, so `烏丸通四条上ル笋町` fed to the normalizer unchanged is
read as chome 4 of an unrelated town.

The phrase is navigational rather than administrative — the official address is the town plus its
number — so it is kept verbatim on `parsed.kyotoStreet` and **not** rendered into the romanized
string. It is never romanized: the dataset has no readings for street names, and guessing one is
exactly what this library refuses to do. `fromRomaji` cannot reconstruct it, so a round-trip through
romaji loses it.

If the street phrase is recognized but the town after it is not in the dataset, you get
`KYOTO_STREET_ADDRESS` with the phrase in `partial.kyotoStreet`.

### Named koaza (小字)

Some towns have a further, named subdivision below the town level — a small-area name such as
`字天津川` in `三重県伊賀市西明寺字天津川`. When the dataset's reading for it can be verified to
cover the whole name, it is romanized and included on `parsed.koaza`:

```ts
await toRomaji('三重県伊賀市西明寺字天津川1-1');
// formatted:    '1-1 Azamatsugawa Saimyoji, Iga-shi, Mie, Japan'
// parsed.koaza: { ja: '字天津川', kana: 'アザアマツガワ', romaji: 'Azamatsugawa' }
```

When the reading cannot be verified, the whole conversion refuses rather than dropping part of the
address. The dataset gives `三丁目大横` in `長野県飯田市本町三丁目大横` the reading `３チョウメ`,
which stops at the counter and never reaches `大横`:

```ts
await toRomaji('長野県飯田市本町三丁目大横1-1');
// { ok: false, reason: 'KOAZA_READING_INCOMPLETE', … }
```

Refusing this one needs `0.1.5` or newer. Both examples are pinned in
`packages/core/test/realdata.test.ts`.

Measured over the whole dataset (`scripts/verify-data-assumptions.ts`, assumption 6/6b): 437,014 of
638,567 town rows carry a koaza (68.437%). 18,409 of those are purely numeric and are folded into
`blockNumbers` instead; of the remaining 418,605 named koaza, every one has a kana reading, but only
781 (0.187%) also carry a dedicated romaji field. The completeness check passes 417,206 of the named
ones (99.666%) and refuses 1,399 (0.334%). Refusals take two shapes, and in both the reading stops
before the name does:

- **The reading stops short of a trailing positional kanji** (北/南/東/西/上/下/中). 南郷通
  (札幌市白石区)'s koaza `一丁目北` has a kana reading that reaches only `チョウメ`.
- **The reading stops at a counter** (`丁目`, `条`, `号`, `地割`, …) while the name continues past
  it. `三丁目大横` above is this shape — `横` is not one of the seven positional kanji, so a check
  aimed only at those does not catch it.

Romanizing a truncated reading like that would silently name a different, real place, so it is
refused with `KOAZA_READING_INCOMPLETE` instead.

`fromRomaji` does not reconstruct a koaza — there is no per-koaza index to search — so this is a
one-way enhancement. A koaza-bearing address that has been romanized cannot be read back to the same
Japanese address; it fails (typically `TOWN_NOT_FOUND`) rather than silently resolving to the
koaza-less town.

### Known dataset defects you will hit

These are properties of the upstream data, not of the conversion logic. The library detects them
and refuses rather than emitting a wrong address, so they surface as failures:

- **A few rows carry a reading that belongs to a neighbouring entry.** Where the kana is
  implausibly long for the name it reads, we cannot trust it, and the address becomes unreachable
  in both directions: `toRomaji` returns `CORRUPT_ROMAJI_DATA` and `fromRomaji` will not offer it
  as a candidate. This is rare in the current dataset.
- **Short forms of a town name can be ambiguous.** Measured on the shipped dataset with the
  matcher's own key functions: 1.07% of the romanization keys `fromRomaji` indexes (2,780 of
  259,703) match more than one distinct town within the same municipality — Hakodate has both
  `昭和町` and `昭和`, so `"Showa"` matches both. Writing the full name (`"Showa-cho"`) resolves
  roughly half of those cases, and this library's own output always writes the full name. Typed
  short forms return `AMBIGUOUS` with the candidates.

## Status and disclaimer

**Version `0.x`: the API may change.** This is a personal project, maintained on a best-effort
basis. Issues and pull requests are welcome, but response times are not guaranteed.

The software is provided **as is, without warranty of any kind**, as stated in the MIT licence.
Two limits are worth spelling out beyond that boilerplate, because they are easy to assume away:

- **A successful conversion is not a validated address.** The output reflects what the dataset
  says; it does not certify that the address exists, is deliverable, or is currently in use.
  Municipal mergers and address reorganizations mean the dataset lags reality by some amount.
- **Do not use this as the sole basis for postal, legal, or financial decisions.** The library is
  built to refuse rather than guess — that is why failures are typed values you have to handle —
  but refusing is the guarantee, not correctness. If a wrong address carries real cost, verify
  through the relevant authority.

## API

### `toRomaji(japaneseAddress, options?)`

```ts
const result = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3 サンプルビル301');
if (result.ok) {
  result.value.formatted;        // 'サンプルビル301, 1-2-3 Uehara, Shibuya-ku, Tokyo 151-0064, Japan'
  result.value.parsed.town;      // { ja: '上原', kana: 'ウエハラ', romaji: 'Uehara' }
  result.value.parsed.unparsed;  // 'サンプルビル301'  — never romanized
} else {
  result.reason;                 // 'NO_ROMAJI_DATA' | 'TOWN_NOT_FOUND' | …
}
```

| Option | Values | Default | Notes |
| --- | --- | --- | --- |
| `longVowel` | `'none'` `'macron'` `'circumflex'` `'oh'` | `'none'` | `'none'` is passport Hepburn. Anything else needs a kana reading (see below). |
| `order` | `'western'` `'japanese'` | `'western'` | |
| `includeCountry` | boolean | `true` | Appends `, Japan`. |
| `postalCode` | `'suffix'` `'prefix'` `'omit'` | `'suffix'` | |
| `capitalization` | `'title'` `'upper'` | `'title'` | |
| `includeUnparsed` | boolean | `true` | Whether the building name appears in `formatted`. It is always kept in `parsed`. |

Long-vowel styles other than `'none'` are derived from the **kana**, not from the dataset's romaji
field. That field is ALL-CAPS and already stripped of vowel length (`KITA1-JOHIGASHI`), so `Tōkyō`
cannot be recovered from it. If a name has no kana reading, those styles fail with
`KANA_REQUIRED_FOR_LONG_VOWELS` rather than silently emitting an unmarked spelling.

### `fromRomaji(romajiAddress, options?)`

Resolution is strictly outside-in — prefecture, then municipality, then town — because, written as
a full-form key, a town's romanization is unique within a known municipality 97.95% of the time but
only 59.92% of the time nationally. Municipality names collide too: 39 groups of municipalities in
different prefectures share a romanization, 86 municipalities in all. 19 of those groups are
literally the same name in Japanese — 伊達市, 美里町 and 池田町 among them. The other 20 are
*different* names that happen to romanize alike: `Mihama-cho` is 御浜町 in Mie and 美浜町 in three
other prefectures.

Every coverage and ambiguity figure on this page is generated into
[docs/coverage.md](./docs/coverage.md) from the shipped dataset, with the matcher's own key
functions, and CI fails if a sentence here stops matching it. The koaza figures further up come
from `scripts/verify-data-assumptions.ts`, which the same monthly workflow runs but only reports.

When more than one Japanese address matches, it returns `AMBIGUOUS` **with the candidates**, and
lets you choose:

```ts
const result = await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto');
// { ok: false, reason: 'AMBIGUOUS',
//   candidates: [ …町: 夷町…, …町: 恵比須町… ] }
// 夷町 and 恵比須町 are two distinct real towns in Kyoto's Nakagyo ward
// that both romanize to "Ebisu-cho".
```

#### Postal code

A postal code in the input is parsed into `parsed.postalCode`, and can narrow an ambiguous
romanization if you supply a way to look one up:

```ts
await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto 604-8081', {
  postalCodeIndex: (code) => myPostalData[code],   // -> ['夷町']
});
// → { ok: true, … town: 夷町 }
```

No postal dataset is bundled. The ambiguity that even a full town name cannot resolve is 0.67%
of full-form romanization keys (1,406 of 211,041, involving 2,622 towns nationally), so shipping
Japan Post's `KEN_ALL` — a second data source with its own licence and update cadence — is not
justified by what it would buy. The hook lets you use postal data you already have.

A code that fails to single out one town leaves the result `AMBIGUOUS`. The candidates are never
narrowed to a guess.

### `parse(address)`

Detects the script and returns a `ParsedAddress` either way.

### `toFormat(parsed, target)`

If the address is going into a checkout form or a payment API rather than onto a label, the work
isn't romanization — it's getting the pieces into the fields that provider expects. Japan doesn't
map cleanly onto the `line1 / city / state` shape most of them assume, and the building name is the
part that usually ends up mangled.

Targets: `'google-i18n'`, `'shopify'`, `'stripe'`.

```ts
toFormat(parsed, 'stripe');
// { line1: '1-2-3 Uehara', line2: 'サンプルビル301', city: 'Shibuya-ku',
//   state: 'Tokyo', postal_code: '151-0064', country: 'JP' }
```

The building name is carried **verbatim and unromanized** into whichever field that target uses for
a second address line — `line2` for Stripe, `address2` for Shopify, a second entry in
`addressLines` for `google-i18n`. That is deliberate: `サンプルビル301` is what the courier reads,
and there is no authoritative romanization for it.

Everything else follows each target's own naming for the same values. The prefecture is `state`
(Stripe), `province` (Shopify), or `administrativeArea` (`google-i18n`); the municipality and ward
are joined into one locality line. `google-i18n` additionally keeps the town in `sublocality`,
which the other two have no field for.

## Failures are values, not exceptions

Nothing throws for an unconvertible address. Every entry point returns a discriminated union, so
the compiler makes you handle the failure case.

| `reason` | Meaning |
| --- | --- |
| `NO_ROMAJI_DATA` | The town has neither a romaji field nor a kana reading. Common for rural `大字` names. |
| `CORRUPT_ROMAJI_DATA` | The dataset's reading for this entry is self-inconsistent and was rejected. |
| `KANA_REQUIRED_FOR_LONG_VOWELS` | A macron/circumflex/`oh` style was requested but no kana reading exists. |
| `KOAZA_READING_INCOMPLETE` | The town has a named koaza, but its reading cannot be verified to cover the whole name (see [Named koaza](#named-koaza-小字)). Refused rather than romanized incomplete. |
| `AMBIGUOUS` | Several Japanese addresses match. `candidates` holds them. |
| `TOWN_NOT_FOUND` / `CITY_NOT_FOUND` / `PREFECTURE_NOT_FOUND` | Resolution stopped at that level. `partial` holds what was resolved. |
| `KYOTO_STREET_ADDRESS` | The street phrase was understood but the town after it is not in the dataset (see [Kyoto street-name addresses](#kyoto-street-name-addresses)). |
| `DATA_NOT_CONFIGURED` | No dataset installed or configured. |
| `EMPTY_INPUT` | No recognizable address in the input. |

## Roadmap

### Under consideration

Driven by what real address data actually needs, not by a feature list. Each of these is written up
with the reasoning for why it was *not* done by default — **if one of them is what you need, say so
on the issue.** Real use cases are what decide whether they ship and what their defaults are.

- [Reading a named koaza back from romaji](https://github.com/tomatomerde/jp-address-romaji/issues/68)
  — `toRomaji` writes one out and `fromRomaji` cannot read it back, so the round trip is one-way
- [A bundled postal-code index](https://github.com/tomatomerde/jp-address-romaji/issues/69)
  — the `postalCodeIndex` hook exists, the data does not, and the hosted alternatives resolve a
  postal code by sending it somewhere
- [A CommonJS build](https://github.com/tomatomerde/jp-address-romaji/issues/70)
  — `require()` does not resolve these packages at all, on any Node version
- [Widening the Japanese-script class that detects building names](https://github.com/tomatomerde/jp-address-romaji/issues/71)
  — `々`, compatibility ideographs and non-BMP kanji sit outside it; no real-data trigger found yet
- [Fetching browser data without naming the municipality in the URL](https://github.com/tomatomerde/jp-address-romaji/issues/72)
  — the browser path's guarantee is weaker than Node's, and the demo says so rather than rounding it

None of these touch the two rules the rest of the library is built on: a reading that cannot be
verified is refused rather than rounded to a plausible spelling, and nothing falls back to a hosted
service — a guarantee the test suite enforces rather than the documentation asserting it. The ones
that would add behaviour are **opt-in and off by default**; the ones that would add an artifact sit
alongside what ships today rather than replacing it.

What is deliberately *not* on this list is under [Not supported](#not-supported).

New request? [Open one](https://github.com/tomatomerde/jp-address-romaji/issues/new?template=feature_request.yml)
— bring a few of your actual addresses, that is the part that decides things.

## Data source and licensing

The address data originates from the Japanese Digital Agency's
**[アドレス・ベース・レジストリ (Address Base Registry)](https://www.digital.go.jp/policies/base_registry_address)**,
processed and published by **[Geolonia](https://geolonia.com/)**:

- [`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses) — MIT
- [`@geolonia/japanese-addresses-v2`](https://github.com/geolonia/japanese-addresses-v2) — MIT

The Address Base Registry is published by the Digital Agency under terms permitting free use
including commercial use. Verify the current terms for your use case at the link above.

This library is MIT licensed. See [LICENSE](./LICENSE).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for what this library must never break, local dev setup,
and the branch/PR workflow.
