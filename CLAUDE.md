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
  wasn't justified by the 0.69% of full-form-key ambiguity it would resolve — measured by
  `scripts/measure-ambiguity.ts`).
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

- **`japanese-addresses-v2.geoloniamaps.com` may be unreachable** from a restricted development
  environment, as may ABR, digital.go.jp, Japan Post, and Actions artifact blob storage. To touch
  real data from one, run the **`Refresh address data and coverage`** workflow — GitHub runners
  reach all of them — and read its logs and step summary.
- **pnpm version lives only in root `package.json` `packageManager`.** Setting it in
  `pnpm/action-setup` too makes the action refuse to run.

## Commands

```sh
pnpm test                                   # fixtures only; hermetic
JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test   # + real-data integration suite
pnpm typecheck && pnpm -r build             # -r だけでは test/scripts/vitest.config.ts が型検査されない
npx tsx packages/data/src/build-data.ts --out ./address-data
npx tsx scripts/verify-data-assumptions.ts --data ./address-data   # read the output
npx tsx scripts/measure-coverage.ts --data ./address-data > docs/coverage.md
```

`scripts/verify-data-assumptions.ts` is the check that caught the two landmines above. Every entry it
lists under reading-plausibility is an address the library will refuse — read them, don't skim.

Release procedure: `docs/releasing.md`.

## 引き継ぎ文書の場所（共通部分の `NOTES.md` に対応）

下の共通部分は中断時に `NOTES.md` を更新するよう求めているが、このプロジェクトではその役割を
**`docs/project-status.md`** が担う。`NOTES.md` は存在しない。中断・引き継ぎのときは
`docs/project-status.md` を書き換えること。二重管理を避けるため、`NOTES.md` を新設しないこと。

公開前提で書くという規約そのものは共通部分（「作業の残し方」）にある。このプロジェクト固有の
上乗せは1点だけ: `docs/project-status.md` はセッション間の申し送りだが、そこでも外部の読者が
読んで意味が通り、**かつ不快でない**書き方にすること。

人間の貢献者向けの「壊してはいけない前提」は `CONTRIBUTING.md` にある（共通部分が要求している
とおり）。このファイルは Claude 向けの作業メモで、`CONTRIBUTING.md` とは読み手が違う。

`Claude-Session:` トレーラを付けない規約そのものは共通部分（「作業の残し方」）にある。経緯だけ
ここに残す: 過去のコミットに付いていた分は公開前の履歴整理で除去済みで、現在の履歴に残存はない。
`refs/pull/*/head` が残るため force push では消えず、リポジトリを作り直して整理した。セッションは
履歴の書き換えを行わないこと。

---

<!-- 以下は dev-standards の common/CLAUDE.common.md から自動同期（@ ce3d1c5）。マーカーの内側を手で編集しないこと -->
<!-- BEGIN dev-standards common -->
# ここから下は共通（全プロジェクト同一・dev-standards から自動同期）

この節は dev-standards の `common/CLAUDE.common.md` から自動で配られる。
**マーカー（`BEGIN dev-standards common` / `END dev-standards common`）の内側を
直接編集しないこと。** CI がハッシュ照合で落とす。共通のルールを変えたいときは
dev-standards 側を直す——各案件には同期 PR が自動で届く。

このファイルはセッション開始時に自動で読まれる。マーカーより上がプロジェクト固有。

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
- 手元では通る手順が CI では落ちる
  → 手で打った手順と設定ファイルに書いた手順が1行違っていた（`mkdir` の書き忘れ）
- 型検査が一度もかかっていないファイル群があった（テスト・スクリプト・設定ファイル）
  → わざと型エラーを注入し、lint も typecheck も test も素通りすることで発覚
- README のコード例が実物と違っていた（戻り値の形も、計算結果も）
  → API 節の記述から起こした例を、ビルドして実行して発覚。**例は読者が最初にコピペする
  ものなので、動かさずに書けば最初の一歩で嘘をつく**
- 引き継ぎ文書が「未対応」と書いている作業が、実は完了していた
  → 記録を読むのではなく、リポジトリの実体を走査して発覚
- リリース用ワークフローの成果物チェックが、**中身が正しいせいで必ず落ちて**いた
  → 初めて dry run を実物で回して発覚。`tar -tzf … | grep -q …` は、一致した瞬間に
  `grep` が終了してパイプが閉じ、まだ書き残している `tar` が SIGPIPE で死ぬ。
  `pipefail` の下ではそれがパイプライン全体の失敗になる。しかも**中身が無い場合も
  同じメッセージで落ちる**ので、2つの結果が区別できず、通ることが原理的に無かった。
  コード自体は何度も読まれていて、隣に同種の罠（`grep -c`）の解説コメントまであった

