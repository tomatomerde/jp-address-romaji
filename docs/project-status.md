# プロジェクトの現状

プロジェクトが今どこにあるか、最初のリリースまでに何が残っているか、そして作業した人が実際に
つまずいた点は何か。新しい貢献者でも、間を置いて戻ってきたメンテナでも、文脈を再構築せずに
着手できるよう、常に最新に保つ。

コードの触り方は [`CONTRIBUTING.md`](../CONTRIBUTING.md) を参照。リリース手順そのものは
[`releasing.md`](./releasing.md) を参照。

## 現在の状態

**公開済み。** `jp-address-romaji` と `jp-address-romaji-data` は両方とも npm に公開されている。
最新は `0.1.3`（2026-08-13、公開後レビューで見つかった不具合の修正 — 自治体名の衝突を先勝ちで
誤解決する不具合、長音スタイル指定時に翻字不能文字の検証がバイパスされる不具合、郵便番号抽出の
前方境界欠如、丁目あり/なし併存町での先頭数字の黙示解釈など。内容は CHANGELOG を参照）。
`0.1.0` は 2026-08-10、`0.1.1`・`0.1.2` は 2026-08-12 リリースで、いずれも npm の provenance
attestation 付き。`0.1.0-rc.1` は `0.1.0` の数時間前にリハーサルとして `next` dist-tag で
公開した — それが捉えた3件は CHANGELOG を参照。

`v0.1.2` のタグと GitHub Release も揃っている（2026-08-12）。ここは一度ちぐはぐになった:
publish は `workflow_dispatch`（run `31616749939`）で通ったのに、**タグ push がセッションの
資格情報では 403 になる**ため、publish 済みなのにタグだけ無い状態で数時間残った。
メンテナがリリース画面からタグごと作って解消し、そのとき走った run（`31652490400`）は
公開済みバージョンを `npm view` で、既存 Release を `gh release view` でスキップして緑で
終わっている。

**この 403 は毎回のリリースで必ず起きるので、タグ push はリリースの必須手順から外した。**
`release.yml` を `cut_release: true` で dispatch すれば、タグと GitHub Release まで
ワークフローが作る（`releasing.md`「リリースを切る」）。タグ push も従来どおり使える。

**`0.1.4` の作業がこのブランチで進行中——まだリリースはしていない。** 中心は、丁目の先にある
名前つき koaza（小字）を `toRomaji` が黙って落として別住所を返していた重大な不具合の修正で、
`0.1.0`〜`0.1.3` すべてに存在していた。これで前回のこの節が「未修正」として挙げていた5件は
すべて解消し、変換の中核以外（データ読み込み・公開 API の補助関数・入口の振り分け・リリース
経路）を読み直して新たに見つかった6件も直した。詳細は下の「公開後レビューで見つかった不具合」と
CHANGELOG の `0.1.4` の項を参照。`package.json` のバージョンは `0.1.4` に上がっているが、
タグ push・npm publish はまだ実行していない——実行したらこの段落を書き換えること。

完了済み:

- `toRomaji` / `fromRomaji` / `parse` / `toFormat`。失敗は throw ではなく型付きの値として
  返す
- 京都の通り名住所: 通り名の句を正規化の前に切り出し、原文のまま保持し、決してローマ字化
  しない
- `fromRomaji` の `postalCodeIndex` フック。呼び出し側が自前の郵便番号データで曖昧さを絞り込める
- オフライン保証。`fetch` を throw するスタブに置き換えるテストで強制している
- テスト 100 件がパス。加えて実データセットがあるときだけ走るテストが 5 件
- CI（lint・typecheck・build・test）とデータ更新ワークフロー
- 両パッケージの README、CHANGELOG、そして完全なデータセットなしにデータパッケージの公開を
  拒否する `prepublishOnly` ガード

`main` は上記すべてを含む。

## 公開後レビューで見つかった不具合（0.1.4 で解消）

以前この節に残っていた5件は、このブランチですべて直った——最重要だった丁目の先の小字（koaza）の
消失を含め、修正の裏付けとなる回帰テストも添えて。加えて、変換の中核以外を一通り読み直したところ
新たに6件見つかり、同じブランチで直した。実データ（`JP_ADDRESS_ROMAJI_DATA_DIR` 経由）に対して
再現・修正確認済み。内容は CHANGELOG の `0.1.4` の項とコミット履歴を参照。重要度順。

### 最重要だったもの: 丁目の先の小字（koaza）が順方向で黙って消え、別の住所になる

```text
toRomaji('長野県飯田市本町三丁目大横1-1', {})
  → 修正前: ok=true "1-1 Hommachi, Iida-shi, Nagano, Japan"          （三丁目大横 が消えている）
  → 修正後: ok=true "1-1 Sanchomeoyoko Hommachi, Iida-shi, Nagano, Japan"
```

原因は `packages/core/src/normalizer.ts` の `normalizeJapanese`。上流の正規化結果は
`oaza_cho: "本町"` と `koaza: "三丁目大横"` を別フィールドで返すが、`koaza` を町名や
`unparsed` のどちらにも一切添付していなかった。唯一 koaza を拾っていた `recoverKoazaNumber` は
koaza が `^([0-9]+)(丁目|番町|...)$` の形（純粋な数字+接尾辞）のときだけ動くもので、
`"三丁目大横"` のような名前つきの koaza はどこにも現れないまま捨てられていた。

