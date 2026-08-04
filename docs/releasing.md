# Releasing

Two packages ship together: `jp-address-romaji` (the library) and `jp-address-romaji-data` (the
dataset). The library is useless without a dataset, so publish the data package first.

The dataset is **not** in git. It is built from the upstream API at release time, which is why
`prepublishOnly` on the data package refuses to publish without it.

## 1. Build and verify the dataset

```sh
npx tsx packages/data/src/build-data.ts --out ./packages/data/data
```

Takes a few minutes and makes ~1,900 requests. If any municipality fails to download, the build
exits non-zero — do not publish a partial dataset.

Then confirm the data still matches what the library's heuristics assume:

```sh
npx tsx scripts/verify-data-assumptions.ts --data ./packages/data/data
```

This is the check that has caught real defects (a plausibility test that refused 3.65% of addresses,
and a chome-stripping step that truncated names ending in a digit). **Read its output.** Every entry
it lists under "reading-plausibility" is an address the library will refuse.

## 2. Run the suite against the real dataset

```sh
JP_ADDRESS_ROMAJI_DATA_DIR=./packages/data/data pnpm test
```

Without that variable the integration tests in `packages/core/test/realdata.test.ts` skip, and you
are only testing against the fixtures.

## 3. Refresh the coverage report

```sh
npx tsx scripts/measure-coverage.ts --data ./packages/data/data > docs/coverage.md
```

Commit it if it changed, and update `CHANGELOG.md`.

## 4. Publish

```sh
pnpm -r build
pnpm --filter jp-address-romaji-data publish
pnpm --filter jp-address-romaji publish
```

`prepublishOnly` rebuilds each package, and the data package additionally verifies that all 47
prefectures and ~1,899 municipality files are present.

## Refreshing the data between releases

The `Refresh address data and coverage` workflow does steps 1–3 on a GitHub runner and uploads the
dataset as an artifact. Use it when the local network cannot reach the upstream host, or to check on
a schedule whether the upstream data has drifted — it runs monthly for that reason.