具体的には:

- 修正したら、修正前に失敗が再現することと修正後に消えることの両方を見る
- テストを追加したら、対象コードをわざと壊してそのテストが落ちるかを確認する。
  落ちないなら、そのテストは何も守っていない
- **チェックは「落ちるべきときに落ちる」と「通るべきときに通る」の両方を確認する。**
  片方だけでは足りない。健全な入力に対して必ず落ちる検証を書いてしまい、異常な入力でも
  同じメッセージで落ちるので区別がつかない、という状態が公開直前まで残ったことがある。
  通らないチェックと落ちないチェックは、どちらも同じくらい無価値
- **`pipefail` の下で、パイプの後段に早期終了するコマンド（`grep -q`、`head`）を置かない。**
  前段が SIGPIPE で死に、パイプライン全体が失敗する。**一致したときだけ**起きるので、
  成功すべきときに落ちるという反転した壊れ方をする。しかも前段の出力がパイプバッファ
  （64KB）に収まるうちは発火しないため、データが増えた日に突然壊れる。いったんファイルに
  落としてから調べる
- 期待値を検証対象そのものから作らない。実装の出力をテストの期待値にすると、
  実装が間違っていても一致してしまう。別の実装・別の言語・仕様書の条文など、
  独立した経路で導いた値と突き合わせる
- CI・パッケージング・デプロイなど外部の仕組みは、ローカルで同じ条件を作って試す。
  そのとき設定ファイルに書いたコマンドそのものを実行する。手で打った手順と設定に
  書いた手順が1行でも違えば、確かめたことにならない。設定ファイルから該当箇所を
  抜き出して流すのが確実。**「ほとんどのステップは抜き出して流した」は通用しない。**
  抜き出さなかった1ステップが落ちる。実例: 検査ロジックは全部そうやって検証したのに、
  その手前の `npm pack --pack-destination` だけ手で `mkdir -p` してから叩いていた。
  `npm pack` は出力先を作らないので、ワークフローは初回実行で ENOENT で落ちた
  （`pnpm pack` は作る。移植元で踏まなかった罠は移植先で踏む）
- 確かめていないことは「確かめていない」と明示する。推測を確認済みとして報告しない
- **文書に書いてあるコード例は、書いた本人が実行して出力を確かめる。** 仕様や別の節の
  記述から起こさない。それは実装ではなく文書を写しているだけで、文書のほうが古ければ
  一緒に間違える
- **引き継ぎ文書やチェックリストの「済/未」は、信じる前に実体と突き合わせる。** 記録は
  作業より遅れるのが常態で、「未対応」と書いてある項目が終わっていることも、
  「対応済み」が終わっていないこともある。状態を報告する前に必ず現物を見る

## 報告

- 「完了」と言うのは、実際に動かして確認できたときだけ
- 失敗した・実施しなかった・スキップしたことは省略せずに書く
- 自分の誤りに気づいたら簡潔に訂正して先に進む。長い謝罪や反省は書かない
- レビューで指摘した内容が誤りだったと分かったら、明示的に撤回する

## 作業の残し方

作業環境は使い捨てとして扱う。文脈は環境ではなくリポジトリに残す。

- 作業は必ず push する。未pushの成果は失われる前提で動く
- **push はブランチに行い、PRを作る。main への直push・force push は禁止**
- **秘密情報（.env、トークン、APIキー）をコミットしない。push前に差分を確認する**
- コミットメッセージには「何を変えたか」より **「なぜそう変えたか」** を書く。
  差分を見れば何をしたかは分かるが、なぜかは書かないと失われる
- コミットメッセージに `Claude-Session:` トレーラを付けない。リンクは発行元の
  アカウントからしか開けず、公開リポジトリの履歴に開けないリンクが残り続ける
  だけになる。`Co-Authored-By:` は付けてよい
- **同じ理由で、PR・イシュー・コメントの本文にもセッション URL を書かない。**
  トレーラだけを見ていると見落とす。PR 本文は public リポジトリでは第三者が
  そのまま読む場所で、しかも**マージ後も残り続ける**。実際、3案件で公開後に
  100 件超の PR 本文にセッション URL が残っていた（2026-08-11 に一括除去）。
  一方、`_Generated by [Claude Code](https://claude.ai/code)_` のような
  **セッション ID を含まない帰属フッターは、実行環境が書き込みのたびに自動で
  付けることがある**。これは誰でも開けるので実害がなく、消しても次の書き込みで
  戻る——消そうとして時間を使わないこと。落とすべきなのは `session_` を含む
  URL のほうだけ