コミット `50e60a4` で、名前つきの koaza を、データセットの読みが名前全体を覆っていることを
検証できたときだけローマ字化し、新設した `parsed.koaza` に出すようにした。検証できないときは
`KOAZA_READING_INCOMPLETE` を返し、切り詰めた読みを推測で出すことはない。続くコミット
`a1294b7` で、その検証（位置漢字ごとに読みを1つに固定していた）が `府中`・`山中`・`坂上` などの
ごく普通の地名を大量に誤って拒否していたのを直した——読みを持つ漢字は複数の読みを持ちうるため、
1つに固定した表は狭すぎた。

実データでの内訳（`scripts/verify-data-assumptions.ts` の assumption 6/6b、Actions run
31788640706）は CLAUDE.md の「データの実情」と CHANGELOG の `0.1.4` の項に記録した。逆方向
（`fromRomaji`）は koaza を復元しない——koaza 専用の索引を持たないという意図的なスコープ判断で、
`packages/core/test/fixtures-koaza/README.md` に記録がある。往復の不変条件（同一か明示的失敗の
いずれか）は保たれる。

`roundtrip.test.ts` はこの不具合を構造的に見逃していた: 生成する入力が
`都道府県+市区町村+町+丁目+"1-1"` の形に固定されており、koaza を一度も含んでいなかったためで
ある。同じ構造で koaza を含む姉妹テスト（`packages/core/test/koazaRoundtrip.test.ts`）を足した
——この節が存在する理由そのものの教訓: テストのカバー範囲がテストの主張の外側にある不具合は、
当然すり抜ける。

### 順方向と逆方向が食い違っていた3件（コミット `6c4720b`）

- **`longVowel: 'oh'` の市区町村名が `fromRomaji` で読み戻せなかった。** `formatMunicipality`
  は語幹（`トウベツ`）だけを oh 化し接尾辞は文字どおり `"-cho"` を付ける（→ `"Tohbetsu-cho"`）
  のに、`fromRomaji.ts` の `candidateKeys` は読み全体（`トウベツチョウ`）をまとめて oh 化して
  いた（→ `"tohbetsuchoh"`、末尾が `choh` で接尾辞を剥がせない）。索引側を、順方向が実際に
  出す綴りに合わせた。全国で少なくとも53件が同じ壊れ方をしていた（`当別町`・`共和町`・
  `蔵王町`・`遠野市` など）。
- **かな翻字でのみ一致した町の `parsed.town.romaji` が `undefined` になり、`toFormat` が
  英語宣言の住所に漢字を出していた。** `buildParsed` がマッチに使った決定的な翻字を握り
  潰していたため、romaji フィールドを持たない町（データセット全体の約1割）で
  `parsed.town.romaji` が失われていた。無いものは作らない方針は保ったまま、あるものは
  捨てないようにした。
- **接尾辞の読みを推測していた。** romaji フィールドが欠けたとき `spec.romaji[0]` に
  倒していたため、`出雲崎町`（イズモザキマチ）が `Izumozaki-cho` になりうる状態だった。
  かなの末尾に読みがあるので、そちらを先に見るようにした。

同じコミットで、かな側が数字・romaji 側が単語で食い違う17件（`前郷一番町`・`北兵村一区` など）
を、長音スタイル指定時に型付きの失敗にした。`longVowel: 'none'` の既存出力は変えていない。

### 退行の芽2件（コミット `7d8b2ed`）

- 孤立した長音符（`ー`）が翻字不能として拒否されず黙って脱落していた
  （`kanaToRomaji('ーア', 'none')` → `"a"`）。既存の翻字可否判定 `isTransliterableKana` に
  寄せて拒否するようにした。
- `kyoto.ts` の `DIRECTION` に `東入る|西入る` が重複していた（マッチ結果には影響しない無害な
  重複だったが、通り名の切り出しは丁目の誤読を防ぐ要——CLAUDE.md の地雷を参照——なので、
  読んで分かる状態に直した）。

### 誰も見ていなかった領域を読み直して見つかった6件（コミット `357298f`）

これまでのレビューは変換の中核（`toRomaji` / `fromRomaji` / ローマ字化）に集中しており、その
周辺——データ読み込み、公開 API の補助関数、入口の振り分け、リリース経路——は一度も通して
読まれていなかった。読ませたところ6件出た:

- `configureDataSource({ endpoint })` に `dataDir` のつもりでパスを渡すと、変換の両方向が
  値を検証しないまま `TypeError` を投げていた——「失敗は例外ではなく値」という方針を破る
  唯一の経路だった。既存の `DATA_NOT_CONFIGURED` に落ちるようにした。
- `kanjiToNumber`（公開 API）が文法外の入力に対して `undefined` ではなく**別の数**を返して
  いた（`十百` → 110、`一二` → 2）。`numberToKanji` が出す形だけを受け付ける文法に書き直した。
