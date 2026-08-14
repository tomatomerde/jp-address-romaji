# Changelog

## 0.1.4 — 2026-08-14

Two more cases where the library broke its own round-trip promise, both present since `0.1.0`
and both found by sweeping the whole dataset rather than by reading code. One is fixed; the
other is now refused, because fixing it properly needs an API change this release does not make.

### Fixed

- **`fromRomaji` could not read back what `toRomaji` wrote in `longVowel: 'oh'` style.**
  `toRomaji('北海道石狩郡当別町錦町1-1', { longVowel: 'oh' })` produces
  `"1-1 Nishikimachi, Tohbetsu-cho, Ishikari-gun, Hokkaidoh, Japan"`, and feeding that back
  returned `CITY_NOT_FOUND`. `formatMunicipality` romanizes the stem alone in the requested style
  and appends the suffix's literal reading (`Tohbetsu` + `-cho`), while the reverse index only
  held the whole reading transliterated as one word (`tohbetsuchoh`), which the suffix stripper
  cannot take apart. **71 municipalities** were unreachable this way. The same split also fixes a
  second shape the whole-word key got wrong: a moraic ン on the stem/suffix boundary assimilated
  across it (`長南町` → `...nammachi`) where the split rendering does not (`Chohnan-machi`).
  `macron` and `circumflex` were unaffected — only `oh` alters the suffix as well as the stem.

### Changed

- **A named koaza (小字) is now refused instead of silently dropped.**
  `toRomaji('長野県飯田市本町三丁目大横1-1')` used to return
  `"1-1 Hommachi, Iida-shi, Nagano, Japan"` — with both the chome and the koaza `三丁目大横` gone.
  Since 本町 also has ordinary chome rows, that string reads back as 本町一丁目1: **a different,
  real address one town over.** It was the only silent mismatch left in a 23,486-address national
  round-trip.

  The koaza cannot be recovered into the output: `ParsedAddress` has no field for one, and
  folding it into the town name would produce a string `fromRomaji` can never match, since it
  only ever compares a town against its `oaza_cho` fields. So the conversion now fails with
  `NO_ROMAJI_DATA`, carrying the full name on `partial.town` (`本町三丁目大横`) and a message
  explaining why. A wrong label is worse than a refused one.

  **This only fires when the input names a koaza, immediately after the town.** 65.5% of dataset
  rows carry a named koaza, and the upstream normalizer resolves to one of those rows even for an
  address that mentions no koaza at all — so "the dataset row has a koaza" is not the test.
  `北海道札幌市白石区南郷通1-1` (row koaza `一丁目北`) and `宮城県柴田郡川崎町大字小野1-1` (row
  koaza `字町`) convert exactly as they did in `0.1.3`; add the koaza to either and the same
  address is refused. Position is checked, not mere presence: matching `字町` anywhere in the
  string finds the 町 of 川崎町 and refuses an ordinary address. Measured on the real dataset,
  sampling 400 koaza-bearing towns written without their koaza: zero change.

  The numeric koaza handled in `0.1.3` (`青笹町青笹2-3`, where the digit becomes a block number)
  is unchanged. Giving koaza a real home in the output is left for a release that can change the
  API.

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
