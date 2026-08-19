# プロジェクトの現状

プロジェクトが今どこにあるか、最初のリリースまでに何が残っているか、そして作業した人が実際に
つまずいた点は何か。新しい貢献者でも、間を置いて戻ってきたメンテナでも、文脈を再構築せずに
着手できるよう、常に最新に保つ。

コードの触り方は [`CONTRIBUTING.md`](../CONTRIBUTING.md) を参照。リリース手順そのものは
[`releasing.md`](./releasing.md) を参照。

## 現在の状態

**公開済み。** `jp-address-romaji` と `jp-address-romaji-data` は両方とも npm に公開されている。
最新は `jp-address-romaji` が `0.1.8`（2026-08-19）、`jp-address-romaji-data` が `0.1.5`（2026-08-14）。

`0.1.8` は**町名が部分的にしか一致しなかったときに別の住所を返していた不具合の修正**。
`東京都新宿区中井1番1号` が `"井1-1, Nakacho, Shinjuku-ku, Tokyo, Japan"` を `ok` で返していた
（`中井` は実在し、`中井1-1` と `中井一丁目1番1号` は正しく解決する）。一致そのものは上流の
仕事なので、判定は余り側に置いた——詳細は CLAUDE.md の地雷の節と CHANGELOG。
**`fromRomaji` の同型の経路は直していない**（下の「既知のギャップ」）。

`0.1.7` は**デモが見つけた不具合の修正**（イシュー #58。下の「デモページ」の節を参照）で、
2回目の `core-only` リリース（`cut_release: true` の dispatch、run `32008985284`）。

`0.1.6` は**初めての `core-only` リリース**で、`core-v*` タグの経路——CHANGELOG のスコープ付き
見出し（`## core-0.1.6`）、片方のパッケージだけの pack と publish、スコープ付きの GitHub
Release——が実運用で通ったのはこれが最初（run `31961720562`、`cut_release: true` の dispatch）。
それ以前は `0.1.5`・`0.1.4` が 2026-08-14、`0.1.3` が 2026-08-13、`0.1.0` が 2026-08-10、
`0.1.1`・`0.1.2` が 2026-08-12 で、いずれも npm の provenance attestation 付き。各版の内容は
CHANGELOG を参照。
`0.1.0-rc.1` は `0.1.0` の数時間前にリハーサルとして `next` dist-tag で公開した — それが捉えた
3件も CHANGELOG にある。

`v0.1.2` のタグと GitHub Release も揃っている（2026-08-12）。ここは一度ちぐはぐになった:
publish は `workflow_dispatch`（run `31616749939`）で通ったのに、**タグ push がセッションの
資格情報では 403 になる**ため、publish 済みなのにタグだけ無い状態で数時間残った。
メンテナがリリース画面からタグごと作って解消し、そのとき走った run（`31652490400`）は
公開済みバージョンを `npm view` で、既存 Release を `gh release view` でスキップして緑で
終わっている。

**この 403 は毎回のリリースで必ず起きるので、タグ push はリリースの必須手順から外した。**
`release.yml` を `cut_release: true` で dispatch すれば、タグと GitHub Release まで
ワークフローが作る（`releasing.md`「リリースを切る」）。タグ push も従来どおり使える。

**`0.1.5` は `0.1.4` が入れた小字（koaza）の扱いに残っていた2つの問題を直したもの**:
(1) 読みが単位（`３チョウメ`）で止まっているのに名前が続く（`三丁目大横`）形が完全性チェックを
素通りし、`大横` を落としたまま `ok` を返していた——`0.1.4` が直したと主張している当の住所が
これ。(2) 上流が選んだ行の小字を無条件に出力へ入れていたため、**入力に書かれていない小字が
宛名に現れていた**（`大字小野1-1` → `"1-1 Azamachi Ono"`。実データ300件のサンプルで8件）。
詳細は CHANGELOG の `0.1.5` の項。公開済みの `0.1.5` を取得して両方の住所で確認済み
（`三丁目大横` は `KOAZA_READING_INCOMPLETE`、`大字小野1-1` は小字なしで往復する）。