- `parse()` が日本語文字を1つでも含めば `toRomaji` に送っていたため、**自分自身の出力**
  （日本語の建物名を含む romaji 住所）を読み戻せなかった。末尾セグメントが47都道府県のいずれかを
  名乗るかで振り分けるようにした。
- oh 表記の都道府県に接尾辞が付くと `fromRomaji` が拒否していた（`Ohsaka-fu` など）。
- 逆方向のデータキャッシュに上限が無く、全国を引くと約1,899ファイルを持ち続けていた。LRU・
  既定500件の上限を設けた。
- `release.yml` が自由入力の `concurrency` を `run:` に直接展開していた。`id-token: write` を
  持つ唯一のジョブだったので `env:` 経由にした。

同じ読み直しでさらに3件見つかったが、こちらは直していない。低リスクと判断して見送った理由
付きで「既知のギャップ」節に記録した——`formats/index.ts` の
`prefecture?.romaji ?? prefecture?.ja` フォールバック、`build-data.ts` の引数パーサ、
`script.ts` の日本語検出正規表現。詳細は下の「既知のギャップ」を参照。

## `NPM_TOKEN` は削除済み（2026-08-12）

Trusted publishing は実リリース（`v0.1.1`、2026-08-12）で実証され、トークンを残す唯一の理由 —
OIDC 交換が失敗したときのロールバック — が消えた。使われない長寿命の publish 資格情報を
持ち続けるのは持たないより悪いので、消した。

**メンテナの報告として完了**。メンテナが3つのリポジトリで `gh secret delete NPM_TOKEN` を実行し、
npmjs.com 上でトークン自体も失効させた。セッションは secret 一覧を読み書きできないため、
ここから実物に対して確認したわけではない — 下に記録した `DEV_STANDARDS_TOKEN` の削除と
同じ留保が付く。

3つのリポジトリのいずれでも `release.yml` は `NPM_TOKEN` を参照していないので、削除がリリースを
壊すことはない。閉じられるのは、ワークフローを編集せずにトークン認証へフォールバックする道 —
そのフォールバックこそ引退させる対象なので、意図どおり。**公開は今後、npmjs.com 上の trusted
publisher 登録に全面的に依存する**（publisher は *GitHub Actions*、このリポジトリ、workflow
ファイル名 `release.yml`、environment 名は空）。この登録が削除されるか workflow ファイルが
リネームされると、フォールバックできる資格情報はもう存在せず、復旧するまでリリースは止まる。

## このリポジトリは 2026-08-07 に作り直された — 履歴中の `#N` はこのリポジトリのものではない

公開前に、5つのコミットから個人のメールアドレスを除去するため履歴を整理した。force push では
それはできない: GitHub は `refs/pull/*/head` を通じて古いコミットを生かし続ける。そこで旧
リポジトリを削除して空のリポジトリを作り、書き換えた `main` だけを push した。コードは 1 バイトも
変わっていない — 31 コミットすべてが以前と同じ tree を持ち、`HEAD` の tree は今も `ed79683` の
まま。

副作用として、**コミットメッセージに引用されている pull request 番号（`#1`〜`#4`、`#8`）は、
もう存在しないリポジトリのもの**になった。このリポジトリの pull request はゼロから始まる。
GitHub はコミットメッセージ中の `#N` を自動リンクするため、それらのリンクは今日 404 になる —
そしてこのリポジトリで pull request が開かれた瞬間、旧 `#1` は無関係な PR を指し始める。
そちらのほうが悪い失敗だ: 404 は自分から名乗るが、間違ったリンクは名乗らない。履歴は番号では
なくコミットの件名で辿ること。（`.md` ファイル内の参照は自動リンクされないので、ここの文章が
惑わせるのは、わざわざ探しに行った読者だけで済む。）

## 作業を止めた地点（2026-08-07）

このリポジトリの作業は一時停止中。仕掛かりは何もない: `main`、作業ブランチ、それぞれのリモートは
すべて同じコミットを指し、stash も未コミットの変更もなく、`main` の CI は緑。プロジェクトは
「機能完成」と「リリース済み」の間にあり、残っているものはすべて、作業セッションが持たない
資格情報かリポジトリ管理権限を必要とする — だからこの停止にコストはない。

2026-08-07 に、読むのではなくコマンドを実行して再検証した（Node 22.22.2）: `pnpm lint`、
`pnpm typecheck`、`pnpm -r build`、`pnpm test` — すべてクリーン、95 passed / 5 skipped で、
下の「検証したこと・していないこと」の記録と一致する。

**`CLAUDE.md` はプロジェクト技術の内容だけを載せる（2026-08-12 以降）。** かつては後半に
もう一つの部分 — private のテンプレートリポジトリから自動同期され、ハッシュ検査
（`check-common-integrity.yml`）で検証される共通の作業方針セクション — があった。この配布は
廃止した: 作業方針の指示はメンテナ向けのツーリング設定であってプロジェクトのドキュメントでは
なく、今は private リポジトリだけに置かれている。同期マーカーのブロック、`.claude/` 配下の
ハッシュファイル、整合性検査ワークフローはすべて撤去済みで、同期しておくべきものはもう何もない。
（それ以前の歴史的経緯 — 手作業でコピーしたブロックを、リポジトリごとのトークン
`DEV_STANDARDS_TOKEN` 経由で比較する仕組み — も同様にとうの昔に無い。）

