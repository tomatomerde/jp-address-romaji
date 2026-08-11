# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tomatomerde/jp-address-romaji/blob/main/LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#requirements)
[![module: ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#requirements)
[![no network at runtime](https://img.shields.io/badge/network%20at%20runtime-none-brightgreen.svg)](#requirements)

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
- **Node.js 18+**, and **Node-only out of the box**: the default configuration reads the dataset
  from the filesystem. Browser use needs you to serve the data from an endpoint you host yourself.
- **The dataset package is required.** `jp-address-romaji-data` is a separate install (above);
  without it every conversion fails with `DATA_NOT_CONFIGURED` rather than silently going to the
  network.
- **Version `0.x`** — the API may still change between minor releases. This is a personal project
  maintained on a best-effort basis.

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

## Data source and disclaimer

Derived from the Japanese Digital Agency's
[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address),
processed and published by [Geolonia](https://geolonia.com/) (MIT). Full attribution is in
[`ATTRIBUTION.md`](https://github.com/tomatomerde/jp-address-romaji/blob/main/packages/data/ATTRIBUTION.md).

The software is MIT licensed and provided "AS IS". What it guarantees is the *refusal*: when a
reading is unavailable or a romanization is ambiguous, it returns a typed failure instead of a
guess. It does not guarantee that a conversion it does return is correct for your purpose — verify
before printing a shipping label or filing anything official.
