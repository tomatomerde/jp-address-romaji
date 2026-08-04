# Test fixtures

`data/` is a small dataset in the same layout as the real one, holding seven
municipalities chosen to cover the behaviours that matter — including the
broken ones. It is committed because the tests must be reproducible without a
network fetch.

| Municipality | Why it is here |
| --- | --- |
| 東京都渋谷区 | Tokyo special ward; ordinary chome addresses |
| 東京都新宿区 | The README's worked example (西新宿) |
| 北海道札幌市中央区 | Designated city + ward, and the corrupt `円山` entry whose kana and romaji both belong to `円山西町` |
| 青森県青森市 | Worst-covered prefecture; rural `大字` names with no readings at all |
| 北海道旭川市 | Romaji values corrupted into bare chome numbers (`一条通十丁目` → `"10"`) |
| 新潟県三島郡出雲崎町 | County (`郡`), and a `町` read *machi* rather than *cho* |
| 京都府京都市中京区 | Kyoto street-name addressing, which is refused |

The records are real, taken from the published Geolonia national dataset, so
the tests exercise genuine data defects rather than invented ones.

## Regenerating

Fixtures were generated from the Geolonia v1 national CSV (`data/latest.csv`,
~50 MB) by extracting the municipalities above and reshaping them into the v2
layout. Regeneration is only needed if the set of covered municipalities
changes; the committed fixtures are otherwise stable.

Note that `point` is present on prefecture and city records but omitted from
town records. That is not an oversight: upstream's `prefectureToResultPoint`
and `cityToResultPoint` index into `point` without a null check, while
`machiAzaToResultPoint` guards it. Removing the first two breaks normalization.