本当に未完なのはライブラリではなくリリースの道筋:

- リポジトリは **2026-08-10 に public 化**され、それに伴い npm provenance も有効になった —
  無効にしてあったのは、npm が public なソースリポジトリを要求するという理由だけ。
  `release.yml` は `id-token: write` を要求する。`--provenance` フラグは無くなった。trusted
  publishing が attestation を自前で発行するため。
- **Branch protection は有効**（2026-08-10）。`main` への直接 push は拒否され、変更は `test`
  チェックの通過が必要な pull request を経由する。`enforce_admins` が有効なので、これはオーナー
  にも適用される — 自分のブロックを外すのは `--force` ではなく設定変更になる。
  `required_approving_review_count` が 0 なのは、ソロメンテナは自分の pull request を承認できず、
  1 にするとすべての PR が永久にマージ不能になるため。

  自明なデフォルトに逆らって選んだ設定が2つ:

  - **`strict: false`**（マージにあたりブランチが `main` に追随している必要はない）。
    `strict: true` だと、どれか1つの pull request をマージするたびに、リポジトリ内の他のすべての
    open な PR を先に更新させられる。`ci.yml` は `main` への push でも走るので、意味的な衝突が
    あれば何かが赤くなる。
  - **required は `test` のみで、`test` に `paths:` フィルタはない。** 撤去済みの `integrity`
    チェックは意図的に一度も required にしなかった: あれは path フィルタ付きで、開始しない
    required チェックは pull request を「Expected — waiting for status」のまま永久に固まらせる。
    動機となったチェックは消えてもルールは生きている — path フィルタ付きのワークフローを
    required にしない。

  `Refresh address data and coverage` ワークフローはこのために既に作り込まれている:
  `docs/coverage.md` の push が拒否されると、その実行の artifact を指す警告に格下げされる。
- **ワークフローは 2026-08-10 に npm trusted publishing へ移行**し、トークンを一切持たない。
  両パッケージに trusted publisher を登録済み（リポジトリ + `release.yml`、environment なし）。
  これは `0.1.0` が存在する前にはできなかった（npm/cli#8544）。
- **OIDC は実証済みで、`NPM_TOKEN` は消えた。** `v0.1.1`（run `31558139492`、2026-08-12）は
  trusted publishing 経由で両パッケージを公開した。それぞれ GitHub Actions から署名された
  provenance statement を伴い、ジョブに npm の資格情報は無かった。これがトークン交換の最初の
  実地行使で、secret を残す唯一の理由を消した。メンテナは同日にそれを削除した。上の
  *`NPM_TOKEN` は削除済み* の節を参照 — その結果としてフォールバックが無くなったものも含めて。
- Geolonia のホストはネットワーク制限された環境から到達できないため、データセットをローカルで
  ビルドすることはできない。実データに触る手段は `Refresh address data and coverage`
  ワークフロー。

  **2026-08-09 に dispatch して検証済み**: データセットはビルドされ（12,026,285 バイト、1,899
  ファイル）、前提チェックは通り、スイートは実データに対して緑 — 6 ファイル、**100 tests
  passed**、他所ではスキップされる `realdata.test.ts` の 5 件を含む。ラウンドトリップテストは
  実住所 4,303 件に対して `mismatched: 0` を報告した: *別の*住所として返ってきたものは皆無。
  ラウンドトリップしなかった 2,213 件はすべて型付きの拒否（2,206 `NO_ROMAJI_DATA`、
  1 `CORRUPT_ROMAJI_DATA`、6 `AMBIGUOUS`）で、これは設計どおりの挙動。

## リリースのタグ付け

`.github/workflows/release.yml` が npm へ公開する。タグ駆動で、`workflow_dispatch` も使える。
dry run 用と、片方のパッケージだけ公開して止まったリリースの復旧用。

| タグ | 公開対象 |
| --- | --- |
| `v1.2.3` | 両パッケージ、data が先 |
| `data-v1.2.3` | `jp-address-romaji-data` のみ |
| `core-v1.2.3` | `jp-address-romaji` のみ |

スコープ付きタグがあるのは、ライブラリ本体が変わらなくても、上流データが変わればデータセットの
正しさが変わるから。バージョンガードはタグが選ぶパッケージだけを検査するので、`data-v*` の
リリースが、core のバージョンが違うというだけの理由で落ちることはない。

## メンテナ向け runbook: 一度きりのリポジトリセットアップ

これらにはリポジトリの管理者権限が要る。順序が重要: 無料プランでは branch protection は
public リポジトリでしか使えないため、protection の呼び出しが成功するには先に可視性を変えて
おく必要がある。

```sh
gh repo edit tomatomerde/jp-address-romaji \
  --visibility public --accept-visibility-change-consequences
gh repo edit tomatomerde/jp-address-romaji --default-branch main

gh api -X PUT repos/tomatomerde/jp-address-romaji/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": false, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# DEV_STANDARDS_TOKEN is obsolete — delete it if it is still there.
gh secret delete DEV_STANDARDS_TOKEN --repo tomatomerde/jp-address-romaji
```

