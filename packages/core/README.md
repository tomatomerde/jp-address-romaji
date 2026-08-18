# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tomatomerde/jp-address-romaji/blob/main/LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#requirements)
[![module: ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#requirements)
[![no network at runtime in Node](https://img.shields.io/badge/network%20at%20runtime%20%28Node%29-none-brightgreen.svg)](#requirements)
[![browser: bring your own endpoint](https://img.shields.io/badge/browser-bring%20your%20own%20endpoint-blue.svg)](#in-the-browser)

Bidirectional conversion between Japanese addresses and their romanized, western-order equivalents.

**Addresses are personal data, so this library never sends them anywhere.** There is no hosted API.
It reads a local copy of the address dataset and, by default, makes no network requests at all —
enforced by a test that replaces `fetch` with a stub that throws.

```sh
npm install jp-address-romaji jp-address-romaji-data
```

## Requirements

Read these before installing — they are the conditions that fail *after* `npm install`, not during
it:

- **ESM only.** `package.json` is `"type": "module"` and the `exports` map has no `require`
  condition, so `require('jp-address-romaji')` does not work. CJS support is out of scope for now.
- **Node.js 18+**, where the dataset is read from the filesystem. **Browsers are supported** through
  the `browser` export condition, but a page has no filesystem: you serve the data yourself and
  point the library at it. See [In the browser](#in-the-browser).
- **The dataset package is required.** `jp-address-romaji-data` is a separate install (above);
  without it every conversion fails with `DATA_NOT_CONFIGURED` rather than silently going to the
  network.
- **Version `0.x`** — the API may still change between minor releases. This is a personal project
  maintained on a best-effort basis.

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿二丁目8番1号');
// → { ok: true, value: { formatted: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿二丁目8-1', … } }
```

## In the browser

Any bundler that honours export conditions picks the browser entry point automatically; the API is
identical. A page has no filesystem, so the dataset comes from an endpoint you serve:

```ts
import { configureDataSource, toRomaji } from 'jp-address-romaji';

configureDataSource({ endpoint: 'https://your-site.example/address-data/ja' });
await toRomaji('東京都新宿区西新宿二丁目8番1号');
```

The library reads `<endpoint>.json` for the prefecture/municipality index and
`<endpoint>/<prefecture>/<municipality>.json` for the towns of the one municipality it needs. Build
the files with `npx jp-address-romaji-data build --out ./address-data` and serve them statically.

**Be precise with your users about what this guarantees.** The municipality request puts the
prefecture and the municipality in a URL on your server. The block number, building name and
addressee are matched inside the page and never sent anywhere — but that is a weaker promise than
the Node path, where nothing leaves the process at all. `configureDataSource({ dataDir })` cannot
work in a browser and refuses rather than approximating: conversions return `DATA_NOT_CONFIGURED`.

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

## Data source and disclaimer

Derived from the Japanese Digital Agency's
[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address),
processed and published by [Geolonia](https://geolonia.com/) (MIT). Full attribution is in
[`ATTRIBUTION.md`](https://github.com/tomatomerde/jp-address-romaji/blob/main/packages/data/ATTRIBUTION.md).

The software is MIT licensed and provided "AS IS". What it guarantees is the *refusal*: when a
reading is unavailable or a romanization is ambiguous, it returns a typed failure instead of a
guess. It does not guarantee that a conversion it does return is correct for your purpose — verify
before printing a shipping label or filing anything official.
