# Changelog

## core-0.1.6 — 2026-08-16

`jp-address-romaji` only. The dataset package is unchanged and stays at `0.1.5`.

### Added

- **The library now runs in a browser.** `packages/core` imported `node:fs`, `node:module`,
  `node:path` and `node:url` at module top level, so bundling it for the web failed outright — a
  front-end address form could not use it at all. Those imports now live behind platform bindings
  (`src/platform/`) reachable only from the Node entry point, and the package declares a `browser`
  export condition that resolves to a second entry point. Any bundler that honours export
  conditions (Vite, webpack, esbuild, Rollup, Parcel) picks it up with no configuration, and the
  API is identical:

  ```ts
  import { configureDataSource, toRomaji } from 'jp-address-romaji';

  configureDataSource({ endpoint: 'https://your-site.example/address-data/ja' });
  await toRomaji('東京都新宿区西新宿三丁目5番12号');
  ```

  A page has no filesystem, so the dataset is served from an endpoint you host. The library reads
  `<endpoint>.json` for the prefecture/municipality index and then one
  `<endpoint>/<prefecture>/<municipality>.json` per conversion, so **the prefecture and the
  municipality appear in a request URL on your server**. The block number, building name and
  addressee are matched inside the page and never leave it. That is a weaker guarantee than the
  Node path, where nothing leaves the process at all — the README says so where users will read it,
  and so does the browser entry point's own documentation.

  `configureDataSource({ dataDir })` cannot work in a browser and does not approximate one: it
  leaves the library unconfigured, and conversions return `DATA_NOT_CONFIGURED`.

  Nothing changes for Node consumers. The default entry point, the filesystem dataset, the
  automatic discovery of `jp-address-romaji-data`, and the offline guarantee are all as they were.

- **A browser smoke test that actually runs a browser** (`scripts/browser-smoke.mjs`), in CI on
  every change and blocking before every publish. It packs the tarball, installs it into a scratch
  project, bundles `import 'jp-address-romaji'` for the browser, and drives headless Chromium
  through a conversion, a reverse conversion and a refusal. No Node test can catch the failure it
  exists to catch — a `node:` import back in the shared module graph — because Node resolves one
  happily. It also asserts that the page contacts no origin but its own, and that no address
  component past the municipality ever reaches the server.

## 0.1.5 — 2026-08-14

`0.1.4`'s headline fix did not fix the address it was reported for. This does.

### Fixed

- **A koaza the caller never wrote is no longer added to the output.**
  `toRomaji('宮城県柴田郡川崎町大字小野1-1')` came back from `0.1.4` as
  `"1-1 Azamachi Ono, Kawasaki-machi, Shibata-gun, Miyagi, Japan"` — the `字町` in it appears
  nowhere in the input. The same invented `字町` landed on four other unrelated towns in a
  300-address sample; 8 of those 300 gained a koaza this way.

  The upstream normalizer resolves an address to one specific machi-aza row, and for a town whose
  rows all carry a koaza it picks one whatever the input said. `0.1.4` surfaced that row's koaza
  unconditionally. It is now surfaced only when the input names it, immediately after the town —
  position, not mere presence, because a koaza is often a single common character once its
  `字`/`大字` prefix is stripped, and `字町` otherwise matches the 町 of 川崎町. Same sample after
  the fix: 0 of 300. Writing the koaza still works: `大字小野字赤萩道上1-1` romanizes it.

- **A koaza whose reading stops at its counter is now refused instead of romanized.**
  `toRomaji('長野県飯田市本町三丁目大横1-1')` came back from `0.1.4` as
  `"1-1 3Chome Hommachi, Iida-shi, Nagano, Japan"` — `ok: true`, with `大横` missing from the
  label, and the result does not read back (`fromRomaji` returns `TOWN_NOT_FOUND`). The dataset
  gives `三丁目大横` the reading `３チョウメ`, which never reaches `大横`.

  `0.1.4`'s completeness check only caught truncation before one of seven positional kanji
  (北/南/東/西/上/下/中). `横` is not one of them, so the truncated reading passed and was
  romanized. The check now also refuses a reading that ends at a counter (`丁目`, `条`, `号`,
  `地割`, …) while the name continues past it. Measured on the shipped dataset, that moves 7 more
  rows from romanized to refused: 1,399 of 418,605 named koaza are now refused (0.334%, from
  1,392).

