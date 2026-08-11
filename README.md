# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#requirements)
[![ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#requirements)
[![no network at runtime](https://img.shields.io/badge/network%20at%20runtime-none-brightgreen.svg)](#requirements)

**English** | [日本語](./README.ja.md)

Bidirectional conversion between Japanese addresses and their romanized, western-order equivalents.
For shipping labels, international checkout forms, and anywhere a Japanese address has to be
written in Latin script.

**Addresses are personal data, so this library never sends them anywhere.** There is no hosted API
and no service to sign up for. It reads a local copy of the address dataset and, by default, makes
no network requests at all — enforced by a test that replaces `fetch` with a stub that throws, so a
regression that reaches the network fails CI.

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿三丁目5番12号');
// → { ok: true, value: { formatted: '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿三丁目5-12', … } }
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
> `require('jp-address-romaji')` fails with `ERR_REQUIRE_ESM`. Use `import`, or a dynamic
> `import()` from CommonJS code. The dataset is read from the filesystem, so the default
> configuration is Node-only; browser use needs a data endpoint you host. Details under
> [Requirements](#requirements).

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

## Requirements

Node.js 18+. The offline dataset is read from the filesystem, so the default configuration is
Node-only; browser use requires supplying data through an endpoint you host.

**ESM only, no CommonJS build.** Both packages ship `"type": "module"` with a single ESM entry
point — there is no `require()`-compatible `dist/*.cjs`, and none is planned. Use `import` (or
dynamic `import()` from CommonJS code); `require('jp-address-romaji')` fails with `ERR_REQUIRE_ESM`.

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

### Known dataset defects you will hit

These are properties of the upstream data, not of the conversion logic. The library detects them
and refuses rather than emitting a wrong address, so they surface as failures:

- **A few rows carry a reading that belongs to a neighbouring entry.** Where the kana is
  implausibly long for the name it reads, we cannot trust it, and the address becomes unreachable
  in both directions: `toRomaji` returns `CORRUPT_ROMAJI_DATA` and `fromRomaji` will not offer it
  as a candidate. This is rare in the current dataset.
- **Short forms of a town name can be ambiguous.** 1.23% of town romanizations match more than one
  distinct town within the same municipality — Hakodate has both `昭和町` and `昭和一丁目`, so
  `"Showa"` matches both. Writing the full name (`"Showa-cho"`) resolves it, and this library's own
  output always does. Typed short forms return `AMBIGUOUS` with the candidates.

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

Resolution is strictly outside-in — prefecture, then municipality, then town — because a town's
romanization is unique within a known municipality 99.05% of the time but far less so nationally,
and 13 municipality names collide across prefectures (`Date-shi` is both 北海道伊達市 and 福島県伊達市).

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

No postal dataset is bundled. Genuine ambiguity is 0.95% of town romanizations, and most of it
disappears when the full town name is written, so shipping Japan Post's `KEN_ALL` — a second data
source with its own licence and update cadence — is not justified by what it would buy. The hook
lets you use postal data you already have.

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
| `AMBIGUOUS` | Several Japanese addresses match. `candidates` holds them. |
| `TOWN_NOT_FOUND` / `CITY_NOT_FOUND` / `PREFECTURE_NOT_FOUND` | Resolution stopped at that level. `partial` holds what was resolved. |
| `KYOTO_STREET_ADDRESS` | The street phrase was understood but the town after it is not in the dataset (see [Kyoto street-name addresses](#kyoto-street-name-addresses)). |
| `DATA_NOT_CONFIGURED` | No dataset installed or configured. |
| `EMPTY_INPUT` | No recognizable address in the input. |

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