各フィールドの根拠は上の「リリースの道筋」の一覧にある。これを別のリポジトリに適用することが
あるなら、コピーではなく導出し直すべき点が一つ: **`contexts` に列挙してよいのは、すべての
pull request で走るチェックだけ。** ここではそれは `test` 単独 — path フィルタ付きのチェック
（撤去済みの `integrity` のような）は、その paths に触れない pull request を固まらせる。

2つの `gh repo edit` と protection の呼び出しはすでに実施済みなので、このブロックは今日では
no-op。それでも残すのは、リポジトリをいつか作り直す場合に、ここに符号化された順序が今も
意味を持つから（無料プランでは branch protection は public リポジトリでしか使えない）。

`NPM_TOKEN` はもうセットアップの一部ではない — ワークフローは trusted publishing で認証する
ので、このリポジトリを新しく clone しても npm の secret は一切要らない。代わりに必要なのは
**各パッケージについて npmjs.com に登録された trusted publisher**: publisher は *GitHub
Actions*、このリポジトリ、workflow ファイル名 `release.yml`、environment 名は空。表は
`docs/releasing.md` にある。

この段落がかつて与えていた助言 — 「`NPM_TOKEN` は **Automation** トークンでなければならない」—
は誤りだったので撤回する。npm は classic と granular のトークン作成を1つのフォームに統合して
おり、選ぶべき Automation という種別は存在しない。トークンが CI から publish できるかを決める
フィールドは **Bypass two-factor authentication (2FA)** チェックボックスで、既存トークンの
再生成ではこれは変わらない。これが今も関係するのはローカルからの publish だけ — それは CI
経由ではなくアカウントとして認証する。ワークフローはトークンを一切必要としない。

`DEV_STANDARDS_TOKEN` は**もう使われていない**ので、削除すべき。これはリポジトリごとのジョブが
private のテンプレートを読むために存在したが、共通ブロックは今やここにコミットされたハッシュに
対して検証され、secret もネットワークも要らない。これが置き換えたトークンはスケジュールどおり
失効して、あるプロジェクトの CI を巻き添えで赤にした — その故障モードは先送りではなく消滅した。

`main` を保護したことの帰結として意識しておくこと: required status checks は、チェックを通って
いないコミットの**直接** push を拒否し、無料の個人プランではどのアクターも除外できない。
`Refresh address data and coverage` ワークフローはまさにそういう push で `docs/coverage.md` を
コミットし返すので、protection が有効になって以降、そのステップは実行の `reports` artifact を
指す警告に格下げされる — 再生成したレポートは代わりに pull request 経由でコミットすること。
ビルド、前提チェック、artifact には影響しない。

## リリース

`0.1.0-rc.1` は 2026-08-10 に公開され、`0.1.0` が同日後を追った。両パッケージとも npm 上にある。
手順と、release candidate が守ってくれること・くれないことは [`releasing.md`](./releasing.md)
を参照 — 特に、**ある名前へ最初に公開されたバージョンは `--tag` に関係なく `latest` になる**
こと。rc が `npm install` をクリーンに保てず、0.1.0 を即座に続けなければならなかった理由が
これ。

次のリリースでは: バージョンを上げ、CHANGELOG の見出しに日付を入れ、タグを push する。見出しが
`unreleased` のままだとワークフローは公開を拒否する。まず `dry_run: true` で dispatch して
結果を読むこと — このワークフローの最初の実 dry run は失敗した（「落とし穴」の SIGPIPE の項を
参照）。過去の緑の実行は、現在のコミットについての証拠にはならない。

## 検証したこと・していないこと

読むのではなく実行して検証済み:

- `pnpm pack` は `workspace:*` を実バージョンに書き換え、pack された manifest から
  `prepublishOnly` を剥がす — したがって `npm publish <tarball>` はライフサイクルスクリプトを
  **一切**実行しない。`check:publishable` が明示的なワークフローステップである理由がこれ
- `files` は `.gitignore` に優先するので、gitignore されている `dist/` と `data/` は tarball に
  ちゃんと入る。これが最大の懸念だった故障モードで、実在しない — それでもワークフローは pack
  されたバイトに対して assert する。今日の構成が持つ性質にすぎないから
- `@arethetypeswrong/cli --profile esm-only` は 0 で exit する
- タグ解析は `v0.1.0` / `data-v0.2.0` / `core-v0.3.0` / `v1.2.3-beta.1` を受理し、
  `garbage` / `vNext` / `data-vX` / `v-` を拒否する
- CHANGELOG ガードは `unreleased` 見出しで落ち、日付入りの見出しで通る
- tarball の assert は municipality ファイル数が閾値を下回ると落ちる
- ESLint は `.ts` ファイルの未使用変数と `.mjs` ファイルの未定義参照を捕まえ、両方を戻すと通る
- `pnpm lint && pnpm typecheck && pnpm -r build && pnpm test` — 95 passed, 5 skipped（最終
  再実行 2026-08-07、Node 22.22.2）。重要なのはルートの `pnpm typecheck` のほう:
  `pnpm -r typecheck` だけではテストファイル・`scripts/`・`vitest.config.ts` が検査されない —
  下の「落とし穴」を参照

