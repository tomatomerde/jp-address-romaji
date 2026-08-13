# `fixtures-kana-digit-collision`

One real municipality — 北海道上川郡東神楽町 — copied out of the shipped v2
dataset because it is the only place in the country where accepting digits in
a kana reading creates a new romanized-key collision.

Two of its towns spell their reading identically:

| `oaza_cho` | `oaza_cho_k` | `oaza_cho_r` |
| --- | --- | --- |
| `ひじり野南一条` | `ヒジリノミナミ１ジョウ` | `Hijirinominami 1-Jo` |
| `ひじりの南一条` | `ヒジリノミナミ１ジョウ` | *(none)* |

Before `0.1.3`, the second row was unreachable: its reading contains a digit,
`isTransliterableKana` refused it, and no key was ever generated. `0.1.3`
accepts digits — they are part of the name in v2, where chome has its own
field — so the row is now indexed, and both towns answer to
`hijirinominami1jo`.

`AMBIGUOUS` is the right answer. The two names differ by one character
(`野` / `の`) and romanize the same, so nothing in the query distinguishes
them; picking one would be the guess this library exists to refuse.

A rule that preferred the romaji-field-backed row was tried on this branch and
removed before release: nationally it silently resolved 110 towns to a
*different* town (`扇町` → `正親町`, `巻` → `真木`, `辰巳町` → `巽町`), which is
a far worse trade than the one municipality it rescued. See the `0.1.3`
CHANGELOG entry.

The prefecture `code` values here are synthetic, matching the style of the
other fixture datasets in this directory. Everything the matcher reads —
names, readings, romaji fields — is verbatim from the real dataset.