- **The regression test for `0.1.4`'s headline fix was passing against invented data.**
  `fixtures-koaza` gave `三丁目大横` the reading `サンチョウメオオヨコ`, which does not exist in
  the shipped dataset, and added a `南郷通三丁目西`/`３チョウメニシ` row that does not exist
  either. Both were the fixture's positive controls, so the test asserted an output
  (`"1-1 Sanchomeoyoko Hommachi"`) that no real input can produce. The fixture now matches the
  real dataset row for row, the reported address is asserted as a refusal, and the
  romanize-when-complete path is pinned to a real example instead (`兵庫県朝来市生野町口銀谷字愛宕`,
  reading `アザアタゴ`).

## 0.1.4 — 2026-08-14

The headline fix restores address information `toRomaji` was silently discarding. Everything else
under **Fixed** closes gaps outside the core conversion path — data loading, the public API's
auxiliary functions, the entry-point router, and the release pipeline — none of which had been read
end-to-end before this pass.

### Fixed

- **`toRomaji` silently dropped a named koaza (小字), returning a different address.**
  `toRomaji('長野県飯田市本町三丁目大横1-1')` used to return `ok: true` with
  `"1-1 Hommachi, Iida-shi, Nagano, Japan"` — `三丁目大横` gone without a trace. The upstream
  normalizer reports `oaza_cho` and `koaza` as separate fields; only a purely numeric koaza
  (`^([0-9]+)(丁目|番町|…)$`) was ever read, and folded into the block number. Anything else
  vanished. A named koaza is now romanized and returned on the new `parsed.koaza` field whenever the
  dataset's reading can be verified to cover the whole name — the same call now returns
  `"1-1 Sanchomeoyoko Hommachi, Iida-shi, Nagano, Japan"` — and returns the new failure
  `KOAZA_READING_INCOMPLETE` rather than a truncated guess when it cannot. Measured over the whole
  dataset (`scripts/verify-data-assumptions.ts`, assumption 6/6b, GitHub Actions run 31788640706):
  437,014 of 638,567 town rows carry a koaza (68.437%) — 18,409 purely numeric, already handled
  since 0.1.3, and 418,605 named. Of the named ones, every one has a kana reading but only 781
  (0.187%) also carry a dedicated romaji field, and the completeness check passes 417,213 of them
  (99.667%) while refusing 1,392 (0.333%); every sampled refusal has the same shape — 南郷通
  (札幌市白石区)'s koaza `一丁目北`/`十二丁目南`, whose kana reading stops at `チョウメ` and never
  reaches the trailing 北/南. `fromRomaji` does not reconstruct a koaza — there is no per-koaza
  index to search — so this is deliberately one-way: round-tripping a koaza-bearing address returns
  a typed failure rather than a different address, never the koaza silently dropped again.
- `longVowel: 'oh'` municipality output could not be read back by `fromRomaji`. `formatMunicipality`
  oh-izes only the stem and appends the table's suffix literally (`当別町` → `"Tohbetsu-cho"`), but
  the index `fromRomaji` searches oh-ized the whole reading including the suffix (`トウベツチョウ` →
  `"tohbetsuchoh"`), whose trailing `choh` no longer matched the pattern used to strip a suffix — so
  neither candidate-key set ever contained the string `formatMunicipality` actually produces. At
  least 53 municipalities were affected nationwide (当別町, 共和町, 蔵王町, 遠野市, and others).
