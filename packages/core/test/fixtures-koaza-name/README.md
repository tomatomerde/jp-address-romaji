# Named-koaza regression fixtures

A ninth, separate fixture dataset (same file layout as `../fixtures/data`), kept apart from it
for the same reason as the other numbered `fixtures-*` directories: `../fixtures/data` is
intentionally sparse v1-derived data used to exercise refusal paths, and CLAUDE.md asks that its
coverage not be "fixed".

These records reproduce a real bug present in the published `jp-address-romaji@0.1.2` and
`0.1.3`: a town whose `koaza` (small-area) rows carry a *name*, not just a number — unlike the
`地割`/`号` rows `fixtures-koaza-number-ambiguity` covers — was silently dropped entirely.
`normalizeJapanese` (`normalizer.ts`) only ever read `machiAza.oaza_cho`; nothing looked at
`machiAza.koaza` unless it was purely numeric. For `長野県飯田市本町三丁目大横1-1`, that meant the
koaza `三丁目大横` vanished without a trace and the address came back as `"1-1 Hommachi, Iida-shi,
Nagano, Japan"` — indistinguishable from `本町` with no koaza at all, and (because `本町` also has
ordinary chome rows 1–4) `fromRomaji` resolves that string to a *different* real address,
`本町一丁目1`. That is exactly the outcome `roundtrip.test.ts`'s header comment says must never
happen silently.

The fix does not attempt to romanize the koaza and fold it into the town name: `fromRomaji.ts`
only ever matches a town against its `oaza_cho_k`/`oaza_cho_r` fields, never a koaza, so a
combined name could never be parsed back to the same address — trading one silent wrong address
for a different, unverifiable one. `ParsedAddress` also has no field to put a koaza in (unlike a
purely-numeric koaza's digit, which `recoverKoazaNumber` folds into a block number). So `toRomaji`
refuses outright — `NO_ROMAJI_DATA` — whenever a resolved address carries a named koaza, rather
than silently returning the shorter, different address.

Two real towns from the published Geolonia v2 dataset, both trimmed to the handful of rows needed
to reproduce the bug:

| Prefecture | City | Town | What it tests |
| --- | --- | --- | --- |
| 長野県 | 飯田市 | 本町 (`Hommachi`) | Has both ordinary chome rows (1–4) and named-koaza rows (`三丁目大横`, `四丁目大横`) — the exact shape that let the dropped koaza collide with a real chome address. |
| 長野県 | 飯田市 | 曙町 (`Akebonocho`) | A plain, koaza-less town in the same city, used as a control to confirm the refusal is specific to towns with a named koaza and does not affect ordinary neighbours. |

`ja.json` is a trimmed copy of the real `ja.json` (長野県/飯田市 only). `ja/長野県/飯田市.json` keeps
only 本町's 6 real rows (4 chome + 2 named-koaza) plus 曙町's single flat row, out of the city's
full town list.

Regenerating: extract the relevant `pref`/`cities` entries from a real built dataset
(`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed as above.