**`core-0.1.6` はブラウザ対応。** `packages/core` が
`node:fs` / `node:module` / `node:path` / `node:url` をモジュール先頭で import していたため、
ブラウザ向けにバンドルすると失敗し、フロントの住所フォームからは使えなかった。node 依存を
`src/platform/` の実装に押し込み、`exports` に `browser` 条件と2つ目のエントリポイントを足した。
公開 API は同一（`src/api.ts` に1つだけ置き、両エントリが再エクスポートする）。Node 利用者への
影響は無い。データはページ側で配れないので `configureDataSource({ endpoint })` が必須で、
**都道府県と市区町村は配信元サーバーのリクエスト URL に出る**——README にそう書いてある。
`dataDir` はブラウザでは `DATA_NOT_CONFIGURED` になる（近い値を返さない）。
検証は `scripts/browser-smoke.mjs`: pack した tarball を使い捨てプロジェクトに install し、
`browser` 条件でバンドルして、ヘッドレス Chromium で往復と拒否を実行する。CI と publish 前の
両方でブロッキング。**Node のテストではこの経路の退行を検出できない**（Node は `node:` の
import を普通に解決するため）ので、このスクリプトが唯一の砦。実際に `node:path` の import を
1行戻して、esbuild の解決エラーで exit 1 になることを確認してある。

**公開後、レジストリの実物に対しても確認済み**（2026-08-16）: `npm install jp-address-romaji@0.1.6`
した使い捨てプロジェクトを esbuild の `--platform=browser` でバンドルし、Chromium で
`toRomaji()` が西洋順のローマ字を返し、`fromRomaji` で元の日本語住所に戻ること、
自オリジン以外へのリクエストが 0 件であることを確認した（当時の例示住所で実施。
その住所は 2026-08-18 に公共施設のものへ差し替えた）。
公開された `exports` にも `browser` 条件が入っている。provenance attestation
（`https://registry.npmjs.org/-/npm/v1/attestations/jp-address-romaji@0.1.6`）も
`publish` と SLSA provenance の2件を返す。

完了済み:

- `toRomaji` / `fromRomaji` / `parse` / `toFormat`。失敗は throw ではなく型付きの値として
  返す
- ブラウザ対応（`browser` エクスポート条件 + `src/platform/`、`core-0.1.6`）
- 京都の通り名住所: 通り名の句を正規化の前に切り出し、原文のまま保持し、決してローマ字化
  しない
- `fromRomaji` の `postalCodeIndex` フック。呼び出し側が自前の郵便番号データで曖昧さを絞り込める
- オフライン保証。`fetch` を throw するスタブに置き換えるテストで強制している
- テスト 205 件がパス（+15 スキップ = 実データセットがあるときだけ走るもの。2026-08-16 実測、
  Node 22.22.2）
- CI（lint・typecheck・build・test・Node 18 での消費・ブラウザでの消費）とデータ更新ワークフロー
- 両パッケージの README、CHANGELOG、そして完全なデータセットなしにデータパッケージの公開を
  拒否する `prepublishOnly` ガード

`main` は上記すべてを含む。

## デモページ（2026-08-17）

`demo/` にブラウザだけで動くデモがあり、`.github/workflows/pages.yml` が
build → ブラウザ検証 → GitHub Pages へのデプロイまでを行う。公開先は
<https://tomatomerde.github.io/jp-address-romaji/>。npm 公開版のライブラリとデータセットを
pin して読み込む（`demo/pinned-version.txt` / `demo/pinned-data-version.txt`）ので、
**リリースのたびに pin を上げること**——手順は `docs/releasing.md`「リリースを切る」の 5、
判断の一覧は `demo/README.md`。

この案件固有の作りは、データをページ自身が配ること。全国約1,900の市区町村ファイルのうち
`demo/municipalities.txt` に挙げた9件だけを配り、索引 `ja.json` は削らずに丸ごと置く
（削ると実在する市区町村を「存在しない」と答える＝欠落ではなく誤答になる）。
姉妹デモと違ってリクエストが 0 件にならないので、ページは
**出したリクエストを全部並べて、番地から先がそこに無いことを見せる**形にしてある。
`scripts/verify-demo.mjs` が Chromium で建物名と宛名つきの住所を実際に打ち込み、
ブラウザが出した全 URL を走査して断片が混じっていないことを検査する。

