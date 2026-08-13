# Municipality-collision regression fixtures

A second, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it deliberately: `../fixtures/data` is intentionally sparse
v1-derived data used to exercise refusal paths, and CLAUDE.md asks that its
coverage not be "fixed". These records exist only to reproduce a real bug in
`matchMunicipality`/`matchesMunicipality` (jp-address-romaji 0.1.2): a query
that gave only a municipality's own suffix-bearing name, with no county or
ward to disambiguate, could resolve to an unrelated municipality in the same
prefecture whose name happens to share a stem once "-shi"/"-cho"/"-machi"/etc.
is stripped.

Three real name collisions from the published Geolonia v2 dataset, chosen so
that fixing the bug is testable without needing the full ~12MB real dataset:

| Prefecture | Colliding municipalities | What it tests |
| --- | --- | --- |
| 広島県 | 府中市 (`Fuchu-shi`) / 安芸郡府中町 (`Fuchu-cho`) | An exact-reading match must win over one that only exists after stemming both names down to `fuchu`. |
| 北海道 | 檜山郡江差町 / 枝幸郡枝幸町 (both romanize to `Esashi-cho`, verbatim) | A true collision — even after preferring exact matches, two remain, so this must resolve as `AMBIGUOUS`, not silently pick one. |
| 高知県 | 四万十市 (`Shimanto-shi`) / 高岡郡四万十町 (`Shimanto-cho`), both containing a `中村` town | End-to-end reproduction of the reported bug (`1-1 Nakamura, Shimanto-cho, Kochi` resolving into the wrong municipality), not just the municipality-matching unit behaviour. |

`ja.json` is a trimmed copy of the real `ja.json` (only these three
prefectures, only these two cities per prefecture) with each prefecture's
`code` replaced by a placeholder (e.g. 広島県 is `34001` here vs. `340006` in
the real dataset), the same convention the general `fixtures/` data uses —
city/town-level fields are otherwise byte-identical to the real dataset. The
two `中村` town files under 高知県 are similarly trimmed to the single record
needed by the round-trip test, and carry `oaza_cho_r` exactly as the real
dataset does: present for 高岡郡四万十町's `中村` (`"Nakamura"`), absent for
四万十市's `中村` (which is why that record resolves via the kana
transliteration path instead).

Regenerating: extract the relevant `pref`/`cities` entries from a real
built dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`) for the municipalities in the
table above, and the two `中村` records from `ja/高知県/四万十市.json` and
`ja/高知県/高岡郡四万十町.json`.
