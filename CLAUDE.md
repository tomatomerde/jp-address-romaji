# jp-address-romaji について（技術メモ）

このファイルはプロジェクトの技術的事実（目的・壊してはいけない価値・データ出典・地雷・
コマンド）をまとめたもの。人間の貢献者向けの不変条件は `CONTRIBUTING.md` にもある。

## 目的

Bidirectional Japanese ⇄ romaji address conversion, published to npm as two packages:
`jp-address-romaji` (library) and `jp-address-romaji-data` (offline dataset). Addresses are
personal data, so the library sends them nowhere: no hosted API, no signup, and by default it
reads a local copy of the address dataset and makes no network requests at conversion time. Runs on
Node.js 18+; browser use requires supplying data through an endpoint you host yourself.

## 差別化点（＝壊してはいけない価値）

- **Never reinvent address normalization.** It is delegated entirely to
  `@geolonia/normalize-japanese-addresses`. Full-width digits, kanji numerals, `丁目/番/号` vs
  hyphens, omitted prefectures and character variants are all its job. This package is the layer
  above: romanization, word order, reverse lookup, output formats.
- **Never guess a reading.** Romaji comes from the dataset — its romaji field, or its kana reading
  transliterated deterministically. When neither exists, return an explicit typed failure. Failures
  are values, not exceptions, so callers must handle them. A wrong shipping label is worse than a
  refused one.
- **The offline guarantee is enforced, not just documented.** The upstream normalizer defaults to a
  hosted API; this package always points it at a local directory and fails with
  `DATA_NOT_CONFIGURED` rather than falling back to the network. A test replaces `globalThis.fetch`
  with a throwing stub, so a regression that reaches the network fails CI (see Landmines below).
- **`fromRomaji` resolves strictly outside-in** (prefecture → municipality → town) and, when a
  romanization matches more than one real town, returns `AMBIGUOUS` **with the candidates** rather
  than guessing among them.
- **Kyoto street-name addresses are supported without inventing a romanization for the street
  phrase.** It is split off before normalization (see Landmines) and preserved verbatim on
  `parsed.kyotoStreet` — never romanized, never fed back through `fromRomaji`.

## データ出典

- Source: the Japanese Digital Agency's **Address Base Registry**
  (アドレス・ベース・レジストリ, <https://www.digital.go.jp/policies/base_registry_address>),
  published under terms permitting free use including commercial use. Verify the current terms
  before redistributing a generated dataset.
- Processed and served by **Geolonia**: `@geolonia/japanese-addresses-v2` (the data) and
  `@geolonia/normalize-japanese-addresses` (normalization), both MIT licensed. Full attribution is
  in `packages/data/ATTRIBUTION.md`.
- The dataset is fetched from Geolonia **once**, at build/refresh time
  (`jp-address-romaji-data build` / `packages/data/src/build-data.ts`), then read locally
  thereafter. Converting addresses never touches the network — see the offline guarantee above and
  in Landmines.

## 非対応範囲

- **Geocoding accuracy.** Coordinates are deliberately excluded from the bundled town data (see
  Landmines: `point`, below) — this library makes no geocoding claim.
- **Building-name or room-number translation.** These are isolated as `unparsed` and passed through
  untouched; the type has no `romaji` field for them, by design.
- **Romanizing the Kyoto street phrase.** It is preserved verbatim, not translated — the dataset has
  no readings for street names, and guessing one is exactly what this library refuses to do.
- **`fromRomaji` accepts western order only** (prefecture last). Output produced with
  `order: 'japanese'` is for display; feeding it back in is rejected with `PREFECTURE_NOT_FOUND`.
- **No bundled postal-code dataset.** `postalCodeIndex` is a hook for the caller's own data; Japan
  Post's `KEN_ALL` is not shipped (a second data source with its own licence and update cadence
  wasn't justified by the 0.69% of full-form-key ambiguity it would resolve — measured by
  `scripts/measure-ambiguity.ts`).
- **Browser use without a hosted data endpoint.** The default configuration reads the dataset from
  the filesystem, so it is Node-only out of the box.

## パッケージング: ESM 専用

- 両パッケージ（`jp-address-romaji` / `jp-address-romaji-data`）は **ESM 専用**として出す方針が
  決定済み: `package.json` は `"type": "module"`、`exports` の各エントリに `require` 条件がない。
- したがってリリース前チェックの通例である「ビルド成果物から実際に `require()` と `import` の
  両方で読み込めること」は、このプロジェクトには**適用されない**。代わりに次で代替する:
  - `npx @arethetypeswrong/cli <tarball> --profile esm-only` で ESM 解決が緑になること
  - `npm pack --dry-run` で公開ファイル一覧を目視する
- CJS 対応は今回のスコープ外であり、将来の課題として残す。技術的には可能: 上流の
  `@geolonia/normalize-japanese-addresses` は CJS/ESM 両対応。

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

- **`japanese-addresses-v2.geoloniamaps.com` may be unreachable** from a restricted development
  environment, as may ABR, digital.go.jp, Japan Post, and Actions artifact blob storage. To touch
  real data from one, run the **`Refresh address data and coverage`** workflow — GitHub runners
  reach all of them — and read its logs and step summary.
- **pnpm version lives only in root `package.json` `packageManager`.** Setting it in
  `pnpm/action-setup` too makes the action refuse to run.

## Commands

```sh
pnpm test                                   # fixtures only; hermetic
JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test   # + real-data integration suite
pnpm typecheck && pnpm -r build             # -r だけでは test/scripts/vitest.config.ts が型検査されない
npx tsx packages/data/src/build-data.ts --out ./address-data
npx tsx scripts/verify-data-assumptions.ts --data ./address-data   # read the output
npx tsx scripts/measure-coverage.ts --data ./address-data > docs/coverage.md
```

`scripts/verify-data-assumptions.ts` is the check that caught the two landmines above. Every entry it
lists under reading-plausibility is an address the library will refuse — read them, don't skim.

Release procedure: `docs/releasing.md`.

## 引き継ぎ文書の場所

セッション間の申し送りは **`docs/project-status.md`** が担う。`NOTES.md` は存在しない。
中断・引き継ぎのときは `docs/project-status.md` を書き換えること。二重管理を避けるため、
`NOTES.md` を新設しないこと。公開リポジトリなので、外部の読者が読んで意味が通り、
**かつ不快でない**書き方にすること。

履歴についての経緯: 公開前の整理で個人情報を含むコミットを除去するため、このリポジトリは
2026-08-07 に作り直されている（`refs/pull/*/head` が残るため force push では消えない）。
セッションは履歴の書き換えを行わないこと。履歴中の `#N` は旧リポジトリの番号で、
このリポジトリの PR を指さない。