- A town matched only through its kana reading lost its `romaji` on the parsed result, so
  `toFormat` emitted kanji inside a payload declaring `languageCode: "en"`. The deterministic
  transliteration used to make the match is now kept on `parsed.town.romaji`, for the roughly 10%
  of towns that carry a kana reading but no romaji field.
- 17 entries where the kana reading spells a number as a digit but the romaji field spells the same
  number as a word (前郷一番町, 北兵村一区, and 15 others) used to romanize to a different spelling
  depending on `longVowel` style. Under `'none'` the romaji field wins and nothing changes; under
  `'macron'`, `'circumflex'`, and `'oh'` — which have no source but the kana — that disagreement is
  now a typed failure instead of a guess at which spelling to trust.
- The administrative-suffix reading (町 → *machi* or *cho*, 村 → *mura* or *son*) was guessed from
  the first entry of a lookup table whenever a municipality's own romaji field was missing —
  `出雲崎町` (イズモザキマチ) could render as `"Izumozaki-cho"` when the actual reading is *machi*.
  It now reads the suffix off the end of the kana instead of guessing.
- An unattached prolonged-sound mark (`ー`) — one not following a kana that produces a vowel — was
  silently dropped instead of refused: `kanaToRomaji('ーア', 'none')` returned `"a"`. It now routes
  through the same untranslatable-kana check every other unreadable character already uses, and
  fails the same way they do.
- `kanjiToNumber` (a public export) returned a *different number*, not a refusal, for input outside
  the grammar `numberToKanji` actually produces: `十百` → 110, `一二` → 2. It now returns `undefined`
  for anything outside that grammar; `一〇一` is refused rather than read as 101.
- A malformed `endpoint` passed to `configureDataSource` (for example a filesystem path where a URL
  was expected) made both conversion directions throw `TypeError` — the one place in the library
  where a bad configuration surfaced as an exception instead of a typed failure. It now degrades to
  `DATA_NOT_CONFIGURED`, the same outcome as no dataset being configured at all.
- `parse()` routed any input containing a Japanese character to `toRomaji`, so it could not read
  back the library's own `toRomaji` output when the address carried a Japanese building name —
  `fromRomaji` is the one built to handle that case. It now checks whether the input has the
  comma-separated, ends-in-a-known-prefecture shape a western-order romaji address takes, and routes
  on that instead of on script alone.
- Oh-style prefecture spellings with an administrative suffix (`"Ohsaka-fu"`, `"Tohkyoh-to"`) were
  rejected by `fromRomaji` instead of resolving.
- The reverse-direction (`fromRomaji`) dataset-file cache had no upper bound — a long-running
  process that eventually read across the whole country would retain roughly 1,899 files forever.
  It is now a bounded LRU cache (500 entries by default).

### Added

- `ParsedAddress.koaza` — the resolved koaza component, present when the address has one and its
  reading was verifiably complete.
- The `KOAZA_READING_INCOMPLETE` failure reason.

### Changed

Every item below turns a previously succeeding call into a typed failure, or changes a rendered
string — check the ones that apply to you:

- **`toRomaji` output changes for any address with a named koaza.** Previously the koaza was
  silently omitted from both `formatted` and `parsed`; it is now present in both, or the call fails
  with `KOAZA_READING_INCOMPLETE`. If you stored or matched against `formatted` strings for
  koaza-bearing addresses, expect them to be longer and to include the koaza.
- **Some `toRomaji` calls for koaza-bearing addresses that used to return `ok: true` now return
  `KOAZA_READING_INCOMPLETE`.** This is 1,392 of the 418,605 named-koaza rows (0.333%) — every one
  previously silently dropped the koaza rather than including it, so this trades a wrong address for
  an explicit refusal.
- **`toRomaji` under `longVowel: 'macron'` / `'circumflex'` / `'oh'` now fails for 17 town names**
  where the kana and romaji fields disagree on whether a number is a digit or a word.
  `longVowel: 'none'` output for the same towns is unchanged.