**公開まで通った（2026-08-17）。** 所有者が Settings → Pages → Source を「GitHub Actions」に
したあと（`actions/configure-pages` は `GITHUB_TOKEN` に管理者権限が無いため必ず失敗する。
姉妹2案件でも同じ）、`workflow_dispatch` をセッションから叩いて build・deploy とも緑
（run `32003989392`）。

**そのあと本番の実物を検証した。** 18ファイルすべてを取得して手元のビルドと `sha256` が
**全件一致**し、そのバイト列をローカルに配って Chromium で全チェックを通した
（`tomatomerde.github.io` は `curl` では通るが Chromium からは `ERR_CONNECTION_RESET` になる）。
配信ヘッダも実測済み——`.txt` は `text/plain; charset=utf-8` で `Content-Disposition` は付かず
（ダウンロード扱いにならない）、`.json` は `application/json`、版のプレースホルダは置換済み。
README（英日）のリンクと `packages/core` の `homepage` も設定した。
残るはリポジトリの Website 欄だけ（API からは設定できない）。

### デモが見つけた本体の不具合（イシュー #58、`core-0.1.7` で修正）

**エンドポイントが持っていない市区町村ファイル（HTTP 404）に対して、`toRomaji` が型付きの
失敗ではなく例外を投げていた。** 逆方向の `fromRomaji` は同じ状況を `DATA_NOT_CONFIGURED` と
して正しく返していた。経路が違うため——逆方向は自前の `dataAccess.ts` が `response.ok` を
見るが、順方向は正規化を委譲した上流が 404 の本文を `JSON.parse` に渡す。
`normalizeJapanese` がそれを捕まえていなかった。

**README が勧めている構成で起きる**（「必要な市区町村だけを配信することもできます」）ので、
404 は異常系ではなく通常の運用だった。「失敗は例外ではなく値」という中心的な約束が、
そこだけ破れていた。

`0.1.7` は `normalizeJapanese` で catch し、上流を `{ level: 2 }` で呼び直して市区町村名を
得たうえで `DATA_NOT_CONFIGURED` を返す（索引は失敗した試行がキャッシュ済みなので**追加の
リクエストは出ない**——`missingTownFileEndpoint.test.ts` が実測して固定している）。
**公開された 0.1.7 をレジストリから入れ直して、部分的なエンドポイントに対して確認済み**
（両方向とも `DATA_NOT_CONFIGURED`、URL に番地・建物名・宛名は出ない）。
デモの pin も 0.1.7 に上げ、パネル4の期待値を `throw` → `refuse` にした。
**pin を 0.1.6 に戻すとデモの検査が落ちることも確認してある**——公開済みの版が退行したときに
気づく経路は、このリポジトリにはこれしか無い。
**`TOWN_NOT_FOUND` には倒していない**: 町ファイルが無いときも `level` は 2 で止まるので
区別が付かないが、実在する町について「見つからない」と答えるのは、このライブラリが
いちばん避けている「もっともらしい誤答」そのものだから。わざと戻して確認済み——
catch を外すと5件、`TOWN_NOT_FOUND` に倒すと2件、復旧で余分に fetch すると1件落ちる。

テストは2ファイルに分けてある（`missingTownFile.test.ts` が `dataDir`／ENOENT、
`missingTownFileEndpoint.test.ts` がループバック HTTP／404 の HTML 本文）。
**上流の正規化器は解決済み市区町村をプロセス内にキャッシュし、そのキーにエンドポイントを
含めない**ので、同一ファイル内で完全なデータセットを先に引くと、エンドポイントを差し替えても
キャッシュが答えてしまい、後半の検査が何も測らなくなる。`vitest.config.ts` がファイル単位で
fork しているので、分けることでキャッシュが冷えた状態を保っている。

## 2つのセッションが同時に触った（2026-08-14）

`0.1.4` と `0.1.5` は別々のセッションが並行して進めた。どちらも dev-standards を
ソースに含んでいて方針は共有していたが、**同じリポジトリを同時に触ったこと自体**が
次の3つを起こした。次に複数セッションで進めるときの判断材料として残す。

