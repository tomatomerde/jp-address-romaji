# `fixtures-kana-only-town`

A ninth, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as the other dedicated fixture
directories in this file: it exists only to reproduce one specific real bug,
not to exercise general coverage.

One real municipality — 青森県青森市 — with one real town, 大字駒込
(`oaza_cho_k: "オオアザコマゴメ"`, no `oaza_cho_r`). About 10% of towns in the
shipped dataset are like this: a kana reading but no romaji field (see
CLAUDE.md's "データの実情").

Before the fix, `fromRomaji`'s `buildParsed` (`packages/core/src/fromRomaji.ts`)
attached `record.oaza_cho_r` to `parsed.town.romaji` only when that field
existed, so a town matched entirely through its kana reading came back with
`town.romaji` missing even though the match had already computed a
deterministic transliteration of it. `toFormat`'s `streetOf` then fell back to
`town.ja`, putting kanji into an address declared `languageCode: "en"`. See
`docs/project-status.md`, item 3.

Regenerating: extract 青森県 and its 青森市 → 大字駒込 entry from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), the same way the other dedicated
fixture directories describe.
