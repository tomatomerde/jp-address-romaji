# jp-address-romaji-data

[![npm](https://img.shields.io/npm/v/jp-address-romaji-data.svg)](https://www.npmjs.com/package/jp-address-romaji-data)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![Code: MIT](https://img.shields.io/badge/code-MIT-blue.svg)](https://github.com/tomatomerde/jp-address-romaji/blob/main/LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](https://github.com/tomatomerde/jp-address-romaji#requirements)
[![module: ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](https://github.com/tomatomerde/jp-address-romaji#requirements)

The offline Japanese address dataset used by
[`jp-address-romaji`](https://www.npmjs.com/package/jp-address-romaji).

```sh
npm install jp-address-romaji jp-address-romaji-data
```

Installing it is all you need to do — `jp-address-romaji` finds it automatically, and every
conversion then runs locally with no network access.

**ESM only, Node.js 18+.** This package exists to be installed alongside the library, not used on
its own; see the [library's requirements](https://github.com/tomatomerde/jp-address-romaji#requirements).

## What's in it

638,567 town (machi-aza) entries across 1,899 municipalities, in the same layout the upstream
Geolonia v2 API serves:

```
data/ja.json                  prefectures + municipalities
data/ja/<pref>/<city>.json    towns of one municipality
```

Two things are deliberately excluded:

- **Coordinates on town records.** This library makes no geocoding accuracy claim, so representative
  points would add tens of megabytes of data it never reads. They are kept on prefecture and city
  records, which upstream requires.
- **Street-level data** (residential display and parcel numbers). Block numbers are digits and need
  no lookup; only town-level names carry readings that cannot be derived.

## Building the dataset yourself

```sh
npx jp-address-romaji-data build --out ./address-data
```

That contacts Geolonia once. Converting addresses never does.

```ts
import { configureDataSource } from 'jp-address-romaji';
configureDataSource({ dataDir: './address-data' });
```

Other commands: `where` prints the bundled dataset directory, `status` reports whether it has been
generated.

## Data source and licensing

The data originates from the Japanese Digital Agency's **Address Base Registry**
(アドレス・ベース・レジストリ), processed and published by **Geolonia**. See
[ATTRIBUTION.md](./ATTRIBUTION.md) for the full statement and links.

The build tooling in this package is MIT licensed.