- **同じ不具合を両方が直した。** `longVowel: 'oh'` の往復不能は両セッションが独立に
  直し、片方は PR ごと破棄になった（#45）。作業時間はそのまま二重になった
- **PR がコンフリクトした。** 一方が main を進めている間にもう一方が積んでいたため、
  `release.yml`・`docs/` で解消が必要になった
- **公開済みの版が短時間で3つ増えた**（0.1.3 / 0.1.4 / 0.1.5）。利用者から見ると
  非互換の説明が3か所に分かれる

**次に同じ状況になったら**: リリースまで持っていくセッションを1つに決め、他方は
main にマージされるまで止める。再開するときは必ず `git fetch origin main` から始め、
このファイルの「現在の状態」を先に読むこと——このファイルが古ければ、まずそれを直す。

## 公開後レビューで見つかった不具合（0.1.4 で解消）

以前この節に残っていた5件は、このブランチですべて直った——最重要だった丁目の先の小字（koaza）の
消失を含め、修正の裏付けとなる回帰テストも添えて。加えて、変換の中核以外を一通り読み直したところ
新たに6件見つかり、同じブランチで直した。実データ（`JP_ADDRESS_ROMAJI_DATA_DIR` 経由）に対して
再現・修正確認済み。内容は CHANGELOG の `0.1.4` の項とコミット履歴を参照。重要度順。

### 最重要だったもの: 丁目の先の小字（koaza）が順方向で黙って消え、別の住所になる

```text
toRomaji('長野県飯田市本町三丁目大横1-1', {})
  → 0.1.3 まで: ok=true "1-1 Hommachi, Iida-shi, Nagano, Japan"       （三丁目大横 が消えている）
  → 0.1.4:      ok=true "1-1 3Chome Hommachi, Iida-shi, Nagano, Japan"（大横 が消えている）
  → 0.1.5:      KOAZA_READING_INCOMPLETE
```

**この節はかつて 0.1.4 の出力を `"1-1 Sanchomeoyoko Hommachi"` と書いていたが、それは実データでは
起こらない。** フィクスチャがこの行に `サンチョウメオオヨコ` という実在しない読みを持っており、
回帰テストがその作られたデータに対して通っていた。実データの読みは `３チョウメ` で `大横` に
届かないため、0.1.4 は `大横` を落としたまま `ok` を返していた。0.1.5 でフィクスチャを実データに
合わせ、完全性チェックに「読みが単位で止まっているのに名前が続く」形を足して拒否するようにした。

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
packing、tarball の assert、そして2パッケージの片方だけが動く publish。

**その残りは `core-0.1.6`（2026-08-16、run `31961720562`）で実際に通った** — core だけを pack し、
data 側の pack・assert・publish はスキップされ、CHANGELOG はスコープ付き見出し
（`## core-0.1.6`）から抽出され、GitHub Release は `core-v0.1.6` として作られた。`data-v*` の
向きはまだ実行されていないが、スキップの分岐は同じ `PUBLISH_DATA`/`PUBLISH_CORE` の対で
書かれている。

**publish の直前に2つ目の npm バージョン assert が走るようになった**
（`scripts/assert-npm-version.sh`、姉妹リポジトリとバイト単位で同一の共有）。このワークフローは
アップグレード後に `actions/setup-node` を再実行しないので、これは現存する欠陥の修正ではなく、
それが変わることへのガード — 最古のサポートランタイムでのスモークテストのために Node を切り
替える姉妹ワークフローこそ、これが本領を発揮する場所。スクリプトは 11.5.1 境界の両側をスタブの
`npm` で確認した（11.5.0 は落ち、11.5.1 は通る）。

## 解決済み（2026-08-18）: 「市区町村名の全国衝突 13 件」には出どころが無かった

公開面が引いていた3つの数値のうち、**2つは合っていて、1つは測られたことが一度も無かった**。

- **完全形キー曖昧性 0.67%（1,406/211,041、town 2,622）** は、2026-08-18 に出荷データセットに
  対して測り直して**そのまま再現した**。下の 2026-08-11 の記録が今も生きているということ。
