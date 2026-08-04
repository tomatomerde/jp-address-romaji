# jp-address-romaji

Bidirectional conversion between Japanese addresses and their romanized, western-order equivalents.

**Addresses are personal data, so this library never sends them anywhere.** There is no hosted API.
It reads a local copy of the address dataset and, by default, makes no network requests at all —
enforced by a test that replaces `fetch` with a stub that throws.

```sh
npm install jp-address-romaji jp-address-romaji-data
```

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿三丁目5番12号');
// → { ok: true, value: { formatted: '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿三丁目5-12', … } }
```

## What it does and does not do

Address **normalization** is delegated entirely to
[`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses).
This package implements the layer above it: romanization, word order, reverse lookup, and output
formats for Google libaddressinput, Shopify and Stripe.

It never invents readings. Every romanization comes from the dataset — its romaji field, or its kana
reading transliterated deterministically. When neither is available the API returns an explicit
failure rather than a plausible guess. Failures are returned as values, not thrown, so the compiler
makes you handle them.

Coverage over the 638,567 town entries of the shipped dataset is **99.55%**, and 99.99% for
chome-bearing urban addresses.

Building names and room numbers are isolated as `unparsed` and passed through untouched — never
translated or romanized.

## Documentation

Full documentation, the coverage report, the failure-reason table and the list of unsupported cases
(Kyoto street-name addresses, geocoding accuracy) are in the repository:

**https://github.com/tomatomerde/jp-address-romaji**

日本語版: [README.ja.md](https://github.com/tomatomerde/jp-address-romaji/blob/main/README.ja.md)

## Data source

Derived from the Japanese Digital Agency's
[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address),
processed and published by [Geolonia](https://geolonia.com/) (MIT).

MIT licensed. Requires Node.js 18+.