- 作った PR は作って終わりにしない。CI の失敗、レビューコメント、コンフリクトへの
  対応までが作業。PR の活動を購読できる環境では、PR 作成後に購読を設定する
- **リポジトリに残す文章は、公開される前提で書く。** CLAUDE.md・NOTES.md・コミット
  メッセージの読み手は次のセッションだけではなく、リポジトリを訪れた第三者でもある。
  特定の人物や依頼のやりとりについての内輪の評価は書かない。技術的な事実・未検証事項・
  残作業は、遠慮せずそのまま書いてよい。private なうちに書いたものも履歴に残るので、
  公開する日に効いてくる
- 壊してはいけない設計上の前提は CONTRIBUTING.md に書く
- 中断するときは NOTES.md を更新する:
  - レビュー済みの領域 / まだ見ていない領域
  - 保留中の判断（何を決める必要があるか）
  - 人間の操作待ちの項目

## 人間待ちの扱い

権限・課金・アカウント設定など自分で実行できないものは、ブロッカーとして明示し、
コピペで実行できる形で提示する。そこで止まらず、ブロックされていない作業は先に進める。

- **人間に渡すコマンドは1コマンド＝1行で書く。** 依頼者の端末が Windows PowerShell の
  ことがある。PowerShell では**行末の `\` は継続にならず**、`<<'EOF'` のヒアドキュメントも
  使えない。複数行で貼らせると2行目以降が別コマンドとして実行され、
  `単項演算子 '--' の後に式が存在しません` のようなエラーになる（実際に起きた）。
  改行が必要な内容は、単一引用符の1行文字列にしてパイプで渡す
  （例: JSON を `gh api ... --input -` へ）か、ファイルに書かせる形にする
- **渡す前に、そのコマンドが「何を対象にするか」を自分で確認する。** 一括削除・一括更新を
  勧めるなら、対象一覧を先に取って**例外が無いこと**を確かめる。実例: マージ済み
  ブランチの掃除で「`claude/*` を全部消す」と書きかけたが、数えたら未マージが7本あった。
  条件で絞るコマンドに書き直すこと——人間は貼って実行するだけなので、絞り込みの責任は
  渡す側にある

## 効率

- 必要な情報だけを取得する。GitHub Actions の実行一覧APIのように1回で100KB近く
  返す手段は避け、絞り込める手段を選ぶ
- 一度確認した事実を再確認しない。同じ内容を繰り返し読み直さない

## レビューの進め方

（運用ルール・人間向け: レビューは実装したのとは別のセッションで行う）

以下はレビューを依頼されたセッションへの指示:

- レビューは指摘を出すのが仕事。「問題なし」で終わらせない。
  見ていない領域があるなら「ここは見ていない」と言う
- 指摘は重要度順に並べ、実際に動かした結果を根拠として添える
- 「もうレビューは十分か」と聞かれたら、残っている未検証領域を具体的に挙げて答える。
  安心させるための「大丈夫です」は書かない

## 公開前に必ず確認すること

リポジトリを公開する場合:

- 履歴そのものを公開適性の観点で見る。コミットメッセージのトレーラ、内輪の記述、
  削除済みファイルの中身も履歴には残っている
- **不都合な履歴は force push では消えない。** GitHub は PR の ref（`refs/pull/*/head`）
  経由で旧コミットを保持し続け、旧 SHA への直リンクも生きたままになる。確実に消す手段は
  リポジトリを削除して作り直すことしかない。**公開前が唯一の安価なタイミング**（フォークが
  存在せず、PR は使い捨てで、履歴書き換えの影響を受ける他人がいない）
- 履歴を書き換えたら、書き換え後を3点で検証する: 最終 tree が書き換え前とバイト一致する
  こと、全 blob を grep して残存がないこと、除去対象の件数が 0 になっていること
- **リポジトリを作り直したら、履歴中の `#N` は全部あてにならなくなる。** 新しい
  リポジトリの PR は0番から始まるのに、コミットメッセージは旧リポジトリの番号を引いた
  ままになる。GitHub は**コミットメッセージ中の `#N` を自動リンクする**（リポジトリ内の
  `.md` ファイルは自動リンクしないので、そちらの節番号参照は無害）。公開時点では 404 だが、
  **そのリポジトリで PR を1本開いた瞬間、過去の `#1` が無関係な PR を指し始める。**
  404 は読み手が誤りだと判断できるが、こちらは静かに嘘になるほうなので厄介。
  番号を書き換えるのは勧めない——付け替え先が存在せず、履歴に触ると「tree が一致する＝
  コードは1バイトも変わっていない」という整理の検証根拠を失う。引き継ぎ文書の冒頭に
  「履歴中の `#N` は旧リポジトリのもの。番号ではなく `git log` の件名で辿ること」と
  書いておく。同じ理由で、旧リポジトリの SHA を引いている記述も解決しなくなる
