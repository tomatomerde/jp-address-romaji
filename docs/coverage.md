# Romanization coverage

> **Status: pending regeneration against the v2 dataset.**
>
> The figures below were measured on the Geolonia **v1** national dataset
> (277,656 town-level records, 49.5 MB), because the environment used for the
> initial analysis could not reach the v2 API host. The v2 dataset is built
> from the same Address Base Registry source and is expected to be equal or
> better, particularly for rural `大字` names.
>
> Regenerate before relying on these numbers:
>
> ```sh
> npx jp-address-romaji-data build --out ./address-data
> pnpm coverage:measure --data ./address-data > docs/coverage.md
> ```

## National (v1 dataset)

| Metric | Count | Share |
| --- | ---: | ---: |
| Town entries (raw rows) | 277,656 | 100% |
| With a romaji field | 238,197 | 85.79% |
| With a kana reading | 238,243 | 85.81% |
| Distinct entries | 190,423 | — |
| Distinct with romaji | — | 87.11% |
| Distinct, excluding corrupt values | — | **84.92%** |

## The distribution matters more than the average

| Segment | Entries | Romaji coverage |
| --- | ---: | ---: |
| **Chome-bearing (urban, 住居表示)** | 90,972 | **99.83%** |
| Non-chome (rural `大字`) | 99,451 | 75.46% |
| `大字`-prefixed specifically | 10,701 | **3.62%** |

## Data quality

- **2.51%** of populated romaji fields (4,164 entries) are corrupt: the name
  collapsed to a bare chome number (`一条通十丁目` → `"10"`). Concentrated in
  Asahikawa (2,045), Nakashibetsu (773) and Hirosaki (301). The library rejects
  these at runtime.
- Kana and romaji go missing **together**: only 50 of 277,656 rows have kana
  without romaji, so there is no kana fallback for the gap.
- At least one entry has a *shifted* reading — `円山` carries `円山西町`'s kana
  and romaji. Detected by a reading-length plausibility check.

## Lowest-coverage prefectures (distinct entries)

Every one of these is ~100% on chome entries; the gap is entirely rural.

| Prefecture | Distinct | Usable | Chome entries | Chome usable |
| --- | ---: | ---: | ---: | ---: |
| 青森県 | 3,144 | 46.09% | 1,094 | 100.00% |
| 沖縄県 | 1,230 | 49.67% | 556 | 100.00% |
| 長野県 | 2,250 | 60.62% | 630 | 98.73% |
| 福島県 | 4,191 | 63.54% | 718 | 100.00% |
| 大分県 | 2,007 | 66.27% | 559 | 100.00% |
| 宮城県 | 4,786 | 66.92% | 1,631 | 100.00% |
| 山形県 | 2,615 | 72.54% | 904 | 100.00% |
| 奈良県 | 2,526 | 74.23% | 908 | 100.00% |
| 佐賀県 | 968 | 74.28% | 195 | 100.00% |
| 埼玉県 | 5,371 | 77.86% | 3,225 | 100.00% |

## Highest-coverage prefectures

| Prefecture | Distinct | Usable |
| --- | ---: | ---: |
| 神奈川県 | 4,920 | 99.80% |
| 兵庫県 | 8,993 | 99.30% |
| 静岡県 | 3,632 | 99.23% |
| 岡山県 | 2,646 | 98.49% |
| 東京都 | 5,375 | 98.47% |
| 大阪府 | 8,627 | 97.90% |

## Reverse-direction ambiguity

| Scope | Distinct romaji keys | Ambiguous |
| --- | ---: | ---: |
| Within a known municipality | 161,828 | **0.26%** |
| Nationwide, no municipality context | 122,794 | **11.38%** |

13 municipality romanizations collide across prefectures, including
`DATESHI` (北海道伊達市 / 福島県伊達市), `HOKUTOSHI` (北海道北斗市 / 山梨県北杜市)
and `KASHIMASHI` (茨城県鹿嶋市 / 佐賀県鹿島市). This is why `fromRomaji`
resolves strictly outside-in and refuses to guess.
