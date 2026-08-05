<!-- テンプレート原本: dev-standards/CLAUDE.template.md @ 8776609。共通部分（「ここから下は共通」以降）を修正したら原本にも反映すること -->

# プロジェクト固有（新規プロジェクトではこのセクションだけ書き換える）

## 目的

Bidirectional Japanese ⇄ romaji address conversion, published to npm as two packages:
`jp-address-romaji` (library) and `jp-address-romaji-data` (offline dataset). Addresses are
personal data, so the library sends them nowhere: no hosted API, no signup, and by default it
reads a local copy of the address dataset and makes no network requests at conversion time. Runs on
Node.js 18+; browser use requires supplying data through an endpoint you host yourself.

## 差別化点（＝壊してはいけない価値）

- **Never reinvent address normalization.** It is delegated entirely to
  `@geolonia/normalize-japanese-addresses`. Full-width digits, kanji numerals, `丁目/番/号` vs
  hyphens, omitted prefectures and character variants are all its job. This package is the layer
  above: romanization, word order, reverse lookup, output formats.
- **Never guess a reading.** Romaji comes from the dataset — its romaji field, or its kana reading
  transliterated deterministically. When neither exists, return an explicit typed failure. Failures
  are values, not exceptions, so callers must handle them. A wrong shipping label is worse than a
  refused one.
- **The offline guarantee is enforced, not just documented.** The upstream normalizer defaults to a
  hosted API; this package always points it at a local directory and fails with
  `DATA_NOT_CONFIGURED` rather than falling back to the network. A test replaces `globalThis.fetch`
  with a throwing stub, so a regression that reaches the network fails CI (see Landmines below).
- **`fromRomaji` resolves strictly outside-in** (prefecture → municipality → town) and, when a
  romanization matches more than one real town, returns `AMBIGUOUS` **with the candidates** rather
  than guessing among them.
- **Kyoto street-name addresses are supported without inventing a romanization for the street
  phrase.** It is split off before normalization (see Landmines) and preserved verbatim on
  `parsed.kyotoStreet` — never romanized, never fed back through `fromRomaji`.

## データ出典