**`release.yml` は GitHub Actions 上で実行済み。** 2026-08-10 に `workflow_dispatch` の dry run
を 2 回、`packages: both` で:

- **1回目は失敗**。場所は `Assert data tarball contents` で、失敗していたのはパッケージではなく
  チェックの側 — 「落とし穴」の SIGPIPE の項を参照。それより前はすべて通った: データセットの
  ビルド、前提の維持、typecheck、build、`check:publishable`、実データに対するフルスイート、
  両方の `pnpm pack`。
- **修正後の2回目は最初から最後まで緑** — 両方の packed tarball への
  `@arethetypeswrong/cli --profile esm-only`、import のスモークテスト、dry-run の publish 経路を
  含む。Run
  [31372054290](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31372054290)。

これは packing 経路が実データセットに対して行使された最初の機会で、普通のパッケージ以上に
ここでは重要: データセット*こそ*が data パッケージの中身だから。

**タグ駆動の経路も実運用で実行済み**（`v0.1.0-rc.1`、続いて `v0.1.0`、2026-08-10）。これで
`npm publish`、provenance attestation、GitHub Release、タグ形状のバージョンガード、CHANGELOG の
日付ガード — `workflow_dispatch` 実行が設計上スキップするものすべて — がカバーされた。

その後、ワークフローの外側から、実行ログではなくレジストリに対して検証済み:

- `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@0.1.0-rc.1` が両パッケージについて
  `publish` と `provenance` を列挙する
- `v0.1.0-rc.1` の GitHub Release 本文は rc セクションのみ 12 行で、`0.1.0` セクションからの
  混入なし — フィールド全体で照合する CHANGELOG マッチャが仕事をした
- `npm view <pkg> dist-tags` — ここで2つの想定が壊れた。CHANGELOG の `0.1.0-rc.1` の項と
  `releasing.md` の *Release candidates* を参照

**Trusted publishing への切り替え後に3回目の dry run を実施**（run
[31402994984](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31402994984)、
2026-08-10、マージコミット上）。最初から最後まで緑。これが実際に証明するものは狭いが、それこそ
走らせた目的だった: `Ensure npm supports trusted publishing` ガードが実 runner 上で機能する
こと。`setup-node` 由来の **npm 10.9.8** — trusted publishing の下限 11.5.1 未満 — を計測し、
アップグレード後は 12.0.2 だった。このステップがなければパイプラインは `npm publish` まで到達
し、バージョンを名指ししない認証エラーで落ちていた。

**今や検証済み: OIDC での publish。** あの dry run では決着できなかった — 両方の publish
ステップが `… is already on npm; skipping.` と印字したからで、これは「テストのために `v0.1.0`
を push し直せばいいのでは」への答えでもある: 駄目。最初の実地行使は次のバージョンアップで、
それは起きた — **`v0.1.1`、2026-08-12**（run
[31558139492](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31558139492)）が
`jp-address-romaji-data`、続いて `jp-address-romaji` を公開し、それぞれ `Signed provenance statement
with source and build information from GitHub Actions` と sigstore の transparency-log エントリを
印字した。publish ステップの時点で `npm 12.0.2` が入っていた。

**データセットのダウンロードは一過性の失敗に耐えるようになり、それはテストされている**
（2026-08-12）。以前は耐えられなかった: 約 1,899 のうち 1 municipality の失敗が
`process.exitCode = 1` を立て、リリースを道連れにした。修正の前に再現した。単一の municipality
に 503 を 3 回返すローカルサーバで — exit 1、その municipality のファイルは欠落。`build-data.ts`
は今、並行パスで失敗した分を後から直列に、より長い backoff で再試行し、その掃討を生き残った
ものだけがビルドを落とす。`packages/data/test/build-data.test.ts` がクリーンな実行・掃討で回復
する実行・回復しない実行をカバーし、実スクリプトを fixture サーバに対してサブプロセスとして
駆動する。各 assert は、それが守るコードを壊して確かめた: 掃討を無効にすると回復テストが落ち、
生き残りを握りつぶすと exit code のテストが落ちる。

これを書いたことで出てきたものが2つ。どちらもファイルが書かれて以来ずっと潜伏していた:

- **数値でない、またはゼロの `--concurrency` は、黙って空のデータセットを生んでいた。** worker
  プールに `NaN` のまま届き、`Math.min(NaN, n)` がプールサイズをゼロにし、municipality は一つも
  取得されず、ビルドは "Done. 0 towns across 1899 municipalities" と印字して **exit 0** した。
  変更前のスクリプトを両方の与え方で実行して確認済み。数値オプション3つはすべて、正の整数と
  して解釈できなければ拒否されるようになり、さらにビルドは municipality ごとに1ファイル書けて
  いなければ exit 0 を拒否する。
- **`build-data.ts` にはテストが一つも無かった** — data パッケージの中身全体を生み出す
  スクリプトなのに。`packages/data/test/` は存在しなかった。

