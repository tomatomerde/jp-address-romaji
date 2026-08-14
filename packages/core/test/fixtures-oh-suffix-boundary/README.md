# `longVowel: 'oh'` stem/suffix boundary fixtures

A separate fixture dataset (same file layout as `../fixtures/data`), kept
apart from it for the same reason as the other dedicated fixtures in this
directory: `../fixtures/data` is intentionally sparse v1-derived data used to
exercise refusal paths, and CLAUDE.md asks that its coverage not be "fixed".
No town-level files are needed here — both regression cases stop at level 2
(municipality resolved, no town given), which `fromRomaji` returns before it
ever loads town data.

These two real municipalities reproduce a bug where `fromRomaji` could not
read back its own `longVowel: 'oh'` output for a municipality name:
`formatMunicipality` (`romaji/format.ts`) romanizes the STEM alone in the
requested style and appends the administrative suffix's literal reading from
`SUFFIXES` — it never applies `'oh'` to the suffix itself. `candidateKeys` /
`exactKeys` (`fromRomaji.ts`) used to only index the WHOLE kana reading
(stem + suffix) transliterated together, which is a different string
whenever the split and the whole-word renderings diverge:

- **石狩郡当別町** (`Tobetsu-cho`/`Tōbetsu-chō`) — the suffix `町` itself has
  a long vowel (チョウ). `formatMunicipality(..., 'oh')` emits the literal
  `"Tohbetsu-cho"`, but transliterating the whole reading `トウベツチョウ` as
  one word in `'oh'` style produces `"Tohbetsuchoh"` — the suffix reads
  `"choh"`, not `"cho"`, so `stemKey`'s literal `cho`/`machi`/... patterns
  can no longer strip it back off, and the query normalizes to a key nothing
  in the candidate set has. `fromRomaji('Tohbetsu-cho, Hokkaido')` returned
  `CITY_NOT_FOUND` before the fix. (This is the case from the bug report;
  measured against the full national dataset it is not an isolated example —
  71 municipalities nationwide shared the same failure, all "町" read
  `"-cho"` with a long vowel inside the stem too.)

- **長生郡長南町** (`Chonan-machi`/`Chōnan-machi`) — a different divergence:
  the suffix `-machi` has no long vowel, but a moraic ン sits right at the
  stem/suffix boundary (チョウナン + マチ). Transliterated as one continuous
  word, passport Hepburn's nasal-assimilation rule (`n` before `b`/`m`/`p` →
  `m`) fires across that boundary and produces `"...nammachi"`.
  `formatMunicipality` romanizes the stem in isolation — with no following
  syllable for the assimilation rule to see — so it renders plain `n`
  (`"Chohnan-machi"`, matching what it emits at every other `longVowel`
  style too: `"Chonan-machi"`, `"Chōnan-machi"`). Nothing in the old
  candidate set carried that un-assimilated stem spelling, so this failed
  the same way even though its suffix has no long vowel at all — the
  boundary issue is independent of the suffix-long-vowel one above and
  needs covering separately.

The fix (`ohSplitKey` in `fromRomaji.ts`) reconstructs the same split
stem/suffix key `formatMunicipality` itself would produce, using the same
`splitAdministrativeSuffix` + `romanizeStem` building blocks, and adds it to
both `candidateKeys` and `exactKeys`.

| Prefecture | City | What it tests |
| --- | --- | --- |
| 北海道 | 石狩郡当別町 (`Tobetsu-cho`) | Suffix `町` itself has a long vowel (`chō` → `"choh"` as one word, but the literal suffix is always `"-cho"`). |
| 千葉県 | 長生郡長南町 (`Chonan-machi`) | Nasal assimilation (`n`→`m`) at the stem/suffix boundary only fires in the whole-word transliteration, never in the split rendering. |

Both records are real, taken from the published Geolonia v2 national
dataset (fetched via this repository's `Refresh address data and coverage`
workflow, since the dataset host is unreachable from this environment).

Regenerating: extract the 北海道 and 千葉県 `pref`/`cities` entries from a
real built dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed to the 当別町 and
長南町 records shown above.
