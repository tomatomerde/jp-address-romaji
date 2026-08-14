# Named-koaza regression fixtures

An eleventh, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as the other `fixtures-*` directories:
`../fixtures/data` is intentionally sparse v1-derived data used to exercise
refusal paths, and CLAUDE.md asks that its coverage not be "fixed".

These records reproduce a real bug (jp-address-romaji <= 0.1.2, still present
before this fix): `normalizer.ts`'s `normalizeJapanese` only ever read a
`koaza` (small-area subdivision) through `recoverKoazaNumber`, which fires
only when the koaza is a bare number plus a suffix (`^([0-9]+)(丁目|番町|...)$`).
A NAMED koaza — one with real text, not just a number — was read nowhere and
silently dropped, changing the address: `toRomaji('長野県飯田市本町三丁目大横1-1', {})`
returned `ok: true` with `"1-1 Hommachi, Iida-shi, Nagano, Japan"`, silently
losing `三丁目大横`.

| Prefecture | City | Town | Koaza | What it tests |
| --- | --- | --- | --- | --- |
| 長野県 | 飯田市 | 本町 (`Hommachi`) | `三丁目大横`, reading `３チョウメ` | The exact reported case. The dataset's reading stops at the counter and never reaches `大横`, so this must refuse with `KOAZA_READING_INCOMPLETE`. **This row previously carried `サンチョウメオオヨコ` — a complete reading that does not exist in the shipped dataset** — which made the regression test for the reported bug pass against invented data while `0.1.4` shipped the real address as `"1-1 3Chome Hommachi"`, with `大横` missing. The row now matches the real dataset. |
| 兵庫県 | 朝来市 | 生野町口銀谷 (`Ikunocho Kuchiganaya`) | `字愛宕`, reading `アザアタゴ` | The positive control, and a real one: a named koaza whose reading does cover the whole name, so it must be romanized and kept. Verbatim from the shipped dataset, including the row with no koaza at all. |
| 北海道 | 札幌市白石区 | 南郷通 (`Nangodori`) | `一丁目北`, `十二丁目南` (all rows verbatim; the fabricated `三丁目西`/`３チョウメニシ` row that used to sit here has been removed — 南郷通 has no complete-reading row in the real dataset) | A real measured failure mode (assumption 6 in `scripts/verify-data-assumptions.ts`, GitHub Actions run 31782019121): `koaza_k` stops at `チョウメ` and never reaches the trailing `北`/`南`. `isPlausibleReading`'s mora-count bound does NOT catch this (both readings sit well under the bound for their kanji count) — only the koaza-specific trailing-positional-kanji check in `romaji/validate.ts`'s `isKoazaReadingComplete` does. Must refuse with `KOAZA_READING_INCOMPLETE`, not silently romanize the truncated reading. |
| 北海道 | 札幌市白石区 | 南郷通 (`Nangodori`) | `三丁目西` | A control in the SAME shape as the two refusals above (ends in a positional kanji, `koaza_k` uses the same digit-for-chome convention) but with a COMPLETE reading (`３チョウメニシ`, ending in `ニシ`). Proves the completeness check accepts a genuinely complete positional-suffix reading rather than refusing every koaza that happens to end in `北`/`南`/`東`/`西`/`上`/`下`/`中`. |

`三丁目大横`'s embedded `丁目` and 南郷通's koaza design mirror the real ABR
data shape directly: for these towns there is no separate `chome`/`chome_n`
field at all — the "丁目"-like text lives inside `koaza` itself, which is why
`normalizer.ts`'s existing `chome_n`-only handling could never have caught
this class of address no matter how it was extended.

`ja.json` holds trimmed 長野県/飯田市 and 北海道/札幌市白石区 entries.
`ja/長野県/飯田市.json` keeps a flat 本町 row (no koaza) alongside the koaza
row, mirroring how `../fixtures-koaza-number-ambiguity` keeps a flat row next
to its numbered-koaza rows. `ja/北海道/札幌市白石区.json` has no flat 南郷通
row — every row is a koaza, the same shape as `../fixtures-koaza-number-ambiguity`'s
名田庄挙原 fixture.

Regenerating: these are constructed, not extracted from a real dataset build
(the 南郷通 kana readings are quoted directly from the real measurement in
`docs/project-status.md` item 1 / assumption 6's output; the others are
plausible readings built the same way the real ones are, following the
`isPlausibleReading`/`isKoazaReadingComplete` rules these fixtures exist to
exercise).
