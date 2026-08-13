# リリース手順

既定では2つのパッケージを一緒に出す: `jp-address-romaji`（ライブラリ）と
`jp-address-romaji-data`（データセット）。ライブラリはデータセットなしでは役に立たないため、
両方を一緒に出すときは必ずデータパッケージが先に publish される。データパッケージだけを独自の
サイクルでリリースすることもできる — 後述の「タグの体系」参照。

**リリースは `Release` GitHub Actions ワークフロー（`.github/workflows/release.yml`）で駆動する。
手元のマシンで `npm publish` を実行するのではない。** ワークフローは上流からデータセットをビルドし、
検証し、それに対してフルのテストスイートを走らせ、対象パッケージを pack し、pack された型と
ビルド成果物が実際に import できることを確認し、そこまで通って初めて publish する。ローカルでの
publish も引き続き可能で（本文書の末尾参照）、文書化された fallback として残してあるが、開発環境には
どうしてもできない2つのこと — データセットホストへの到達と、手作業に頼らない証明 — を省くことに
なるので、既定ではなく緊急経路として扱う。

ワークフローはリリースを一度に1つだけ実行する（`concurrency: group: release,
cancel-in-progress: false`）: 実行中の run があるとき、2つ目の run は並列実行もキャンセルもせず、
その後ろに並んで待つ — `npm publish` の途中で run を殺すほうが、次の run を待たせるより悪いため。

## Trusted publishing（ワークフローの認証方式）

**ワークフローは npm トークンを一切持たない。** publish は npm の *trusted publishing* で行う:
GitHub Actions が短命の OIDC トークンを発行し、npm がそれをパッケージに登録された trusted
publisher と照合し、長命のシークレットなしで publish が承認される。この経路では provenance
attestation が自動で生成される。`--provenance` フラグが存在しないのはそのため。

npmjs.com 上でパッケージごとに設定済み（**4つすべて**、2026-08-10）。場所は *Settings → Trusted
Publisher*:

| 項目 | 値 |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `tomatomerde` |
| Repository | このリポジトリ（両パッケージともここを指す） |
| Workflow filename | `release.yml` |
| Environment name | **空欄** — ジョブは GitHub Environment を宣言していないので、ここが食い違うと publish は拒否される |
| Allowed actions | `npm publish` と `npm stage publish` |

ワークフローが維持しなければならない3点。どれかを失うと認証が壊れる:

- **`permissions` の `id-token: write`。** これがないと、交換すべき OIDC トークンがそもそも存在しない。
- **npm >= 11.5.1。** ランナー同梱の npm はこれを満たさないため、
  `Ensure npm supports trusted publishing` ステップが npm をアップグレードしてバージョンを assert
  する。パイプライン全体が走った後の認証エラーとしてではなく、早い段階で読み取れる形で失敗する。
- **ワークフローのファイル名は `release.yml` のまま変えない。** trusted publisher はこの名前
  そのものに対して登録されている。ファイルをリネームすると、登録は無言で無効になる。

### npm のバージョン（実測値）

このガードステップは、OIDC 経路のうち dry run が到達できる唯一の部分。2026-08-10 の dry run
（run `31402994984`、この仕組みを導入したマージコミット上）での実測は、Node 22 の `setup-node`
由来が **npm 10.9.8** — 要件未満 — で、ガードの `npm install -g npm@latest` 後が **12.0.2**。
ガードがなければ、このパイプラインは `npm publish` まで到達したうえで、バージョンについて何も
語らない認証エラーで失敗していた。

このジョブは `setup-node` をちょうど1回だけ呼ぶので、publish ステップが使うのはこの
アップグレード後の npm になる。**2回目の `setup-node` は無害では済まない**: ツールチェーン全体が
差し替わり、アップグレードが生き残るのは、ツールキャッシュから同じ Node が再選択される間だけ。
別ランタイムのスモークテストのために `setup-node` に再入する姉妹プロジェクトでは、run の途中で
npm が 10.8.2 に戻り、バージョンの偶然の一致によってのみ復旧している。もしここでガードの後に
`setup-node` を追加することがあれば、publish ステップで npm のバージョンを読み直すこと。

### 検証済み: `0.1.1` は OIDC で出た

