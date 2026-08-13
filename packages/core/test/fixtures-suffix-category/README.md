# Suffix-category regression fixtures

A separate fixture dataset (same file layout as `../fixtures/data`), kept
apart from it for the same reason as the other dedicated fixtures in this
directory: `../fixtures/data` is intentionally sparse v1-derived data used to
exercise refusal paths, and CLAUDE.md asks that its coverage not be "fixed".

These two real wards reproduce a bug in `matchesMunicipality`/`segmentQuality`:
stemming a query's administrative suffix (`stemKey`) strips ANY of
`shi/ku/cho/chou/machi/mura/son/gun/city/ward`, regardless of what kind of
unit — city, ward, town, village, or county — the record being compared
against actually is. A query with the wrong KIND of suffix could still
produce a "stem" match as long as the stems happened to coincide once each
side's own suffix was stripped:

- `"Nakamura, Nagoya-shi, Aichi"` (village-style `-mura`, stem "naka")
  resolved as `AMBIGUOUS` between 中村区 (`Nakamura-ku`, the town's real
  reading) and 中区 (`Naka-ku`, wrong — its own stem is coincidentally also
  "naka").
- `"Naka-gun, Nagoya-shi, Aichi"` (county-style `-gun`, which no city ward
  can genuinely be read as) resolved to 名古屋市中区 outright — writing 区 as
  if it were 郡 was silently accepted.

The fix checks that the suffix token stripped off the query names the same
KIND of unit (市/区/町/村/郡) as the record's own suffix kanji before
accepting a stem match — see `SUFFIX_TOKEN_KANJI` in `fromRomaji.ts`. It does
not require the SPECIFIC reading to match (a 町 can genuinely be "-cho" or
"-machi"); see `fromRomaji.test.ts`'s existing Izumozaki-machi case (general
fixture data) for that leniency staying intact, and
`municipalityAmbiguity.test.ts`'s Fuchu-cho/Fuchu-shi case for the
already-existing exact-vs-stem tiebreaker this fix does not change.

One real municipality from the published Geolonia v2 dataset:

| Prefecture | City | Wards | What it tests |
| --- | --- | --- | --- |
| 愛知県 | 名古屋市 | 中村区 (`Nakamura-ku`) and 中区 (`Naka-ku`) | A query suffix that names the wrong KIND of unit (`-mura`, `-gun`) must not produce a stem match against a 区, even when the stems happen to coincide. |

`ja.json` is a trimmed copy of the real `ja.json` (only 愛知県, only the two
名古屋市 wards above; the real file has 16 名古屋市 wards).

Regenerating: extract the 愛知県 `pref`/`cities` entry from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed to the 中村区/中区 records.