- **`fromRomaji` now accepts `"Tohbetsu-cho, Hokkaido"` and the same shape for at least 53 other
  municipalities**, and now accepts oh-style prefecture spellings with their administrative suffix
  (`"Ohsaka-fu"`, `"Tohkyoh-to"`) — both used to fail with `CITY_NOT_FOUND` /
  `PREFECTURE_NOT_FOUND`.
- **`toFormat` output for towns matched only via a kana reading no longer mixes kanji into a
  payload declaring `languageCode: "en"`.** `parsed.town.romaji` is now populated wherever the match
  had a transliteration to offer.
- **`configureDataSource({ endpoint: <malformed value> })` no longer throws.** Both `toRomaji` and
  `fromRomaji` now return `DATA_NOT_CONFIGURED` instead of an uncaught `TypeError`.
- **`kanjiToNumber` returns `undefined`, not a wrong number, for input outside `numberToKanji`'s
  grammar.** Code that relied on an out-of-grammar result like `十百` → 110 gets `undefined` now;
  check for it explicitly.
- **`parse()` can now read back `toRomaji`'s own output when it includes a Japanese building
  name.** That case previously routed to `toRomaji` and failed.

### Internal

- `release.yml` interpolated a free-string `workflow_dispatch` input directly into a shell script,
  in the one job holding `id-token: write`. It now goes through `env:`, matching how the rest of the
  file's free-string inputs are already handled.

## 0.1.3 — 2026-08-13

A correctness release. Every item under **Fixed** was a case where a conversion returned
`ok: true` and a **different address than the one you asked about** — the one outcome this
library exists to prevent. All of them were present in `0.1.0` through `0.1.2`. If you printed
labels or filed forms with an earlier version, the **Changed** section tells you which outputs
move.

### Fixed

- `fromRomaji` resolved a municipality to a **different municipality** when the two romanize
  alike. `"Fuchu-cho, Hiroshima"` returned 広島県**府中市** rather than 安芸郡**府中町**;
  `"Shimanto-cho, Kochi"` returned 四万十**市**, `"Echizen-cho, Fukui"` returned 越前**市**.
  Two faults combined: the *query* was stemmed before matching, so `Fuchu-cho` also hit
  `Fuchu-shi` through the shared stem `fuchu`, and the first matching record in dataset order
  won outright — there was no ambiguity check at the municipality level at all. Matching now
  collects every hit, prefers an exact spelling over a stemmed one, and returns `AMBIGUOUS`
  with candidates when more than one survives. A national sweep over all 1,898 municipalities
  found 13 that resolved to the wrong one; it now finds none.
- Where a town has both plain rows and chome rows, `fromRomaji` silently read the leading number
  as a chome. `"2-5 Kitanosawa, Minami-ku, Sapporo-shi"` returned 北ノ沢**二丁目**5 even though
  北ノ沢 also exists undivided, where the same input means 北ノ沢 2-5. Both readings are real,
  so the result is now `AMBIGUOUS` carrying both. 2,027 town names (9,896 rows, 1.55% of the
  dataset) have this shape.
- `toRomaji` dropped the leading block number in towns whose koaza are bare numbers.
  `青笹町青笹2-3` came back as `"3 Aozasacho Aozasa"` — the `2` vanished — while `青笹町青笹2番3号`
  was correct. The upstream normalizer had consumed the `2` as the koaza candidate `２地割`, and
  nothing read `machiAza.koaza` back. 464 town names across 18,409 koaza rows are affected,
  concentrated in the 地割 areas of Iwate and the 号 areas of Fukui.
- Postal-code extraction had no digit boundary, in both directions. A phone number in a building
  name (`TEL03-1234-5678`) was mined for a postal code, truncating the building name with it, and
  a four-digit block number (`西新宿1123-4567`) was split into a postal code plus chome 1.