- Source: the Japanese Digital Agency's **Address Base Registry**
  (アドレス・ベース・レジストリ, <https://www.digital.go.jp/policies/base_registry_address>),
  published under terms permitting free use including commercial use. Verify the current terms
  before redistributing a generated dataset.
- Processed and served by **Geolonia**: `@geolonia/japanese-addresses-v2` (the data) and
  `@geolonia/normalize-japanese-addresses` (normalization), both MIT licensed. Full attribution is
  in `packages/data/ATTRIBUTION.md`.
- The dataset is fetched from Geolonia **once**, at build/refresh time
  (`jp-address-romaji-data build` / `packages/data/src/build-data.ts`), then read locally
  thereafter. Converting addresses never touches the network — see the offline guarantee above and
  in Landmines.

## 非対応範囲

- **Geocoding accuracy.** Coordinates are deliberately excluded from the bundled town data (see
  Landmines: `point`, below) — this library makes no geocoding claim.
- **Building-name or room-number translation.** These are isolated as `unparsed` and passed through
  untouched; the type has no `romaji` field for them, by design.
- **Romanizing the Kyoto street phrase.** It is preserved verbatim, not translated — the dataset has
  no readings for street names, and guessing one is exactly what this library refuses to do.
- **`fromRomaji` accepts western order only** (prefecture last). Output produced with
  `order: 'japanese'` is for display; feeding it back in is rejected with `PREFECTURE_NOT_FOUND`.
- **No bundled postal-code dataset.** `postalCodeIndex` is a hook for the caller's own data; Japan
  Post's `KEN_ALL` is not shipped (a second data source with its own licence and update cadence
  wasn't justified by the 0.95% of genuine ambiguity it would resolve).
- **Browser use without a hosted data endpoint.** The default configuration reads the dataset from
  the filesystem, so it is Node-only out of the box.

## パッケージング: ESM 専用（共通部分「公開前に必ず確認すること」の require() 項目の例外）

- 両パッケージ（`jp-address-romaji` / `jp-address-romaji-data`）は **ESM 専用**として出す方針が
  決定済み: `package.json` は `"type": "module"`、`exports` の各エントリに `require` 条件がない。
- そのため、下の共通部分にある「ビルド成果物から実際に `require()` と `import` の両方で読み込める
  こと」はこのプロジェクトには**適用されない**。代わりに次で代替する:
  - `npx @arethetypeswrong/cli <tarball> --profile esm-only` で ESM 解決が緑になること
  - `npm pack --dry-run` で公開ファイル一覧を目視する（共通部分のこのチェック自体はそのまま適用）
- CJS 対応は今回のスコープ外であり、将来の課題として残す。技術的には可能: 上流の
  `@geolonia/normalize-japanese-addresses` は CJS/ESM 両対応。

## Landmines — each of these was a real bug

- **`point` is mandatory on prefecture and city records, forbidden on town records.** Upstream's
  `prefectureToResultPoint`/`cityToResultPoint` index into `point` with no null check and throw
  without it; only `machiAzaToResultPoint` guards it. Town points are dropped purely for size (~190k
  records) — this library makes no geocoding claim. Do not "optimize" the first two away.

- **Never strip a trailing digit from town romaji.** In v2 the chome has its own field, so a trailing
  digit belongs to the name: `政和第一` → `"Seiwadai1"`, `四重麦四` → `"Yoemugi4"`. An earlier version
  stripped it (correct for v1 data) and silently truncated those names.

- **`isPlausibleReading` must strip `大字`/`字` from the kana as well as the kanji.** v2 spells the
  prefix out in the reading (`大字三泊村` → `オオアザサンドマリムラ`). Stripping one side only made it
  flag 23,193 entries — 3.65% of everything with a reading — as corrupt, all false positives, all
  ordinary rural addresses the library then refused.

- **The Kyoto street phrase must be split off *before* normalization.** Street names carry the same
  kanji numerals as chome, so `烏丸通四条上ル笋町` fed in unchanged is read as chome 4 of an unrelated
  town. See `packages/core/src/kyoto.ts`.

- **The offline guarantee is enforced, not asserted.** The upstream normalizer defaults to a hosted
  API. Tests replace `globalThis.fetch` with a throwing stub; if a conversion ever reaches the
  network, CI fails. Never add a network fallback.

## Data

The shipped dataset is Geolonia **v2** (638,567 town entries, 1,899 municipalities, ~12 MB zipped).
Coverage is 99.55% nationally, 99.99% for chome-bearing urban addresses.

Two facts that are easy to get backwards:

- **Romaji and kana do not go missing together.** 89.51% have a romaji field, 99.55% have kana — so
  ~1 entry in 10 is romanized by transliterating kana. That path is load-bearing.
- **The older v1 data is a different animal** (85% coverage, 3.6% for `大字`-prefixed, 2.5% corrupt
  romaji). The test fixtures are v1-derived and deliberately sparse, which is why they still exercise
  the refusal paths. Do not "fix" their coverage.

`packages/data/data/` is generated, never committed. `prepublishOnly` refuses to publish without it.

## Environment

- **`japanese-addresses-v2.geoloniamaps.com` is blocked** from Claude Code cloud sessions by the
  egress policy, as are ABR, digital.go.jp, Japan Post, and Actions artifact blob storage. To touch
  real data, run the **`Refresh address data and coverage`** workflow — GitHub runners have
  unrestricted egress — and read its logs and step summary.
- **pnpm version lives only in root `package.json` `packageManager`.** Setting it in
  `pnpm/action-setup` too makes the action refuse to run.

## Commands

```sh
pnpm test                                   # fixtures only; hermetic
JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test   # + real-data integration suite
pnpm -r typecheck && pnpm -r build
npx tsx packages/data/src/build-data.ts --out ./address-data
npx tsx scripts/verify-data-assumptions.ts --data ./address-data   # read the output
npx tsx scripts/measure-coverage.ts --data ./address-data > docs/coverage.md
```

`scripts/verify-data-assumptions.ts` is the check that caught the two landmines above. Every entry it
lists under reading-plausibility is an address the library will refuse — read them, don't skim.

Release procedure: `docs/releasing.md`.

---

# ここから下は共通（全プロジェクトで同一。修正したら原本に反映）

このファイルはセッション開始時に自動で読まれる。新しいプロジェクトを作るときは
これをコピーして先頭のプロジェクト固有セクションだけ書き換える。

## 設計原則

- **推測でデータを捏造しない。** 変換・判定できない入力には明示的に失敗を返す。それらしい値で埋めない
- 確定値と推定値を区別し、フラグで返す
- 既に無料で解決されている問題は自作せず依存する。その上のレイヤーだけを作る
- 純粋関数として設計し、描画・時刻・環境依存は呼び出し側に逃がす（テストが決定的になる）
- 実行時に外部APIを叩かない構成を既定とする。依存は極力ゼロ
- コード内コメント、JSDoc、エラーメッセージは英語。テストケースの説明文のみ日本語可

## 検証

「コードを読んで正しそう」を根拠にしない。実際に動かして確かめる。
過去のプロジェクトで実際に見つかった不具合は、いずれも読むだけでは見えず、
動かして初めて見えたもの:

- ワークフローの `git push --force-with-lease` が2回目以降必ず失敗する
  → ローカルにbareリポジトリを作って再現して確認
- テストがコードパスを一度も通っていない
  → わざとコードを壊し、テストが落ちないことで発覚（変異テスト）
- CJS利用者の型解決が壊れている
  → `npm pack` した実物を `@arethetypeswrong/cli` にかけて発覚
- 不正なURLエスケープが500を返す
  → 実際にHTTPリクエストを投げて発覚

具体的には:

- 修正したら、修正前に失敗が再現することと修正後に消えることの両方を見る
- テストを追加したら、対象コードをわざと壊してそのテストが落ちるかを確認する。
  落ちないなら、そのテストは何も守っていない
- CI・パッケージング・デプロイなど外部の仕組みは、ローカルで同じ条件を作って試す
- 確かめていないことは「確かめていない」と明示する。推測を確認済みとして報告しない

## 報告

- 「完了」と言うのは、実際に動かして確認できたときだけ
- 失敗した・実施しなかった・スキップしたことは省略せずに書く
- 自分の誤りに気づいたら簡潔に訂正して先に進む。長い謝罪や反省は書かない
- レビューで指摘した内容が誤りだったと分かったら、明示的に撤回する

## セッションをまたぐ作業

セッションは使い捨て。コンテナは回収される。文脈はリポジトリに残す。

- 作業は必ず push する。未pushの成果は失われる前提で動く
- **push はブランチに行い、PRを作る。main への直push・force push は禁止**
- **秘密情報（.env、トークン、APIキー）をコミットしない。push前に差分を確認する**
- コミットメッセージには「何を変えたか」より **「なぜそう変えたか」** を書く。
  差分を見れば何をしたかは分かるが、なぜかは書かないと失われる
- 壊してはいけない設計上の前提は CONTRIBUTING.md に書く
- 中断するときは NOTES.md を更新する:
  - レビュー済みの領域 / まだ見ていない領域
  - 保留中の判断（何を決める必要があるか）
  - 人間の操作待ちの項目

## 人間待ちの扱い

権限・課金・アカウント設定など自分で実行できないものは、ブロッカーとして明示し、
コピペで実行できる形で提示する。そこで止まらず、ブロックされていない作業は先に進める。

## コスト

- 巨大な応答を返すツールを避ける。特に GitHub Actions の実行一覧APIは
  1回で100KB近く返すことがある。必要な情報だけ取る手段を選ぶ
- 一度確認したことを再確認しない
- 同じ内容を何度も読み直さない

## レビューの進め方

（運用ルール・人間向け: レビューは実装したのとは別のセッション/モデルで行う）

以下はレビューを依頼されたセッションへの指示:

- レビューは指摘を出すのが仕事。「問題なし」で終わらせない。
  見ていない領域があるなら「ここは見ていない」と言う
- 指摘は重要度順に並べ、実際に動かした結果を根拠として添える
- 「もうレビューは十分か」と聞かれたら、残っている未検証領域を具体的に挙げて答える。
  安心させるための「大丈夫です」は書かない

## 公開前に必ず確認すること

npm パッケージを公開する場合:

- `npx @arethetypeswrong/cli <tarball>` で型解決が4項目すべて緑になること
- `npm pack --dry-run` で公開されるファイル一覧を目視する
- ビルド成果物から実際に `require()` と `import` の両方で読み込めること
- README に出典・ライセンス表記、サポート範囲、免責が書かれていること

HTTP API を公開する場合:

- 不正な入力（壊れたURLエスケープ、型違い、範囲外、欠落パラメータ）が
  4xx を返すこと。500 はサーバの不具合を意味するので、クライアント起因で出してはいけない
- キャッシュヘッダが、返した値の確からしさと一致していること
- HEAD が GET と同じように扱われること