**README は「読み物」として一度通しで読む。** 要素の有無を機械的に確認するだけでは足りない。
初めて来た第三者になったつもりで読み、次を見る:

- **最初の画面で「何の問題を解決するか」「なぜ既存の選択肢では駄目か」が分かるか。**
  読まれるのは README だけだと思ってよい。コードや構成の美しさは利用者はほぼ見ない
- **導入手順があるか。** パッケージ名と導入コマンドが書かれていないと、読者は何もできない。
  実際にこれが1行も無いまま公開直前まで来た案件がある
- **互換性の壁を導入手順の隣に置く。** ESM 専用・対応ランタイム・必須の周辺データなど、
  「入れてから失敗する」たぐいの条件を最下部に置かない
- **利用者向けの動線にメンテナ向けの内容を混ぜない。** テストファイルの一覧やビルド構成は
  使う側に要らない。それらが前にあると、宣伝している機能のほうが下に沈む
- **判断に必要な情報を、長いリファレンスの後ろに置かない。** 対応範囲・既知の制約・
  「なぜこの機能が無いのか」は、API 一覧より前に読ませる
- **バッジ**（CI・ライセンス・対応ランタイム・依存の有無）。装飾ではなく、初めて来た人が
  1秒で「生きているか」「自分の環境で動くか」を判断する材料
- **維持方針を明記する。** バージョンが 0.x なら API が変わりうること、どの程度対応するか。
  書かないと暗黙に無制限のサポートを約束したように読まれる。書いておくほうが誠実で、
  対応できないときの後ろめたさも減る
- **「成功しても保証しないこと」を書く。** 免責の定型文だけでなく、その分野で誤解されやすい
  ことを具体的に。推測せず拒否する設計なら、保証しているのは「拒否すること」であって
  「正しいこと」ではない、という区別まで書く
- **文書と CI が矛盾していないか。** 「こう直せ」と書いてある手順を実行すると CI が落ちる、
  という状態は不具合。同じファイルの中で起きていることがある

ブランチ保護を入れる場合（**公開・非公開に関係なく効く**。無料プランでは public でないと
使えないという制約はあるが、下の内容自体は可視性と無関係）:

- **有効にする前に、生成物をコミットするワークフローがないか確認する。**
  required status checks と enforce_admins は github-actions bot の直 push も拒否し、
  プランによっては特定アクターの除外ができない。衝突する場合は、push 失敗を warning と
  artifact への案内に degrade させるなど、保護と両立する経路を先に用意しておく
- **`GITHUB_TOKEN` で PR を作るワークフローも確認する。** 「Allow GitHub Actions to
  create and approve pull requests」は**既定でオフ**で、オフだと `gh pr create` は
  `GitHub Actions is not permitted to create or approve pull requests` で落ちる。
  保護を入れると「main へ直 push」という逃げ道が同時に消えるので、**このオフと保護が
  組み合わさって初めて詰む**。確認は
  `gh api repos/O/R/actions/permissions/workflow --jq .can_approve_pull_request_reviews`。
  データ更新のような定期ジョブでは、push まで済んでいるなら PR 作成の失敗で全体を
  落とさず、PR を開くリンク付きの warning に degrade するほうがよい——**成功した更新を
  失敗として報告しない**ため
- **required status checks には「すべての PR で必ず起動するチェック」だけを入れる。**
  `paths:` フィルタ付きのワークフローを required にすると、そのパスに触らない PR で
  ジョブがそもそも作られず、**「Expected — waiting for status」のまま永久にマージ
  できなくなる**。落ちるのではなく永遠に始まらないので、原因が見えにくい。
  チェック名は job id ではなく**実物の check-run 名**で書く（matrix があれば
  `test (20)`、`name:` を付けていれば展開後の文字列）。推測で書くと同じ症状になる
- **`strict`（マージ前に base に追いついていること）は既定で有効にしない。** 有効だと、
  PR を1本マージするたびに同じリポジトリの他の open PR 全部が更新待ちになる。1人で
  回している間はほぼ手間だけが増える。CI が main への push でも走る構成なら、
  取りこぼしはそちらで赤くなる
- **`required_approving_review_count` は1人運用なら 0 にする。** 自分の PR は自分で
  承認できないので、1 にすると全 PR が恒久的にマージ不能になる。0 でも「PR を経由する
  こと」自体は強制される

