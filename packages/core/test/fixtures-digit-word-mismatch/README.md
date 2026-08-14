# `fixtures-digit-word-mismatch`

A tenth, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as the other dedicated fixture
directories in this file: it exists only to reproduce one specific real bug,
not to exercise general coverage.

One real municipality — 秋田県横手市 — with one real town, 前郷一番町, whose
two reading fields disagree on how to spell the number in the name:

| field | value |
| --- | --- |
| `oaza_cho_k` | `マエゴウ１バンチョウ` (digit `１`) |
| `oaza_cho_r` | `Maego Ichibancho` (word `Ichi`) |

`toRomaji(..., {longVowel:'none'})` uses the romaji field and reads
`"Maego Ichibancho"`. Every other `longVowel` style can only transliterate the
kana (the romaji field cannot express vowel length), which reads the digit
literally: `"Maegō1Banchō"` under `macron`. Same town, two different *words*
depending on style — not a diacritic difference. See `docs/project-status.md`,
item 4, and the reasoning in `packages/core/src/romaji/format.ts`'s
`romanizeStem`.

Regenerating: extract 秋田県 and its 横手市 → 前郷一番町 entry from a real
built dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), the same way the other dedicated
fixture directories describe.
