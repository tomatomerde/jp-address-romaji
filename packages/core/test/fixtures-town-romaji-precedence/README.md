# Town romaji-field-precedence regression fixtures

A separate fixture dataset (same file layout as `../fixtures/data`), kept
apart from it for the same reason as `../fixtures-municipality-ambiguity` and
`../fixtures-chome-ambiguity`: `../fixtures/data` is intentionally sparse
v1-derived data used to exercise refusal paths, and CLAUDE.md asks that its
coverage not be "fixed".

These records reproduce a regression introduced while adding numeral support
to `isTransliterableKana` (published as `jp-address-romaji@0.1.2` did not have
it; the regression only appeared on this branch, before this fixture's test
was added): once a kana reading containing a digit became transliterable,
`ひじりの南一条` — which has no `oaza_cho_r` romaji field, only a kana reading —
started producing a matching key for `fromRomaji`, and that key collided with
`ひじり野南一条`, an entirely different, more common town that DOES carry its
own `oaza_cho_r` ("Hijirinominami 1-Jo"). The address `"1-1-1 Hijirinominami
1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido"` — which resolved cleanly in
the published `0.1.2` — started reporting `AMBIGUOUS` between the two towns.

The fix: when a romanized key collides across more than one distinct town
within a municipality, prefer the town(s) reachable through their OWN
`oaza_cho_r` field over one reachable only via a kana transliteration — the
dataset's romaji field is the authoritative spelling, and a kana-derived key
is a substitute for it. This must not fire when BOTH colliding towns have
their own romaji field (see `fromRomaji.test.ts`'s existing 夷町/恵比須町 case,
which uses `../fixtures/data` and must stay `AMBIGUOUS`), and must not fire by
stemming the administrative suffix off a candidate's OWN romaji field either
(see the 深谷/深谷町 case exercised by `roundtrip.test.ts` against the real
dataset, where stemming `Fukayacho` down to `fukaya` must NOT make 深谷町 win
over the correct 深谷 for a bare "Fukaya" query).

One real municipality from the published Geolonia v2 dataset:

| Prefecture | County/City | Towns | What it tests |
| --- | --- | --- | --- |
| 北海道 | 上川郡東神楽町 | `ひじり野南一条` (chome 1, chome 2; `oaza_cho_r`: `Hijirinominami 1-Jo`) and `ひじりの南一条` (chome 6 only; no `oaza_cho_r`, kana `ヒジリノミナミ１ジョウ` — same reading as the other town) | A romanized query that collides between a romaji-field-backed town and a kana-only-backed town must resolve to the romaji-field-backed one, not report `AMBIGUOUS`. |

`ja.json` is a trimmed copy of the real `ja.json` (only 北海道, only
上川郡東神楽町). `ja/北海道/上川郡東神楽町.json` is trimmed to the three records
needed (ひじり野南一条 chome 1 and 2, ひじりの南一条 chome 6); the real file also
has chome 3-10 for the first town and other unrelated ひじり野/ひじりの
variants, which are not needed here.

Regenerating: extract the 北海道 `pref`/`cities` entry from a real built
dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed to 上川郡東神楽町, and the
`ひじり野南一条`/`ひじりの南一条` records from `ja/北海道/上川郡東神楽町.json`.
