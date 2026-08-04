# jp-address-romaji — working notes

Bidirectional Japanese ⇄ romaji address conversion, published to npm as two packages:
`jp-address-romaji` (library) and `jp-address-romaji-data` (offline dataset).

## The two rules everything else follows from

1. **Never reinvent address normalization.** It is delegated entirely to
   `@geolonia/normalize-japanese-addresses`. Full-width digits, kanji numerals, `丁目/番/号` vs
   hyphens, omitted prefectures and character variants are all its job. This package is the layer
   above: romanization, word order, reverse lookup, output formats.

2. **Never guess a reading.** Romaji comes from the dataset — its romaji field, or its kana reading
   transliterated deterministically. When neither exists, return an explicit typed failure. Failures
   are values, not exceptions, so callers must handle them. A wrong shipping label is worse than a
   refused one.

## Landmines — each of these was a real bug

- **`point` is mandatory on prefecture and city records, forbidden on town records.** Upstream's
  `prefectureToResultPoint`/`cityToResultPoint` index into `point` with no null check and throw
  without it; only `machiAzaToResultPoint` guards it. Town points are dropped purely for size (~190k
  records) — this library makes no geocoding claim. Do not "optimize" the first two away.

- **Never strip a trailing digit from town romaji.** In v2 the chome has its own field, so a trailing
  digit belongs to the name: `政和第一` → `"Seiwadai1"`, `四重麦四` → `"Yoemugi4"`. An earlier version
  stripped it (correct for v1 data) and silently truncated those names.

- **`isPlausibleReading` must strip `大字`/`字` from the kana as well as the kanji.** v2 spells the
  prefix out in the reading (`大字三泊村` → `オオアザサンドマリムラ`). Stripping one side only made it
  flag 23,193 entries — 3.65% of everything with a reading — as corrupt, all false positives, all
  ordinary rural addresses the library then refused.

- **The Kyoto street phrase must be split off *before* normalization.** Street names carry the same
  kanji numerals as chome, so `烏丸通四条上ル笋町` fed in unchanged is read as chome 4 of an unrelated
  town. See `packages/core/src/kyoto.ts`.

- **The offline guarantee is enforced, not asserted.** The upstream normalizer defaults to a hosted
  API. Tests replace `globalThis.fetch` with a throwing stub; if a conversion ever reaches the
  network, CI fails. Never add a network fallback.

## Data

The shipped dataset is Geolonia **v2** (638,567 town entries, 1,899 municipalities, ~12 MB zipped).
Coverage is 99.55% nationally, 99.99% for chome-bearing urban addresses.

Two facts that are easy to get backwards:

- **Romaji and kana do not go missing together.** 89.51% have a romaji field, 99.55% have kana — so
  ~1 entry in 10 is romanized by transliterating kana. That path is load-bearing.
- **The older v1 data is a different animal** (85% coverage, 3.6% for `大字`-prefixed, 2.5% corrupt
  romaji). The test fixtures are v1-derived and deliberately sparse, which is why they still exercise
  the refusal paths. Do not "fix" their coverage.

`packages/data/data/` is generated, never committed. `prepublishOnly` refuses to publish without it.

## Environment

- **`japanese-addresses-v2.geoloniamaps.com` is blocked** from Claude Code cloud sessions by the
  egress policy, as are ABR, digital.go.jp, Japan Post, and Actions artifact blob storage. To touch
  real data, run the **`Refresh address data and coverage`** workflow — GitHub runners have
  unrestricted egress — and read its logs and step summary.
- **pnpm version lives only in root `package.json` `packageManager`.** Setting it in
  `pnpm/action-setup` too makes the action refuse to run.

## Commands

```sh
pnpm test                                   # fixtures only; hermetic
JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test   # + real-data integration suite
pnpm -r typecheck && pnpm -r build
npx tsx packages/data/src/build-data.ts --out ./address-data
npx tsx scripts/verify-data-assumptions.ts --data ./address-data   # read the output
npx tsx scripts/measure-coverage.ts --data ./address-data > docs/coverage.md
```

`scripts/verify-data-assumptions.ts` is the check that caught the two landmines above. Every entry it
lists under reading-plausibility is an address the library will refuse — read them, don't skim.

Release procedure: `docs/releasing.md`.