- The long-vowel styles skipped the transliteration check that the default style applies, so a
  reading the library refuses as untranslatable under `longVowel: 'none'` was rendered anyway
  under `'macron'`, `'circumflex'` and `'oh'` — the strict option was the lenient one.

### Changed

Four groups of output move, in different directions, so check the ones that apply to you:

- **Some conversions that returned `ok` now return `AMBIGUOUS`.** These are inputs that genuinely
  have more than one reading, and the candidates come back with the failure so you can choose.
  Three sources:
  - Municipality names that romanize identically. Of the 13 municipalities that used to resolve to
    the wrong one, 11 now resolve correctly; the remaining two pairs are indistinguishable —
    江差町/枝幸町 (both `Esashi-cho`) and 古宇郡泊村/国後郡泊村 (both `Tomari-mura`).
    **Adding the county** (`"…, Fuchu-cho, Aki-gun, Hiroshima"`) resolves these.
  - Bare `"<number>-<number> <Town>"` in the 2,027 towns that exist both with and without chome.
    **There is nothing you can add to the string to disambiguate these** — `fromRomaji` reads a
    leading number as a chome and has no literal chome syntax, and a postal code cannot help
    because both candidates are the same town. Pick from `candidates` instead. Note this means
    **the library can no longer read back its own output** for these towns: `toRomaji` renders
    北ノ沢二丁目5 and 北ノ沢2-5 identically as `"2-5 Kitanosawa"`.
  - One town pair reachable only because digits are now accepted (below): 東神楽町's
    `ひじり野南一条` and `ひじりの南一条`, whose readings are identical.
- **Some conversions that were refused now succeed.** `isTransliterableKana` now accepts digits,
  because in the v2 dataset a digit inside a reading is part of the name (`キタ１０ジョウニシ` →
  `Kita10Jonishi`), not an untranslatable character. 5,576 entries that carry only a kana reading
  now convert instead of returning `NO_ROMAJI_DATA`. Four entries whose readings contain
  full-width hyphens or Latin letters are still refused, under every style.
- **Some conversions that returned `ok` now return `CITY_NOT_FOUND`.** A suffix naming the wrong
  *kind* of administrative unit no longer resolves: `"Hakodate-machi"` for 函館**市** used to
  return 函館市 and now fails. Suffixes that are a plausible reading of the same kanji still work
  (`-cho` and `-machi` are both readings of 町), and the library's own output is unaffected — it
  always writes the right one.
- **Some conversions return a different, correct string.** The koaza fix above restores a block
  number that used to be dropped: `青笹町青笹2-3` now romanizes as `"2-3 Aozasacho Aozasa"`,
  not `"3 Aozasacho Aozasa"`.

Measured over the whole dataset, on the shipped 0.1.2 versus this release:

| Sweep | 0.1.2 | 0.1.3 |
| --- | --- | --- |
| All 1,898 municipalities, written the way the dataset spells them | 1,885 correct, **13 wrong** | 1,894 correct, 4 `AMBIGUOUS`, **0 wrong** |
| 4,152 wrong-but-plausible suffix spellings | 4,117 correct, **35 wrong** | 4,121 correct, 31 `AMBIGUOUS`, **0 wrong** |
| 23,486 addresses, ja → romaji → ja | — | **0 came back as a different address** |

`AMBIGUOUS` candidates from the municipality level now carry `blockNumbers` and `unparsed`, as the
town-level ones already did — picking a candidate no longer silently loses the block number and
the building name.

The ambiguity figures quoted in the README and in `fromRomaji`'s API docs were re-measured against
the shipped dataset after the digit change and are now 1.07% of indexed keys and 0.67% of
full-form keys, from 1.10% and 0.69%. The claim that a town's romanization is unique within a
known municipality "98.9% of the time" is gone: it could not be derived from
`scripts/measure-ambiguity.ts` by any method, and is replaced by 97.99%, which can.