npm パッケージを公開する場合:

- `npx @arethetypeswrong/cli <tarball>` で型解決が4項目すべて緑になること
- `npm pack --dry-run` で公開されるファイル一覧を目視する
- ビルド成果物から実際に `require()` と `import` の両方で読み込めること
- README に出典・ライセンス表記、サポート範囲、免責が書かれていること
- **パッケージ名は公開後に変えられない。** unpublish は72時間かつ依存者ゼロのときだけで、
  バージョンは二度と再利用できない。名前は RFP の段階で決め切る（`RFP.template.md`）。
  公開直前は、名前を見直せる最後の機会であって、見直す場所ではない
- **同梱データを持つパッケージは、そのデータを生成する経路を実物で通してから公開する。**
  データが中身のすべてなので、生成が一度も検証されていないまま公開するのは、
  確かめていないものを恒久的なレジストリに置くことになる
- **CI から publish するトークンは、npm の「Bypass two-factor authentication (2FA)」に
  チェックを入れて作る。** 入っていないと publish のたびに OTP を要求され（`EOTP`）、
  CI には渡す手段がない。**既存トークンの Regenerate では設定は変わらない**ので、
  作り直しになる。npm は classic と granular のトークン作成フォームを統合済みで、
  「Automation タイプを選ぶ」という古い手順はもう存在しない
- **rc（prerelease）は、新規の名前に対しては何も守らない。** レジストリは
  **初回公開時に `latest` を必ず作る**——`--tag next` を付けていても、他に向ける先が
  無いので `latest` もその版を指す。`latest` タグは削除できず、直す手段は本番版を
  publish することだけ。rc に意味があるのは「publish 経路のリハーサル」としてであって、
  `npm install` を守る用途ではない。**そこを期待して rc を挟むなら、挟まずに本番版を
  出したほうがいい**（バージョンを1つ節約できる）
- **`^x.y.z` は `x.y.z-rc.N` を満たさない。** semver の仕様で、prerelease は
  同じ [major,minor,patch] に prerelease を持つ範囲としか一致しない。依存や peer に
  caret を書いていると、**rc のパッケージ群が同時にインストールできず、rc を出した
  意味そのものが消える**。prerelease を受け入れる範囲は `^x.y.z-0` と書く
- **provenance を付けるなら `--access public` を明示する。** レジストリがまだ知らない
  名前に対して、npm は access が明示されていないと attestation を作らず `EUSAGE`
  （`Can't generate provenance for new or private package`）で落ちる。スコープ無しの
  パッケージは既定で public なのでフラグは冗長に見えるが、**「既定で public」は
  「明示的に public」ではない**。初回の本番タグ push が実際にこれで落ちた。
  `package.json` の `publishConfig.access` も併せて置く（手動 publish を同じ挙動にするため）
- **npm の trusted publishing（トークンレス OIDC）は、パッケージが存在しないと
  設定できない。** 初回だけはトークンで publish するしかなく、移行はそのあと。
  期限を切ったトークンを作り、公開後に移行して消すのが現実的な順序
- **trusted publishing は npm 11.5.1 以上を要求する。GitHub ランナーの同梱 npm では
  足りない。** Node 22 ランナーの実測は **10.9.8**。何もしなければ publish の直前で
  認証エラーになり、**そのメッセージはバージョンについて何も言わない**。
  `npm install -g npm@latest` してから版を突き合わせて落とすステップを publish より前に置く。
  それは **dry run で実行される唯一の OIDC 関連部分**でもある。さらに、あとから
  `setup-node` を走らせ直すと npm が戻りうる（tool cache 上の同じ Node を選び直す限りは
  上書きが残るが、別バージョンを選べば同梱版に戻る）。**publish 直前の npm の版を
  ログで確認する**——別ランタイムでスモークテストする構成では、途中で一度下がる
- **publish 経路を変えても、次の新しいバージョンが出るまで検証できない。**
  「レジストリに既にあるならスキップ」する作りのワークフローでは、同じタグを押し直しても
  publish は実行されない。dry run も `npm publish` に到達しない。**切り替えの検証は
  次のリリースまで持ち越しになるので、それまで戻り先（旧トークンなど）を消さない**

HTTP API を公開する場合:

- 不正な入力（壊れたURLエスケープ、型違い、範囲外、欠落パラメータ）が
  4xx を返すこと。500 はサーバの不具合を意味するので、クライアント起因で出してはいけない
- キャッシュヘッダが、返した値の確からしさと一致していること
- HEAD が GET と同じように扱われること
<!-- END dev-standards common -->