**スコープ付きタグの形状は 2026-08-11 にローカルで、レジストリの手前まで行使済み。**
`Determine release plan`、`Verify tag matches package versions`、CHANGELOG ガードの各ブロックを
`yq` で `release.yml` から抽出し、この working tree に対して 7 つのタグでそのまま実行した:
`v0.1.0`・`data-v0.1.0`・`core-v0.1.0` は正しいスコープを選んで通る。`data-v0.2.0` と
`core-v0.1.1` は、タグが選ぶパッケージだけを名指しするバージョンガードで落ちる。`vgarbage` と
`data-vX` は認識されない形状として拒否される。これがカバー**しない**のは `data-v*` 実行の残り —
packing、tarball の assert、そして2パッケージの片方だけが動く publish。それらは実際のスコープ
付きリリースを待っている。

**publish の直前に2つ目の npm バージョン assert が走るようになった**
（`scripts/assert-npm-version.sh`、姉妹リポジトリとバイト単位で同一の共有）。このワークフローは
アップグレード後に `actions/setup-node` を再実行しないので、これは現存する欠陥の修正ではなく、
それが変わることへのガード — 最古のサポートランタイムでのスモークテストのために Node を切り
替える姉妹ワークフローこそ、これが本領を発揮する場所。スクリプトは 11.5.1 境界の両側をスタブの
`npm` で確認した（11.5.0 は落ち、11.5.1 は通る）。

## 解決済み（2026-08-11）: 2つの曖昧さの数値が食い違い、どちらも古かった

README は同じ量に対して 0.95% と 1.23% を掲げていた。どちらも手法まで遡れず、どちらも出荷中の
データセットと出荷中のマッチャに対して再現しない。`jp-address-romaji-data@0.1.0` を npm
レジストリからダウンロードし、マッチャ自身のキー関数で測定して決着した — まさにこのために
追加した `scripts/measure-ambiguity.ts` により、数値は考古学ではなく再現可能になった:

- `fromRomaji` がインデックスするローマ字化キー（完全形と stem 化した短縮形）の **1.07%**
  （2,780/259,703）が、同一 municipality 内の 2 つ以上の異なる town に対応する。関与する town は
  4,871（3.74%）。
- 完全形キーでは **0.67%**（1,406/211,041、town 2,622）— 完全な town 名でも解決できない残余で、
  KEN_ALL のトレードオフが実際に依拠しているのはこちらの数値。

上の数値は **0.1.3 で測り直したもの**。`isTransliterableKana` が数字を許容するようになり、
索引されるキーの母集団が変わったため（旧値は 1.10% / 0.69%）。**この種の数値を引用する箇所を
増やすなら、必ず `scripts/measure-ambiguity.ts` の出力から取ること**——実装が変われば数値も
動くので、手で書き写した値はいずれ嘘になる。

手法のマトリクス（name/record での dedupe × plausibility フィルタ on/off × 母音スタイル ×
stem）を回して、歴史的な 0.95/1.23 を再現する変種があるか確かめた。無かった — 最も近くて
0.91% と 1.40% で、つまり古い数値は両方ともキーのロジックの旧版に属していた。転記ミスのリスクは
構造的に閉じた: `candidateKeys`/`stemKey` を `fromRomaji.ts` から export し、スクリプトは
コピーではなく import する。

## 既知のギャップ

これらはいずれも検討のうえ意図的に先送りしたもので、見落としではない — したがってどれかを
閉じる変更は、機構を足すだけでなく、トレードオフがなぜ動いたかを述べるべき。貢献歓迎:

- **CI は Node 22 しかテストしていないのに、`engines` は `>=18` と言っている。**
  「Node 18 で動く」は現状、パッケージと一緒に出荷される未検証の約束。build matrix で決着する。
- CI に `permissions:` ブロックがなく、`GITHUB_TOKEN` はデフォルトスコープで走る
- pull request 中のブランチでは CI が二重に走る（`push: ['**']` と `pull_request` の両方が
  発火する）
- issue・pull-request のテンプレート、`SECURITY.md`、`CODEOWNERS`、依存更新の自動化がない
- **`formats/index.ts` の `toFormat` にある `parsed.prefecture?.romaji ?? parsed.prefecture?.ja`
  フォールバック。** ライブラリ自身が作る `ParsedAddress` は `prefecture.romaji` を必ず持つため
  実質到達しない。到達しうるのは呼び出し側が `romaji` を入れずに自分で組み立てた
  `ParsedAddress` を `toFormat` に渡した場合だけで、そのときだけ漢字の県名が紛れ込みうる。
  `streetOf` の `koaza` 側にはあえて同種のフォールバックを足さなかった（`parsed.koaza` は
  検証済みの romaji しか持たない設計のため）のと対照的な、既存の非対称。
- **`build-data.ts` の引数パーサ（`parseArgs`）が、未知/誤字のフラグを黙って無視し、値を渡し
  忘れたフラグに次のトークンを吸わせる。** `--conurrency 8`（打ち間違い）は黙って既定値に
  フォールバックし、値の無い `--out --concurrency 5` は `--out` の値として文字列
  `"--concurrency"` を読んでしまう。
- **`script.ts` の日本語検出用正規表現が CJK 互換漢字（U+F900–U+FAFF）と面外（BMP 外）の漢字を
  含まない。** 実際にこれを踏むトリガーは見つかっていない——同梱データセットの町名・かな読みは
  この範囲に落ちない。

## 落とし穴