### Internal

- The release workflow's CHANGELOG guard could not fail. `echo "$section" | grep -qi 'unreleased'`
  dies of SIGPIPE under `pipefail` exactly when `grep` matches, so a section still marked
  `unreleased` passed the check — silently, once the section outgrew the 64 KB pipe buffer. This
  is the third bug of this family in this file.
- Scoped release tags now require a scoped CHANGELOG heading (`## data-1.2.3` for `data-v1.2.3`).
  With one shared CHANGELOG and unscoped headings, a `core-v0.2.0` release could have passed the
  guard on a `## 0.2.0` section written for the data package, and shipped its notes.
- Prereleases are now created as GitHub prereleases, deriving the flag the same way the npm
  publish steps already derive the `next` dist-tag.
- The job that holds `id-token: write` no longer runs unpinned code: `@arethetypeswrong/cli` is a
  pinned devDependency invoked through `pnpm exec`, `npm` is installed at a fixed version rather
  than `@latest`, and `pnpm/action-setup` is pinned to a commit SHA.

## 0.1.2 — 2026-08-12

### Fixed

- A single transient download failure no longer fails the whole dataset build. The build fetches
  ~1,899 municipality files with eight requests in flight; each one already retried three times,
  but those retries happen within a few seconds while seven sibling requests compete, so one
  unlucky municipality set `process.exitCode = 1` and took the release with it. Failures of the
  concurrent pass are now retried afterwards **one at a time** with a longer backoff, and only
  what survives that sweep fails the build — named individually rather than merely counted.
- `--concurrency` no longer accepts a value that is not a positive integer. A non-numeric one
  reached the worker pool as `NaN` and a zero reached it as zero; both start no workers, so the
  build downloaded nothing, printed "Done. 0 towns", and **exited 0** — a silently empty dataset
  reported as a success. `--attempts` and `--retry-delay` (both new) are validated the same way,
  and the build now also refuses to exit 0 unless it wrote one file per municipality.

### Added

- `packages/data/test/build-data.test.ts` — the dataset builder had no tests at all. It runs the
  real script as a subprocess against a local fixture server with an injectable failure policy,
  covering a clean run, a municipality recovered by the sweep, and one that never recovers.

## 0.1.1 — 2026-08-12

### Fixed

- The two conflicting ambiguity figures (0.95% and 1.23%) are both gone: neither reproduced
  against the shipped dataset with the shipping matcher, and a method matrix found no variant
  that yields them — they belonged to earlier versions of the key logic. All sites now quote
  values measured by the new `scripts/measure-ambiguity.ts` on `jp-address-romaji-data@0.1.0`,
  using the matcher's own exported `candidateKeys`: 1.10% of indexed romanization keys collide
  within a municipality (2,778/252,587; 4,869 towns), 0.69% of full-form keys (1,404/204,671;
  2,620 towns). The KEN_ALL trade-off in the README and CLAUDE.md now cites the 0.69% figure,
  and "unique within a known municipality" is 98.9%, not 99.05%.

- The README's coverage paragraph called coverage "effectively uniform" while
  quoting a 15-point spread in the same sentence, and claimed every prefecture
  was at 100% on chome entries. Re-measured against the committed
  `docs/coverage.md`: 21 of the 47 prefectures are at 99.9% or better, 6 are
  below 95% and 2 below 90%, and Hokkaido is at 99.96% on chome entries rather
  than 100.00%. Both statements are now the measured ones.
- The `fromRomaji` API heading omitted the options parameter that its own
  example twenty lines below passes (`postalCodeIndex`). The signature in the
  source is `fromRomaji(romajiAddress, options?)`.
- `pnpm coverage:measure` was presented as something a reader could run
  against "your dataset version". It is a repository script, not part of the
  published package, and needs a clone plus a built dataset.

### Changed