- **「市区町村が判明していれば 97.99% が一意」は、値としては再現したが分母が誤っていた。**
  かなもローマ字も持たない町（索引されるキーが1つも無く、`matchTowns` が候補に出さない町）が
  分母に入っていて、衝突しようがないので**「一意」として数えられていた**。除くと母数は
  130,144 → 127,800 になり、**97.95%**、全国文脈は 59.92%。旧スクリプトから引き継いだ
  誤りで、公開値は「読みの無い町のぶんだけ甘い」状態だった。
- **「市区町村名の全国衝突 13 件」だけが実測ではなかった。** 数えるスクリプトが無く、
  リポジトリを作り直した 2026-08-07 の最初のコミットから、根拠なしでそのまま載っていた。
  **実測は 39 組**（都道府県をまたいでローマ字表記を共有する市区町村の組、関わる市区町村 86、
  索引されている綴りは 56）。**13 との差は、単に数え直しただけでは説明できない**——
  どんな数え方でも 13 にはならなかった。
- **そのうち日本語表記まで同じ名前なのは 19 組**（伊達市、池田町、美里町 など）。残る 20 組は
  *別の名前が同じローマ字になる*もので、`Mihama-cho` に至っては御浜町と美浜町3件の計4市町。
  **13 を 39 に置き換えるだけでは嘘が残る**箇所で、「同名の市区町村がN件」と読める書き方は
  すべて直した。**この2つは別の量**で、混ぜると数が合わなくなる。
- 数え方は途中で2回変えている。**郡は名前の一部ではない**（宮城県遠田郡美里町と
  埼玉県児玉郡美里町は同じ美里町）ので同名判定から外し、組は**綴りごとでも所有集合ごとでもなく
  連結成分**で数えることにした（`Konan-shi` は江南市・湖南市・香南市、`Kohnan-shi` は
  江南市・香南市。独立した2件の衝突ではなく、3市が互いに紛れる1件）。
  どちらも自分のレビューで出た指摘で、直す前の値は 40 組・同名2組だった。
- ついでに **「全国文脈では大きく落ちる」も裏が取れていなかった**ので測った: **59.92%**。
  97.95% との差が、外側から内側へ解決する設計の根拠そのもの。

**再発しない形にした**。数値は `docs/coverage.md`（と機械可読の
`docs/measurements/figures.json`）に生成し、README（英日）・`CLAUDE.md`・`fromRomaji` の
API ドキュメントはそこから引くだけにした。`scripts/check-quoted-figures.ts` が CI で突き合わせ、
ズレたら赤くなる。**測定そのものは CI では回らない**（106MB をランナーが取りに行くのは月次の
`Refresh address data and coverage` だけ）ので、赤くなるのは「文のほう」。月次実行が
`docs/coverage.md` を更新した瞬間に、追従していない文が CI で落ちる、という連鎖になっている。

**Zenn の記事は CI から届かない。** 記事は 98.9%（0.1.3 で README から消した値）と 13 件を
載せたままだったので直した。記事側は代わりに測定日を本文に書く形にしてある。

数え方は `scripts/lib/ambiguity.ts` にあり、規則（区は2セグメント必須、同一都道府県内の衝突は
数えない、綴りではなく組を数える）は `scripts/lib/ambiguity.test.ts` が合成インデックスで
固定している——実データが無い CI でも規則の退行は捕まる。

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
増やすなら、必ず `docs/coverage.md` から取ること**（2026-08-18 に、スクリプトの標準出力から
生成物へ移した。上の節を参照）——実装が変われば数値も動くので、手で書き写した値はいずれ嘘になる。

手法のマトリクス（name/record での dedupe × plausibility フィルタ on/off × 母音スタイル ×
stem）を回して、歴史的な 0.95/1.23 を再現する変種があるか確かめた。無かった — 最も近くて
0.91% と 1.40% で、つまり古い数値は両方ともキーのロジックの旧版に属していた。転記ミスのリスクは
構造的に閉じた: `candidateKeys`/`stemKey` を `fromRomaji.ts` から export し、スクリプトは
コピーではなく import する。

