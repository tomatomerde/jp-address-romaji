# Chome/chome-less collision regression fixtures

A third, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as `../fixtures-municipality-ambiguity`:
`../fixtures/data` is intentionally sparse v1-derived data used to exercise
refusal paths, and CLAUDE.md asks that its coverage not be "fixed".

These records reproduce a real bug (jp-address-romaji <= 0.1.2): when a town
has both a chome-bearing row and a chome-less row in the dataset, and the
leading number in a romaji address happens to be a valid chome number for
that town, `fromRomaji` silently read it as the chome — even though the same
input is equally readable as a chome-less address with that number as the
first block number. `"1-1 Asagishi"` in 盛岡市 could mean 浅岸一丁目1 (chome 1,
block 1) or 浅岸1番1号 (chome-less, block 1-1); the library picked the former
without telling the caller a second reading existed.

One real town from the published Geolonia v2 dataset:

| Prefecture | City | Town | What it tests |
| --- | --- | --- | --- |
| 岩手県 | 盛岡市 | 浅岸 (`Asagishi`) — one chome-less row plus chome 1 and chome 2 | A leading number that is a valid chome for the town, with a chome-less row also present, must resolve as `AMBIGUOUS` with both readings offered, not silently pick the chome reading. |

`ja.json` is a trimmed copy of the real `ja.json` (only 岩手県, only 盛岡市).
`ja/岩手県/盛岡市.json` is trimmed to the three 浅岸 records needed (chome-less,
chome 1, chome 2); the real file also has koaza rows and chome 3, which are
not needed here.

Regenerating: extract the 岩手県 `pref`/`cities` entry from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed to 盛岡市, and the 浅岸 records
from `ja/岩手県/盛岡市.json`.
