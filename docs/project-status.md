# プロジェクトの現状

プロジェクトが今どこにあるか、最初のリリースまでに何が残っているか、そして作業した人が実際に
つまずいた点は何か。新しい貢献者でも、間を置いて戻ってきたメンテナでも、文脈を再構築せずに
着手できるよう、常に最新に保つ。

コードの触り方は [`CONTRIBUTING.md`](../CONTRIBUTING.md) を参照。リリース手順そのものは
[`releasing.md`](./releasing.md) を参照。

## 現在の状態

**公開済み。** `jp-address-romaji` と `jp-address-romaji-data` は両方とも npm に公開されている。
最新は `0.1.2`（2026-08-12、データセットビルドの耐障害化と `--concurrency` 検証の修正 — 内容は
CHANGELOG を参照）。`0.1.0` は 2026-08-10、`0.1.1` は 2026-08-12 リリースで、いずれも npm の
provenance attestation 付き。`0.1.0-rc.1` は `0.1.0` の数時間前にリハーサルとして `next`
dist-tag で公開した — それが捉えた3件は CHANGELOG を参照。

**`0.1.2` にはタグと GitHub Release がまだ無い（メンテナの操作待ち）。** publish 自体は
`release.yml` の `workflow_dispatch`（dry_run: false、run `31616749939`）で完了しており、
provenance も付いている。タグ push はセッションの資格情報では 403 になるため、メンテナが
`git fetch origin main && git tag v0.1.2 52104b0 && git push origin v0.1.2` を
実行すること。手元に clone が無ければブラウザからでもよい — `releasing.md` の
「タグを GitHub の UI から作る場合」を参照（リリース画面がタグごと作る）。

どちらの経路でもタグ作成でワークフローが再度走るが、公開済みバージョンは `npm view` で、
既存の GitHub Release は `gh release view` で検出してスキップするので、二重公開も失敗も
起きない。

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

## 公開後レビューで見つかった未修正の不具合

以下はいずれも、公開済み `0.1.2` の実物に対して再現確認まで済んでいる。まだ直っていない。
重要度順。

### 1【重大】`fromRomaji` が別の自治体の実在住所を `ok: true` で返す

原因は `packages/core/src/fromRomaji.ts` の `matchMunicipality` / `matchesMunicipality`
（L381–427）にある2つの欠陥の複合:

- クエリ側で `stemKey` を試すため接尾辞が剥がれ、`Fuchu-cho` が stem `fuchu` で `府中市` に
  一致する。同ファイルの `matchTowns`（L478–491）のコメントは、町名レベルでまさにこの不具合
  （`Uguisudanimura` が鶯谷町に一致）を修正したと明記しているのに、**市区町村レベルには
  同じ修正が入っていない**
- `for (const record of cities)` の先勝ちで確定し、**市区町村レベルには `AMBIGUOUS` 判定が
  存在しない**

実データ全国スキャンで、自分自身の名前を単一セグメントで入力すると別の自治体に解決される
市区町村が **13件**。うち4件は町名まで共有するため完全に静かな誤住所になる。再現した実際の
出力:

```
"1-1 Sakuragaoka, Fuchu-cho, Hiroshima" → ok=true 広島県府中市桜が丘一丁目1   （意図: 安芸郡府中町桜ヶ丘1-1）
"1-1 Otani, Echizen-cho, Fukui"         → ok=true 福井県越前市大谷町1-1       （意図: 丹生郡越前町大谷1-1）
"1-1 Honcho, Esashi-cho, Hokkaido"      → ok=true 北海道檜山郡江差町字本町1-1 （意図: 枝幸郡枝幸町本町1-1）
"1-1 Nakamura, Shimanto-cho, Kochi"     → ok=true 高知県四万十市中村1-1       （意図: 高岡郡四万十町中村1-1）
```

残り9件（利島村→豊島区、白川村→白川町、木曽町→木祖村 など）は `TOWN_NOT_FOUND` になり、
実在住所が拒否される。郡名を書けば正しく解決する（`Fuchu-cho, Aki-gun, Hiroshima` は正常）
ことも確認済み。

これは `CLAUDE.md` が掲げる「間違った宛名ラベルは、拒否された宛名ラベルより悪い」「勝手に
選ばず `AMBIGUOUS` を候補付きで返す」という中核の不変条件の違反。

修正時の注意: 江差町と枝幸町は**読みまで同一**（どちらも Esashi-cho）なので、クエリ側の
stem を廃止するだけでは直らない。「全一致候補を収集 → 完全キー一致を stem 一致より優先
→ それでも複数なら `AMBIGUOUS` を候補付きで返す」という形が必要。回帰テストには府中町/
府中市、江差町/枝幸町（読み同一 → `AMBIGUOUS` 必須）、四万十町中村の3類型を入れること。

### 2【重大】長音スタイル指定時に翻字不能文字の検証がバイパスされる

`packages/core/src/romaji/format.ts` の `romanizeStem`（L124–137）。`style === 'none'` は
`kanaToRomaji` を通り `isTransliterableKana` で弾かれるが、`macron` / `circumflex` / `oh` は
`analyzeKana` を直接呼ぶため、`toSyllables`（`hepburn.ts` L146–147）が未対応文字を逐語で
残す。再現:

```
toRomaji('茨城県東茨城郡大洗町サンビーチ1-1', {})                   → NO_ROMAJI_DATA（正しく拒否）
toRomaji('茨城県東茨城郡大洗町サンビーチ1-1', {longVowel:'macron'}) → ok=true "1-1 Sambi-Chi, Ōarai-machi, …"
```