壊してはならない不変条件は `CONTRIBUTING.md` が扱う。ここにあるのは、実際に時間を奪った運用上の
もの:

- **`isDataConfigured()` の戻り値をテストで固定しないこと。** これは同梱の
  `jp-address-romaji-data` にフォールバックする（設定なしで動くのはそのおかげ）ので、
  `packages/data/data/` が在るかどうかで答えが変わる。そのディレクトリは gitignore された
  生成物なので、**素のチェックアウトと CI では不在、リリース経路では在る**——`release.yml` は
  テストの前にデータセットをビルドするため。`0.1.4` の
  `malformedEndpoint.test.ts` が `expect(isDataConfigured()).toBe(false)` と書いており、
  ローカルでも CI でも `Refresh address data and coverage` でも緑で、**publish を守るための
  dry run でだけ落ちた**。テストが主張すべきなのは修正の本体（不正な値を保存しないこと・
  例外を投げないこと）で、環境で変わる派生的な状態ではない。
  同じ理由で、リリース経路を通す変更を入れたときは `packages/data/data/` を用意した状態でも
  スイートを回すと早く気づける（フィクスチャを `cp -r packages/core/test/fixtures/data
  packages/data/data` で置くだけで再現できる。gitignore されているのでコミットされない）。

- **`npm publish` は semver のプレリリースでも `latest` dist-tag を動かす。** npm はプレリリース
  を特別扱いしないので、`--tag next` なしで公開された `0.1.0-rc.1` は全員がインストールする
  ものになる。両方の publish ステップはバージョンから tag を導出し（`*-*` → `next`）、run
  summary にそれを印字する。間違った dist-tag は、誰かがインストールするまで成功したリリースと
  見分けがつかないから。
- **CHANGELOG の見出しは、バージョンを行頭一致ではなくフィールド全体として照合する。** 前方
  一致の形式では `## 0.1.0` が `## 0.1.0-rc.1 — …` にも一致した。両方の見出しが一致したため
  「次の見出しで止まる」規則が一度も発火せず、抽出されたセクションはファイル末尾まで走った。
  プレリリースのセクションを足したことで露呈した。`0.1.0-rc.1`・`0.1.0`・`0.0.9` のセクションを
  持つ fixture で検証済み: 各バージョンは自分のセクションだけを選び、存在しないバージョンは
  空を返すのでガードはちゃんと落ちる。
- **GitHub Actions は `shell: bash` を `-eo pipefail` で実行する。** `count=$(... | grep -c ...)`
  はカウントがゼロのときステップを中断する — まさに、その種の assert が報告するために存在する
  ケースで。代入に `|| true` を付けることで、エラーメッセージに到達可能になる。これは
  `release.yml` に実在した欠陥で、読むのではなく実行して見つかった。
- **`pipefail` 下で `tar -tzf` を `grep -q` にパイプしてはならない。** `grep -q` は最初の
  マッチで exit し、それがパイプを閉じて `tar` を SIGPIPE で殺す。`pipefail` はそれをパイプ
  ライン全体のステータスにする。その結果、data tarball の assert は `package/data/ja.json` を
  **存在していたがゆえに欠落**と報告した — npm は `data/ja.json` を `data/ja/...` より前に
  ソートするので（`.` は 0x2E、`/` は 0x2F）、約 124 KB のリストの 1 行目でマッチし、`tar` は
  最後まで走れなかった。本当に無いエントリでも同じメッセージで落ちるので、このチェックは通る
  ことも判別することもできなかった。リストをファイルにリダイレクトして、それを `grep` する
  こと。`release.yml` の最初の実 dry run（2026-08-10）で発見 — コードは何度も読まれ、正しく
  見えていた。これは上の `grep -c` の罠の兄弟で、同じファイルの、`-c` のケースを説明する
  コメントのすぐ隣に潜んでいた。サイズ依存性に注意: core tarball の assert は同一の形をして
  いて一度も落ちなかった。そのリストは 64 KB のパイプバッファに収まるからだ。両方とも修正済み。
- **`typescript-eslint` の recommended プリセットは `no-undef` を無効化する。** これは `tsc` が
  背後にいる場所では正しく、いない場所では静かに致命的 — `eslint.config.js` が `.ts` と
  プレーン JS のファイルを別ブロックに分けている理由であり、`tsconfig.tests.json` が存在する
  理由でもある: パッケージの tsconfig は `src/` しか検査しないので、テストファイル・
  `scripts/`・`vitest.config.ts` には（ルートの `pnpm typecheck` の一部として）独自の `tsc`
  実行が要る。あの前提が成り立つのはそのおかげ。
- **`pnpm pack` は `--filter` も `-r` も受け付けない。** 各パッケージを `working-directory` で
  pack すること。
- **pnpm のバージョンはルート `package.json` の `packageManager` フィールドだけに置く。**
  `pnpm/action-setup` にも繰り返すと、アクションが起動を拒否する。
- **`packages/data/data/` は生成物で、gitignore されている。** 決してコミットしないこと。
  これのビルドを飛ばしたリリースは、インストールは普通に成功し、その後すべての変換が
  `DATA_NOT_CONFIGURED` で失敗するパッケージを生む。