## 既知のギャップ

これらはいずれも検討のうえ意図的に先送りしたもので、見落としではない — したがってどれかを
閉じる変更は、機構を足すだけでなく、トレードオフがなぜ動いたかを述べるべき。貢献歓迎:

**利用者に見せる形で先送りしているものは、README の「ロードマップ / 検討中」と
`enhancement` ラベルのイシュー（#68〜#72）にある。** この節はそれより内側——外から
要望として出てこない類のもの。両方に載るもの（`script.ts` の判定）は、下でイシュー番号を
指している。

（この節にあった4件——Node 18 が CI で踏まれていない、CI に `permissions:` が無い、CI の二重
起動、issue/PR テンプレート・`SECURITY.md`・`CODEOWNERS`・依存更新の自動化が無い——は、実体を
確認したところすべて解消済みだったので 2026-08-16 に削除した。記録は CHANGELOG とコミット履歴に
ある。）

- **`fromRomaji` にも「町名の先頭だけに一致し、余りを建物名にする」経路が残っている。**
  `1-1 Miyanomori 9-Jo, Chuo-ku, Sapporo-shi, Hokkaido`（宮の森九条は実在しない）は 宮の森 に
  解決し、`9-Jo` を `unparsed` にして `北海道札幌市中央区宮の森1-1 9-Jo` を `ok` で返す。
  0.1.8 が `toRomaji` 側で直したのと同じ不具合。**このライブラリ自身の出力からは到達しない**
  （`roundtrip.test.ts` は 0 件）が、手で書いた入力からは届く。直していない理由は、逆方向では
  単語の区切りが空白そのもので、文書化・テスト済みの
  `2-8-1 Nishishinjuku Sunshine Bldg 5F`（カンマ無しの建物名）と区別する根拠がまだ無いため。
  順方向で採った「空白で区切られ番地が無い」規則は、逆方向にはそのまま移せない。
- **町名が丸ごと別の町に解決する例が、余りを出さない形でも残っている。** デモが配信する9市区
  町村を生成入力 16,932 件で走査して 52 件。内訳は (1) `東京都新宿区三栄町1番1号` →
  `四谷三栄町`（どちらも実在する別の町。`三栄町` の行は `oaza_cho_r` を持たない）、
  (2) `京都府京都市中京区舟屋町1番1号` → `船屋町`（`舟`/`船` の異体字畳み込み。ローマ字は
  どちらも `Funayacho` なので出力文字列は同じで、違うのは `parsed.town.ja`）、
  (3) `三本木五丁目1番1号` → `三本木` 丁目5 で `"5-1-1 Sambongi Gochome"`（データセットの
  `oaza_cho_r` が丁目を名前に含んでいるため二重になる）。**0.1.8 の余り判定では捕まらない**
  ——余りが出ないため。直すには優先順位規則か `AMBIGUOUS` 化が要り、それは
  「救う件数と壊す件数を両方数える」が必須の領域（0.1.4 の前例）。
  `戸塚町`（U+FA10 の互換漢字）→ `戸塚町`（U+585A）は**誤りではない**——上流の異体字正規化。
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
- **`script.ts` の日本語検出用正規表現が CJK 互換漢字（U+F900–U+FAFF）と面外（BMP 外）の漢字、
  および繰り返し記号 `々`（U+3005）を含まない。** 同梱データセットの町名・かな読みはこの範囲に
  落ちないので、**データ側から踏むトリガーは無い**。ただし**入力側からは届く**: `fromRomaji` は
  この判定で建物名の区画を切り分けているため、範囲外の文字だけで書かれた建物名を**末尾に**
  置くと都道府県として読まれ、`PREFECTURE_NOT_FOUND` になる（`1-2-3 Uehara, Shibuya-ku,
  Tokyo, 﨑101`。`嶋101` は通り、`﨑ビル101` も通る）。`toRomaji` の出力は建物名を先頭に置く
  ので、このライブラリ経由の往復では起きない。**イシューに出した（#71）**ので、実データの
  判断材料が集まるまでは待ち——直すにはリリースが要り、同じ判定が `parse()` の方向振り分けも
  決めている。

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
