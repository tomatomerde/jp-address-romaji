# jp-address-romaji

Bidirectional conversion between Japanese addresses and their romanized, western-order equivalents.

**Addresses are personal data, so this library never sends them anywhere.** There is no hosted API and no service to sign up for. It reads a local copy of the address dataset and, by default, makes no network requests at all — which is enforced by a test that replaces `fetch` with a stub that throws.

日本語版は [README.ja.md](./README.ja.md) にあります。

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

### `fromRomaji(romajiAddress)`

Resolution is strictly outside-in — prefecture, then municipality, then town — because a town's
romanization is unique within a known municipality 99.7% of the time but far less so nationally,
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

A postal code in the input is parsed and returned in `parsed.postalCode`. **It is not currently
used to narrow `AMBIGUOUS` candidates** — the bundled dataset has no postal-code-to-town mapping
(that would mean also bundling Japan Post's `KEN_ALL`, deferred to a future version). If you need to
resolve an `AMBIGUOUS` result today, either present `candidates` to the user or apply your own
postal-code lookup against the `partial` town names.

### `parse(address)`

Detects the script and returns a `ParsedAddress` either way.

### `toFormat(parsed, target)`

Targets: `'google-i18n'`, `'shopify'`, `'stripe'`. The building name goes into the second address
line of each, verbatim.

```ts
toFormat(parsed, 'stripe');
// { line1: '1-2-3 Uehara', line2: 'サンプルビル301', city: 'Shibuya-ku',
//   state: 'Tokyo', postal_code: '151-0064', country: 'JP' }
```

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
| `KYOTO_STREET_ADDRESS` | Kyoto street-name addressing; unsupported (see below). |
| `DATA_NOT_CONFIGURED` | No dataset installed or configured. |
| `EMPTY_INPUT` | No recognizable address in the input. |

## Coverage: read this before relying on it

Coverage is not uniform, and the average hides the shape. Measured over 277,656 town-level records
of the national dataset:

| Segment | Entries | Romaji coverage |
| --- | ---: | ---: |
| **Chome-bearing (urban, 住居表示)** | 90,972 | **99.83%** |
| Non-chome (rural `大字`) | 99,451 | 75.46% |
| `大字`-prefixed specifically | 10,701 | **3.62%** |
| National, distinct entries | 190,423 | 87.11% |

Prefectures with the lowest overall coverage — Aomori 46%, Okinawa 50%, Nagano 61%, Fukushima 64% —
are **all ~100% on chome entries**. Their gaps are rural `大字` names.

Two consequences:

- For international shipping, which overwhelmingly targets urban chome-style addresses, effective
  coverage is very high.
- For rural addresses, expect `NO_ROMAJI_DATA`. That is the library working as intended.

Also note that kana and romaji go missing *together*: of 277,656 records, only 50 have kana without
romaji. There is no kana fallback that rescues the gap.

Run `pnpm coverage:measure --data ./address-data` to regenerate these figures for your dataset
version; the committed report is in [docs/coverage.md](./docs/coverage.md).

## Not supported

- **Geocoding accuracy.** Coordinates are deliberately excluded from the bundled town data.
- **Kyoto street-name addresses** (`四条通烏丸東入ル`). Detected and refused with
  `KYOTO_STREET_ADDRESS` rather than silently dropping the street phrase.
- **Building-name translation or romanization.** Building names and room numbers are isolated as
  `unparsed` and passed through untouched. The type has no `romaji` field for them, by design.
- **`fromRomaji` reads western order only.** It expects the prefecture last. Output produced with
  `order: 'japanese'` is for display, not for feeding back in — `fromRomaji` will reject it with
  `PREFECTURE_NOT_FOUND`. Round-tripping works with the default western order.

### Known dataset defects you will hit

These are properties of the upstream data, not of the conversion logic. The library detects them
and refuses rather than emitting a wrong address, so they surface as failures:

- **Some real addresses are unreachable in both directions.** Where a dataset row carries a
  reading belonging to a neighbouring entry, we cannot trust it. `円山` in Sapporo's Chuo ward is
  the clearest case: its kana and romaji are both `円山西町`'s. `toRomaji` returns
  `CORRUPT_ROMAJI_DATA` and `fromRomaji` will not offer it as a candidate.
- **Short forms of a town name are frequently ambiguous.** Nationally, about 880 towns have a
  suffix-less form that is also another town's full name in the same municipality — Hakodate has
  both `昭和町` and `昭和一丁目`, so `"Showa"` matches both. Writing the full name (`"Showa-cho"`)
  resolves it, and this library's own output always does. Typed short forms return `AMBIGUOUS`
  with the candidates.

## Data source and licensing

The address data originates from the Japanese Digital Agency's
**[アドレス・ベース・レジストリ (Address Base Registry)](https://www.digital.go.jp/policies/base_registry_address)**,
processed and published by **[Geolonia](https://geolonia.com/)**:

- [`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses) — MIT
- [`@geolonia/japanese-addresses-v2`](https://github.com/geolonia/japanese-addresses-v2) — MIT

The Address Base Registry is published by the Digital Agency under terms permitting free use
including commercial use. Verify the current terms for your use case at the link above.

This library is MIT licensed. See [LICENSE](./LICENSE).

## Requirements

Node.js 18+. The offline dataset is read from the filesystem, so the default configuration is
Node-only; browser use requires supplying data through an endpoint you host.
