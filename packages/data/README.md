# jp-address-romaji-data

The offline Japanese address dataset used by
[`jp-address-romaji`](https://www.npmjs.com/package/jp-address-romaji).

```sh
npm install jp-address-romaji jp-address-romaji-data
```

Installing it is all you need to do — `jp-address-romaji` finds it automatically, and every
conversion then runs locally with no network access.

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