**既定より長音スタイルのほうが緩いという逆転**で、拒否すべき入力が通る。データセット実測
では `oaza_cho_k` が翻字不能な行が 16,918 件あり、大半は数字混入（`キタ１０ジョウニシ` →
`Kita10Jōnishi`）で偶然まともな出力になっている。ガードを単純に適用すると札幌の条丁目名の
macron 出力が全滅するので、**数字は許容し、それ以外を拒否**するのが妥当な方向。数字以外の
混入は4行のみ。

### 3【中】郵便番号の抽出に前方の数字境界がない（双方向）

`toRomaji.ts` の `splitPostalCode`（L234）と `fromRomaji.ts` の `tokenize`（L362）のどちらにも
`(?<!\d)` 相当の先頭境界がない。再現:

```
toRomaji('東京都新宿区西新宿2-8-1 新宿ビル TEL03-1234-5678')
  → ok=true "新宿ビル TEL03-1, 2-8-1 Nishishinjuku, … 234-5678, Japan"  （電話番号を郵便番号化・ビル名も切断）
toRomaji('東京都新宿区西新宿1123-4567')
  → ok=true "1 Nishishinjuku, … 123-4567, Japan"                        （4桁番地を郵便番号+丁目1に誤分解）
fromRomaji('1123-4567 Nishishinjuku, Shinjuku-ku, Tokyo')
  → ok=true 東京都新宿区西新宿一丁目 postal=123-4567
```

いずれも `ok: true` の静かな破損。前後に数字・ハイフンが連結していないことを要求すべき。
あわせて `splitPostalCode` は区切りに `ー`（長音符）を許すのに `tokenize` は ASCII `-` のみ、
という非対称もある。

### 4【中】テストが守っていないガードが2箇所（変異テストで実証）

対象コードをわざと壊して `pnpm test` を実行した結果、**105テストすべてが green のまま**
だったもの:

- `fromRomaji.ts` L414 の `if (record.ward) return false;`（「`Chuo-ku` 単独では政令市の区に
  一致させない」ガード）
- `fromRomaji.ts` L314–321 の「その丁目は存在しない」拒否。削除すると `99-1 Ginza` の類が
  実在しない住所として黙って成功する

対照として `stripAzaPrefix` のかな側剥がし（`CLAUDE.md` の地雷3）を壊すと1テストが落ちるので、
スイート全体が空洞なわけではない。上記2つのガードには回帰テストを足すこと。

### 5【中】同名の町に「丁目あり行」と「丁目なし行」が併存するとき、先頭数字を黙って丁目と解釈する

`fromRomaji.ts` L298–322。候補が複数のときの分岐は、コメント自身が「丁目でフィルタするのは
片方の読みを黙って選ぶことだ」と述べているのに、**町名が単一の場合は同じ選択を黙って行って
いる**。該当する町は全国 2,027 件。

```
"2-5 Kitanosawa, Minami-ku, Sapporo-shi, Hokkaido" → ok=true 北海道札幌市南区北ノ沢二丁目5
```

北ノ沢には丁目なし行も実在するので「北ノ沢2番5」という読みも成立する。ライブラリ自身の
基準では `AMBIGUOUS` 相当。少なくとも設計判断として文書化が要る。

### 6【小】かな翻字でマッチした町の `parsed.town.romaji` が `undefined` になり、`toFormat` が英語宣言の住所に漢字を出す

`fromRomaji.ts` の `buildParsed`（L342–346）が `oaza_cho_r` だけを添付し、マッチに使った
決定的翻字（データセット由来なので推測ではない）を捨てている。romaji フィールドを持たない
約1割のエントリで再現:

```
fromRomaji('1-1 oazakomagome, Aomori-shi, Aomori') → ok=true, town.romaji=undefined
toFormat(parsed, 'google-i18n') → {"languageCode":"en", "addressLines":["1-1 大字駒込"], …}
```

`formats/index.ts` の `streetOf`（L66）の `romaji ?? ja` フォールバックが、`languageCode:'en'`
の宣言と矛盾する出力を作っている。

### 7【小】いずれも今日は到達不能だが、退行の芽

- `format.ts` L91: 自治体の romaji フィールドが欠けているとき、接尾辞の読みを
  `spec.romaji[0]` で**推測**する（`formatMunicipality('出雲崎町', 'イズモザキマチ', undefined,
  'none')` → `"Izumozaki-cho"`、実際の読みは machi）。現行データでは romaji 欠落の自治体が
  0件なので到達しないが、データ更新で退行しうる。かなの末尾から読みを決めるべき
- `format.ts` 冒頭コメントが「データセットは ALL-CAPS（`SAPPORO SHI`）」と書いているが、
  公開済み v2 データは `Sapporo-shi` 形。コードは両方扱えるがコメントが古い
- `kyoto.ts` L30: `DIRECTION` に `東入る|西入る` が重複（無害）
- `hepburn.ts`: 先頭・孤立の長音符が黙って脱落する（`ーア` → `"a"`）。破損データ入力時のみ

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

- `fromRomaji` がインデックスするローマ字化キー（完全形と stem 化した短縮形）の **1.10%**
  （2,778/252,587）が、同一 municipality 内の 2 つ以上の異なる town に対応する。関与する town は
  4,869（3.74%）。
- 完全形キーでは **0.69%**（1,404/204,671、town 2,620）— 完全な town 名でも解決できない残余で、
  KEN_ALL のトレードオフが実際に依拠しているのはこちらの数値。

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

## 落とし穴

壊してはならない不変条件は `CONTRIBUTING.md` が扱う。ここにあるのは、実際に時間を奪った運用上の
もの:

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