- `packages/core/README.md` — the page npm actually shows — carried no badges
  and never said the package is ESM-only, so the compatibility wall that the
  repository README puts next to its install command was missing from the
  surface most readers see first. It now has a Requirements section covering
  ESM-only, Node 18+/Node-only, the separate data package, and the 0.x
  maintenance posture, plus the "what it does not guarantee" paragraph.
  `packages/data/README.md` gained the same badges and a pointer.
- Both repository READMEs reordered so that requirements, coverage, the
  unsupported cases and the disclaimer come *before* the API reference.
- Added `scripts/assert-npm-version.sh` and a second npm-version assertion
  immediately before publishing, matching the sibling repositories. Nothing
  in this workflow re-runs `actions/setup-node` today, so it is a guard
  against that changing rather than a fix for a live defect.

## 0.1.0 — 2026-08-10

First release.

### `jp-address-romaji`

- `toRomaji(address, options?)` — Japanese address to romanized, western-order address. Options for
  long-vowel style (`none` / `macron` / `circumflex` / `oh`), word order, country suffix, postal-code
  placement, capitalization, and whether the building name is rendered.
- `fromRomaji(address, options?)` — the reverse. Resolves outside-in (prefecture, municipality,
  town) and returns `AMBIGUOUS` with candidates rather than picking one. An optional
  `postalCodeIndex` hook lets a caller's own postal data narrow an ambiguity; no postal dataset is
  bundled.
- `parse(address)` — detects the script and returns a structured address either way.
- `toFormat(parsed, target)` — Google libaddressinput, Shopify and Stripe address shapes.
- Failures are returned as typed values, never thrown, so callers are forced to handle them.
- Runs entirely offline. The upstream normalizer defaults to a hosted API; this package always
  points it at a local directory and fails with `DATA_NOT_CONFIGURED` rather than falling back to
  the network. Enforced by a test that replaces `fetch` with a throwing stub.

### `jp-address-romaji-data`

- The offline dataset: 638,567 town entries across 1,898 municipalities.
- `build` CLI to regenerate or refresh it from upstream.
- Town-level coordinates and street-level records are excluded; see the package README for why.

### Notes on the data

Coverage is 99.55% nationally and 99.99% for chome-bearing urban addresses. Romaji and kana do not
go missing together: 89.51% of entries carry a romaji field but 99.55% carry a kana reading, so
roughly one entry in ten is romanized by transliterating its kana.

Kyoto street-name addresses (`烏丸通四条上ル笋町`) are supported. The street phrase is separated
before normalization — mandatory, since street names carry the same kanji numerals as chome and the
normalizer otherwise reads `四条` as chome 4 — and preserved verbatim on `parsed.kyotoStreet`. It is
not romanized, because the dataset has no readings for street names.

Not supported, each an explicit failure rather than a wrong answer: geocoding accuracy and
building-name translation. `fromRomaji` reads western order only.

## 0.1.0-rc.1 — 2026-08-10

Release candidate, published under the `next` dist-tag to exercise the parts of the release that a
dry run cannot reach: `npm publish` itself, the provenance attestation, and the GitHub Release.
Identical in content to 0.1.0 above.

It found three things, which is why it was worth spending a version on:

- `NPM_TOKEN` has to be created with npm's **Bypass two-factor authentication (2FA)** checkbox
  ticked. Without it every publish fails with `EOTP`, and no dry run can detect that because dry
  runs never reach `npm publish`.
- **The first version ever published to a name becomes `latest` regardless of `--tag`.** The
  registry has to point `latest` somewhere. So for a brand-new package an rc does not protect
  `npm install <pkg>` — only shipping the real version does, which is why 0.1.0 followed the same
  day.
- `jp-address-romaji`'s optional peer range on `jp-address-romaji-data` was `^0.1.0`, which a
  prerelease does not satisfy, so the two rc packages could not be installed together at all. The
  range is `^0.1.0-0` from 0.1.0 onwards.
