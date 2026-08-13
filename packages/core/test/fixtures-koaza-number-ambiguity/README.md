# Koaza numbered-subdivision regression fixtures

A fourth, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as `../fixtures-municipality-ambiguity`
and `../fixtures-chome-ambiguity`: `../fixtures/data` is intentionally sparse
v1-derived data used to exercise refusal paths, and CLAUDE.md asks that its
coverage not be "fixed".

These records reproduce a real bug (jp-address-romaji <= 0.1.2, still present
before this fix): for a town whose `koaza` (small-area) rows are themselves
numbered — `N地割` ("chiwari", a land-lot numbering used in rural Iwate towns),
`N号` ("gou", used the same way in parts of Fukui and elsewhere), or a handful
of other numbered-suffix forms the upstream normalizer recognizes — a
hyphenated address such as `2-3` is read by
`@geolonia/normalize-japanese-addresses` as koaza `2` (`２地割`/`２号`) plus
block number `3`, not as two block numbers. The town has no `chome`, so
`toRomaji` only ever extracted `chome_n` and the flat `oaza_cho`; the koaza
number itself was read nowhere, and silently vanished. `2-3` came out as `3`.

Two real towns from the published Geolonia v2 dataset, both trimmed to the
handful of rows needed to reproduce the ambiguity:

| Prefecture | City | Town | Koaza suffix | What it tests |
| --- | --- | --- | --- | --- |
| 岩手県 | 遠野市 | 青笹町青笹 (`Aozasacho Aozasa`) | `地割` (chiwari) | A town with both a flat (koaza-less) row and numbered `N地割` koaza rows. |
| 福井県 | 大飯郡おおい町 | 名田庄挙原 (`Natasho Agehara`) | `号` (gou) | A town with **no** flat row — every row is a numbered `N号` koaza, so there is no fallback reading to silently drop into. |

`ja.json` is a trimmed copy of the real `ja.json` (岩手県/遠野市 and
福井県/大飯郡おおい町 only). `ja/岩手県/遠野市.json` keeps only the flat 青笹町青笹
row plus 「１地割」 and 「２地割」 (the real file has 39 rows for this town,
covering chiwari 1 through 21 plus several named koaza). `ja/福井県/大飯郡おおい町.json`
keeps only 「１号」「２号」「３号」 of 名田庄挙原's 16 rows.

Regenerating: extract the relevant `pref`/`cities` entries from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed as above.