`0.1.0` は 2026-08-10 にトークンで publish され、切り替えはその後だったため、トークン交換の
最初の実地検証は次のバージョンアップまで待つしかなかった — dry run は `npm publish` に到達
しないし、`v0.1.0` を再 push しても、レジストリに既にあるとしてスキップされるだけだから。

そのバージョンアップが **2026-08-12 publish の `v0.1.1`**（run `31558139492`）で、パッケージ
ごとに1回、OIDC を計2回行使した。どちらの publish も、OIDC 経路で provenance が発行されたと
報告している:

```text
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: https://search.sigstore.dev/?logIndex=2430008797
```

publish ステップの時点で `npm 12.0.2` が入っており、ジョブは npm のクレデンシャルを一切持って
いなかった: ワークフローが参照するシークレットは、GitHub Release の作成に使う `github.token` だけ。

**`NPM_TOKEN` はもはやロールバック経路ではない** — トークンなしのリリースが現に1件成立した。
リポジトリシークレットと npmjs.com からの削除は `docs/project-status.md` で追跡している。

## npm トークン（置き換え済み — 記録された失敗モードのために残す）

以下はすべて、このワークフローがもう使っておらず、もう必要ともしないトークン経路の説明。
残してあるのは、ここにある失敗モードが苦労して得たものであり、アカウントで認証するローカル
publish（後述）には今も当てはまるから。これは**生きたロールバック手段ではない**: トークンの
再導入は、trusted publishing が不要にした長命の publish クレデンシャルの再導入を意味する。

ワークフローはかつて、GitHub Actions シークレットとして保存したトークンで npm に認証していた:

1. [npmjs.com](https://www.npmjs.com/) にログインし、**Access Tokens → Generate New Token** へ。
   npm は classic と granular のトークン作成を単一のフォームに統合している。重要な項目は次のとおり:

   | 項目 | 値 | 理由 |
   | --- | --- | --- |
   | **Bypass two-factor authentication (2FA)** | **チェックを入れる** | これがないと npm は publish 時にワンタイムパスワードを要求し、CI はそれを供給できない |
   | Packages and scopes → Permissions | **Read and write** | 既定は read-only |
   | Select packages | **All packages** | 未公開の名前はパッケージ個別のピッカーに現れないため、新しい名前の初回 publish にはアカウント全体のスコープが要る。公開後に狭める |
   | IP ranges | **空のまま** | GitHub ホストランナーには安定した egress IP がない |
   | Organizations → Permissions | No access | 不要 |

   **食い付いてくるのは 2FA のチェックボックスで、publish 本番まで見えない。** チェックなしで
   作られたトークンは、CI からは次のエラーで拒否される:

   ```text
   npm error code EOTP
   npm error This operation requires a one-time password from your authenticator.
   ```

   これは `v0.1.0-rc.1`（2026-08-10）で2回起きた。どちらの回も何も publish されていない —
   run は publish ステップで失敗し、両パッケージともレジストリに存在しないままだった — が、
   その前にパイプライン全体が走るので、試行のたびに数分を失った。**既存トークンの再生成では
   この設定は変わらない**。チェックを入れた新しいトークンを作り直す必要がある。
   `scripts/npm-publish.sh` は `EOTP` を認識してこのチェックボックスの名前を挙げる。

   これが後述のリリース候補手順の最も明確な論拠になる: dry run は決して `npm publish` に到達
   しないため、トークンを検証できる dry run は存在しない。これが rc ではなく `0.1.0` だったら、
   同じ2回の失敗が、皆がインストールするバージョンの履歴に載っていた。
2. トークンをコピーし、リポジトリシークレットとして設定する:

   ```sh
   gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   # paste the token when prompted, or:
   echo "npm_xxxxxxxx" | gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   ```

   Web UI からの同等の操作は: リポジトリ → **Settings → Secrets and variables → Actions → New
   repository secret**、名前は `NPM_TOKEN`。

3. それ以外は何も要らない。ワークフロー自身の `permissions:` ブロックが必要な権限を既に与えて
   いる: GitHub Release の作成に `contents: write`、provenance（後述）に `id-token: write`。

npm の provenance にはもう `--provenance` フラグは要らない — trusted publishing が attestation を
自動で発行する。**`--access public` は今も渡していて、省略できない。** レジストリがまだ知らない
名前に対しては、access を明示しない限り npm は attestation の発行を拒否する:

```text
npm error code EUSAGE
npm error Can't generate provenance for new or private package, you must set `access` to public.
```

スコープなしパッケージは既定で public なので、このフラグは冗長に見えるが、それでも npm は拒否
する: 「既定で public」は「明示的に public」ではない。この2パッケージが初回リリースを生き延びた
のは、たまたま `package.json` に `publishConfig.access` があったからにすぎない。それを持たない
姉妹プロジェクト2つは、最初の本番 tag push（2026-08-10）で失敗した。`scripts/npm-publish.sh` は
すべての publish でこのフラグを渡す。

リポジトリが private の間、provenance は無効だった — npm は公開のソースリポジトリを要求する —
ので、リポジトリが public になった 2026-08-10 に有効化した。ほかに provenance が依存していて、
気づかずに壊しやすいものが2つ:

- **各 `package.json` の `repository.url` はこのリポジトリを指していなければならない。** npm は
  ワークフローが実行されているリポジトリと比較し、食い違うと **publish を失敗させる**。両
  パッケージとも `git+https://github.com/tomatomerde/jp-address-romaji.git` を指している。
- **publish コマンドは `pnpm publish` ではなく `npm` であること** — pnpm 9.15.0 には
  `--provenance` フラグがない。pnpm が npm の OIDC 交換を実装しているかは未確認。ワークフローは
  それに依存していない。pack 済み tarball を `npm publish` で publish しているから。これは将来の
  編集に対する制約にすぎない。

認証が trusted publishing に移ったのは `0.1.0` 出荷後 — 上のセクション参照。それより早くは
設定できなかった: npm はまだ存在しないパッケージへの trusted publisher 登録を拒否する
（[npm/cli#8544](https://github.com/npm/cli/issues/8544)）ため、初回リリースはトークンで出す
しかなかった。

**2026-08-10、トークン経路で行使済み。** 両パッケージとも `0.1.0-rc.1` と `0.1.0` の attestation
を持ち、`https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>` がそれぞれについて
`publish` と `provenance` を列挙する。trusted publishing 経路での発行も **`0.1.1` で観測済み**
（上の「検証済み」節を参照）。つまり両経路とも実地で attestation を発行した実績がある。

## タグの体系

push したタグが何を publish するかを決める。**両パッケージ一緒が既定**だが、データパッケージは
独自のリリースサイクルで単独でも出せる — ライブラリ自体に何の変更がなくても、上流データが変われば
カバレッジは変わるため。

| タグ | publish 対象 | バージョンの照合先 |
| --- | --- | --- |
| `v1.2.3` | 両パッケージ | `packages/data/package.json` **と** `packages/core/package.json` の両方が `1.2.3` であること |
| `data-v1.2.3` | `jp-address-romaji-data` のみ | `packages/data/package.json` が `1.2.3` であること — core のバージョンは触られず、チェックもされない |
| `core-v1.2.3` | `jp-address-romaji` のみ | `packages/core/package.json` が `1.2.3` であること — data のバージョンは触られず、チェックもされない |

この3形のいずれにも一致しないタグは、暗黙に何かの既定へフォールバックするのではなく、ワーク
フローを即座に失敗させる（`Determine release plan` ステップ）。

`data-v*` / `core-v*` のリリースでは、もう一方のパッケージのバージョンが何かに一致している必要は
**ない** — それこそがスコープ付きタグの意義。`packages/data/package.json` を `0.2.0` に上げ、
`packages/core/package.json` は `0.1.0` のまま、`data-v0.2.0` をタグ付けするのが、データのみの
リフレッシュを出す通常の手順。

### プレリリースと dist-tag

**バージョンに `-` を含むものは `next` dist-tag へ、それ以外は `latest` へ publish される。**
ワークフローはこれをバージョンだけから導出する — 指定するための input は存在せず、両方の publish
ステップが同じ導出をする。

これは気遣いの類ではない。`--tag` なしの `npm publish` は、**semver 上のプレリリースであっても**
`latest` を動かす — npm はプレリリースを特別扱いしない。`0.1.0-rc.1` を `--tag next` なしで
publish すると、`npm install jp-address-romaji` がすべての利用者にリリース候補を渡すことになり、
修復手段は上に本物のバージョンを publish することだけ。その間、この誤りは公開されたまま、かつ
無音のまま。`Release plan` ステップサマリーが dist-tag を印字するのはまさにこのため — 値が間違って
いてもリリース成功にしか見えない、唯一のフィールドだから。

つまり `v0.1.0-rc.1` は両パッケージを `0.1.0-rc.1` として `next` の下に publish する。
`npm install jp-address-romaji@next` でインストールでき、それ以外の人からは見えない。スコープ付き
の形も同じように動く（`data-v0.2.0-rc.1` → `next`）。

覚えておくべき帰結が1つ: **CHANGELOG の見出しはバージョンをフィールド全体として照合する**ので、
`## 0.1.0-rc.1` と `## 0.1.0` は別セクションであり、各リリースは自分のセクションだけを得る。これが
重要なのは、以前の前方一致の照合では `## 0.1.0` が `## 0.1.0-rc.1 — …` にも一致してしまい、rc の
ノート（とその後ろのすべて）が正式リリースのノートに無言で畳み込まれていたから。同じ「フィールド
全体一致」の仕組みを使って、スコープ付きタグは見出しにも `data-` / `core-` の接頭辞を要求する
（下の「リリースを切る」手順2参照）——CHANGELOG.md がパッケージごとに分かれていない以上、
接頭辞なしでは `data-v0.2.0` と `core-v0.2.0` が同じ無印見出しに衝突しうる。

## リリースを切る

1. バージョンを決める。リリース対象の `packages/data/package.json` / `packages/core/package.json`
   の `version` を上げる — `v*` タグでは両者が互いに、かつタグと一致する必要があり、`data-v*` /
   `core-v*` タグではそのパッケージのバージョンだけがタグと一致すればよい（上の表参照）。
2. ルートの `CHANGELOG.md`（1ファイルのみ — `packages/data/CHANGELOG.md` は存在しない）に
   `## <見出し> — unreleased` 見出しを追記し、実際の日付に置き換える。**見出しの形はタグの
   スコープで決まる**（`v*` と `data-v*`/`core-v*` で異なる — 両パッケージの節が同じファイルに
   同居するため、スコープ付きタグは見出しにもスコープを入れないと、隣の節と衝突する）:

   | タグ | 見出し | 例 |
   | --- | --- | --- |
   | `v1.2.3`（両パッケージ） | `## <version>` | `## 0.1.0 — 2026-08-05` |
   | `data-v1.2.3` | `## data-<version>` | `## data-0.2.0 — 2026-08-05` |
   | `core-v1.2.3` | `## core-<version>` | `## core-0.3.0 — 2026-08-05` |

   リリースワークフローは、見出しのバージョンフィールドがこの値に完全一致するセクションから
   GitHub Release の本文を抽出するので、これはタグ付け前に済ませる必要がある — ワークフロー
   自身の CHANGELOG ガードステップは、セクションが欠けているかまだ `unreleased` のままだと run
   を失敗させる。tag push のみ（`workflow_dispatch` は警告どまり）。両方の変更をコミットする。

   既存の `## 0.1.2` のような無印見出しは書き換えない — 過去のリリースはすべて `v*` タグで
   出ているので、そのままの形で正しい。無印見出しが使われるのは `v*` タグのときだけで、
   `data-v*` / `core-v*` は必ずスコープ付きの見出しを要求する。
3. タグを付けて push する:

   ```sh
   git tag v0.1.0            # both packages
   # or: git tag data-v0.2.0 # data package only
   # or: git tag core-v0.3.0 # core package only
   git push origin v0.1.0
   ```

   tag push でワークフローが自動起動する: `dry_run` は強制的にオフになり、タグのスコープがどの
   パッケージを publish するかを決め（両方のときは data が core より先）、CHANGELOG のセクション
   から GitHub Release が作られる。タイトルはスコープに合わせて付く
   （例: `jp-address-romaji-data data-v0.2.0`）。
4. run を見守る（`gh run watch`、または Actions タブ）。ステップサマリーにはリリース計画
   （トリガー、dry_run、これから publish される正確なバージョン）、pack した tarball の内容、
   pack 済み tarball の内容 assertion、データセット前提レポートが載る。green でも読むこと。

ワークフロー実行時にパッケージ名/バージョンが既にレジストリにある場合 — たとえば部分失敗の後に
タグを再 push した場合 — そのパッケージの publish ステップは `npm view` でそれを検出し、エラーに
せずスキップするので、再実行は安全。GitHub Release も同じで、そのタグの Release が既にあれば
`gh release view` で検出してそのまま残す。

### タグを GitHub の UI から作る場合（`git push` が使えないとき）

セッションの資格情報ではタグを push できない（403）。**リリース画面からタグごと作れる**ので、
ブラウザさえあれば代われる。ただし `git tag` / `git push` 経路が使えるならそちらを優先すること
——UI 経路には下の2つの手作業が付きまとう。

`https://github.com/tomatomerde/jp-address-romaji/releases/new` →
Choose a tag に `v<version>` を打って **Create new tag: … on publish** → **Target には `main` では
なく、公開物を実際にビルドしたコミットを指定する**（Target ドロップダウンはブランチだけでなく
コミット SHA も選べる）。`main` はタグ付け時点で公開物のビルド元より先に進んでいることがあり、
その場合 `v<version>` は誤ったコミットを指す——`package.json` のバージョンガードはそれを検出
できない（ワークフローが見るのはバージョン番号だけで、コミットの中身ではないため）。たとえば
`0.1.2` の publish は `52104b0` 時点の main で走った。

タグができた時点でこのワークフローが起動する。**publish は既にレジストリにあるものをスキップし、
Release も既に存在するのでそのまま残る**ので、公開済みバージョンに後からタグだけを付けたい
ときにも使える（今回 `0.1.2` がその状態になった。経緯は `project-status.md`）。ただし Release が
既に存在する場合、その本文は CHANGELOG から自動生成されない（ワークフローの「Create GitHub
Release」ステップは既存 Release を残すだけで上書きしない）。UI で新規に Release を作る場合も
本文は入力した内容がそのまま使われ、CHANGELOG からは生成されない。どちらの場合も、該当バージョンの
CHANGELOG の節を**手動でコピーして本文に貼ること**——`v0.1.0` / `v0.1.1` の Release と体裁を
揃えるため。

### リリース候補と、それが守るもの・守らないもの

`npm publish` はこのパイプラインで dry run が実行できない唯一のステップであり、かつ取り消しの
効かない唯一のステップでもある — npm は publish されたバージョンを永久に保持し、unpublish は
依存者ゼロかつ最初の72時間に限られる。provenance attestation と GitHub Release も同様で、どちらも
本物の tag push でしか起きない。これが候補版を先に publish する論拠であり、0.1.0 は 2026-08-10 に
その方式でリリースされた。

**rc について前提していた2つのことが誤りと判明し、どちらも publish して初めて見えた。** 候補に
バージョンを1つ費やすと決める前に、以下を読むこと:

- **ある名前に最初に publish されたバージョンは、`--tag` が何と言おうと `latest` になる。**
  レジストリは `latest` をどこかへ向けなければならず、新規パッケージには他に向ける先がない。
  `0.1.0-rc.1` は `--tag next` で出て — ログにも `Publishing … with tag next` とある — それでも
  `latest` はそれに解決された。`latest` は削除できないので、修復は本物のバージョンを publish する
  ことだけ。**新しい名前の初回リリースにおいて、候補版は `npm install <pkg>` について何も守らない。
  買えるのはリハーサルだけ。**
- **プレリリースは caret レンジを満たさない。** `jp-address-romaji` が `jp-address-romaji-data` に
  張る optional peer レンジは `^0.1.0` で、`0.1.0-rc.1` はこれに一致しない。そのため2つの rc
  パッケージは一緒にインストールすること自体ができず（`npm error notarget`）、「インストールして
  何か変換してみる」チェックは実行できなかった。0.1.0 以降、レンジはプレリリースを許す
  `^0.1.0-0` にしてある — これがないと、将来の候補版も同じ形でテスト不能になる。

つまり候補版は、publish 経路のリハーサルをしたいときには切る価値があり、実際ここでは元を取った:
数時間後に置き換えられるバージョンの上で、`EOTP` のトークン問題を2回と、上の2つの事実を捕まえた。
新しい名前の `latest` を綺麗に保つことを期待して切る価値はない。それはできないから。

切るときの手順:

1. 両方の `package.json` をそのバージョンにして `v<version>-rc.N` をタグ付けする。
2. run を読む: provenance が付いたこと
   （`https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>` が `publish` と
   `provenance` を列挙する）、GitHub Release が stable のセクションではなく rc のノートで作られた
   こと、`npm view <pkg> dist-tags` が期待どおりであること — 名前の初回 publish なら `latest` も
   含めて。
3. スクラッチディレクトリでレジストリからインストールし、変換を1件実行する。ここまでのすべては
   ローカル tarball からのテストだった。このステップの成否から何かを結論する前に、**パッケージ
   同士が実際に一緒にインストールできること**を確認する。
4. その後、両方の `package.json` を stable バージョンに上げ、その見出しに日付を入れ、タグ付けする。

### 手動 / dispatch 実行

`workflow_dispatch`（Actions タブ → **Release** → **Run workflow**）は、タグなしで同一の
パイプラインを実行する:

| Input | 値 | 既定 | 用途 |
| --- | --- | --- | --- |
| `packages` | `both` / `data-only` / `core-only` | `both` | 片方のパッケージだけの publish。例: ライブラリに変更のない、データのみのリフレッシュリリース |
| `dry_run` | boolean | `true` | パイプラインが成功するはずだと証明する — データセットビルド、前提チェック、フルテストスイート、pack、型チェック、import スモークテストはすべて走り、最後の `npm publish` だけがスキップされる |
| `concurrency` | number | `8` | `Refresh address data and coverage` ワークフローのノブと同じ。データセットビルドがスロットリングされるなら下げる |

dispatch 実行は、`dry_run: false` であっても GitHub Release を作らない — それをするのは tag push
だけなので、部分失敗からの復旧のために dispatch で再 publish しても、重複した Release は生まれない。

dispatch にはタグがないため、バージョン一致ガードは走らない。選択した各パッケージの
`package.json` にいま入っているバージョンをそのまま publish する。それが望みでなければ、先に
bump してコミットすること。これから publish されるバージョンは必ずログとステップサマリーに
書かれる（`Log target package versions` ステップ）。まさにこの経路がガードを飛ばすからこそ —
dispatch 実行を信用する前に確認すること。

## データセットのダウンロードが不調なとき

ビルドは約1,899の自治体ファイルを、HTTP リクエスト1件ずつ、8並列で取得する。この件数では、
たった1件のリクエスト失敗で死ぬリリースは運で決まるリリースになるので、`build-data.ts` は2段階で
リトライする:

1. **一括パス。** 各リクエストは `--attempts` 回（既定3回）試行し、`--retry-delay`（500 ms、
   倍々）からの指数バックオフを挟む。
2. **スイープ。** それでもなお失敗したものを、後から**1件ずつ**、4倍長いバックオフでリトライ
   する。1段目の失敗はたいてい自分で作った輻輳 — 兄弟リクエストが7件飛んでいる — なので、
   価値のあるリトライは、ゆっくり単独で行うもの。復旧した自治体はログに名前が出る。

スイープを生き延びた失敗だけがビルドを失敗させ、それらは数ではなく名前で列挙される。部分的な
データセットは決して publish されてはならないため、ビルドは自治体ごとにちょうど1ファイルを
書けていない限り、exit 0 を拒否する。

`--concurrency`・`--attempts`・`--retry-delay` はいずれも正の整数としてパースできなければならず、
それ以外は入口で拒否する。これは杓子定規ではない — かつて数値でない `--concurrency` が `NaN` の
ままワーカープールに達し、ワーカーが**ゼロ**個起動し、何もダウンロードせず、"Done. 0 towns" で
exit 0 した。

`packages/data/test/build-data.test.ts` は、失敗ポリシーを注入できるローカル HTTP サーバーに
対して実物のスクリプトを走らせ、3つの結末 — クリーンな実行、スイープで復旧、復旧せず — を
すべてカバーする。上流ホストには開発環境から到達できないため、GitHub ランナーの外でこの経路を
検証する手段は、このフィクスチャサーバーだけ。

## publish の前にワークフローが強制すること

（それぞれの理由は `release.yml` にインラインで書いてある。ここは単なるチェックリスト。）

- タグのバージョンが、タグのスコープが選ぶすべてのパッケージの `package.json` の `version` と
  等しいこと（tag push のみ — どのタグがどのパッケージをチェックするかは、上のタグ体系の表参照）。
- CHANGELOG にリリース対象バージョンのセクションがあり、まだ `unreleased` と書かれたままでない
  こと（tag push のみ。そこではブロッキングで、`workflow_dispatch` の dry run では警告）。
- `scripts/verify-data-assumptions.ts` が通ること — リフレッシュワークフローのレポート専用の実行と
  違い、ブロッキング。
- `JP_ADDRESS_ROMAJI_DATA_DIR` をビルドしたてのデータセットに向けた状態でフルテストスイートが
  通ること。これで `realdata.test.ts` がスキップされずに実際に走る。
- `packages/data/scripts/check-publishable.mjs` が独立したステップとして通ること —
  `npm publish <tarball>` は `prepublishOnly` を実行しない（検証済み: ライフサイクルスクリプトは
  ディレクトリベースの publish でしか発火しない）ので、tarball を publish するパイプラインでは、
  これ以外にデータセットの欠落を捕まえるものがない。
- pack した **tarball そのもの** — 作業ディレクトリではなく — に入るべきものが入っていること:
  データパッケージは `package/data/ja.json` と `package/data/ja/` 配下の1,800以上の自治体
  ファイル、core は `package/dist/index.js` と `package/dist/index.d.ts`。package.json の `files`
  は現状 `.gitignore` を正しく上書きしているが、それは今日の設定がたまたま持つ性質であって、
  このパイプラインが今後も無条件に信用してよいものではない — `Assert data/core tarball contents`
  ステップ参照。
- pack した各 tarball に対して `@arethetypeswrong/cli --profile esm-only` がクリーンであること。
- 各パッケージのビルド済み `dist/index.js` が実際に `import()` に成功すること。
- npm が 11.5.1 以上であること。アップグレードステップの直後だけでなく、publish の直前にも
  再チェックする — trusted publishing の下限であり、古い npm はバージョンについて何も語らない
  認証エラーで失敗するから。

## リリース間のデータリフレッシュ

`Refresh address data and coverage` ワークフローは、GitHub ランナー上で同等のデータセットビルドを
行い、データセットを artifact としてアップロードするが、何も publish しない — これはレポートで
あり、その前提チェックも非ブロッキング。上流データがドリフトしていないかをスケジュールで確認する
ため、あるいはデータセットホスト自体に到達できない開発環境から実データを見るために使う。月次で
走るのはそのため。

## ローカル publish（fallback であって既定ではない）

ワークフローが使えず、かつリリースが待てない場合にのみ使う。実行するマシンでの `npm login` が
必要で、pack 済み tarball ではなくディレクトリから publish するため、ワークフローのように独立した
明示的ステップとしてではなく、`prepublishOnly` を直接実行する形になる。ワークフローが追加で行う
`scripts/verify-data-assumptions.ts`、実データに対するフルテストスイート、pack 済み tarball の
型/import チェックは**実行しない**。先に自分で走らせること。

```sh
npx tsx packages/data/src/build-data.ts --out ./packages/data/data
npx tsx scripts/verify-data-assumptions.ts --data ./packages/data/data   # read the output
JP_ADDRESS_ROMAJI_DATA_DIR=./packages/data/data pnpm test
npx tsx scripts/measure-coverage.ts --data ./packages/data/data > docs/coverage.md   # commit if changed

pnpm -r build
pnpm --filter jp-address-romaji-data publish
pnpm --filter jp-address-romaji publish
```

`prepublishOnly` は各パッケージを再ビルドし、データパッケージはさらに、47都道府県すべてと
約1,899の自治体ファイルが揃っていることを検証してから、`pnpm publish`（ディレクトリベース。
ワークフローの tarball publish とは異なる）の続行を許す。
