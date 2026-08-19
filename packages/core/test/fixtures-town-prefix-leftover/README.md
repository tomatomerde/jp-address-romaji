# Town-prefix leftover regression fixtures

A twelfth, separate fixture dataset (same file layout as `../fixtures/data`),
kept apart from it for the same reason as the others: `../fixtures/data` is
intentionally sparse v1-derived data used to exercise refusal paths, and
CLAUDE.md asks that its coverage not be "fixed".

These records reproduce a real bug (jp-address-romaji <= 0.1.7): when the
upstream normalizer matches only a PREFIX of the town the caller wrote, the
characters it did not consume were carried into the block-number side of the
result and rendered as if they were a building name. The address that came
back named a different, real town:

```text
東京都新宿区中井1番1号
  -> { ok: true, formatted: "井1-1, Nakacho, Shinjuku-ku, Tokyo, Japan" }
```

`中井` is in the dataset (`Nakai`, chome 1 and 2). The normalizer registers
`中` as an alias of `中町` (it allows a trailing `町` to be omitted) and tries
that alias before the "chome written without 丁目" pattern that would have
matched `中井1`, so `中` wins, `中町`/`Nakacho` is returned, and the leftover
`井` is left in front of the block numbers. Both halves of the answer are
wrong and neither is flagged.

Two real municipalities from the published Geolonia v2 dataset, one for each
way a prefix match arises:

| Prefecture | Municipality | Rows | What it tests |
| --- | --- | --- | --- |
| 東京都 | 新宿区 | `中井` chome 1 and 2, plus the unrelated chome-less `中町` | The `町`-omission alias: `中井1番1号` must not resolve to `中町` with `井` pushed into the address line. `中町1番1号` — the same shape, spelled the way the alias's own town is spelled — must still succeed. |
| 北海道 | 札幌市中央区 | `宮の森` (chome-less), `宮の森一条` chome 1 and 2 | A shorter town that is a literal prefix of a longer one: `宮の森一条1番1号` must not resolve to `宮の森` with `一条` pushed into the address line. |
| 北海道 | 札幌市中央区 | `旭ケ丘` chome 1 and 2, and no chome-less row | The leftover with the RIGHT town: `旭ケ丘1番1号` reads the leading `1` as the chome and leaves `番1号`, which came back as "番1号, 1 Asahigaoka" — the 号 number dropped and the notation printed as a building name. |

`ja.json` is a trimmed copy of the real `ja.json` (only 北海道 and 東京都, and
only the one municipality each). The town files are trimmed to the rows named
above; both real files carry many more.

`中町1番1号` and `中町 サンプルビル301` are here as controls: the same input
shapes with nothing left over must keep converting, or the fix would be
refusing the `N番M号` notation and the building-name slot themselves.

Every field in every row here was compared field-by-field against a real built
dataset before this fixture was committed (0 differences). The rows drop
`point`, `rsdt` and `csv_ranges`, which the conversion does not read; nothing
else was edited, and no row was invented.

Regenerating: extract the 北海道 and 東京都 `pref`/`cities` entries from a real
built dataset (`JP_ADDRESS_ROMAJI_DATA_DIR`), trimmed to the two
municipalities, and the rows above from `ja/東京都/新宿区.json` and
`ja/北海道/札幌市中央区.json`.
