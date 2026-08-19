# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#動作要件)
[![ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#動作要件)
[![no network at runtime in Node](https://img.shields.io/badge/network%20at%20runtime%20%28Node%29-none-brightgreen.svg)](#動作要件)
[![browser: bring your own endpoint](https://img.shields.io/badge/browser-bring%20your%20own%20endpoint-blue.svg)](#ブラウザで使う)
[![Live demo](https://img.shields.io/badge/demo-live-1c5d99.svg)](https://tomatomerde.github.io/jp-address-romaji/)

[English](./README.md) | **日本語**

日本の住所を、日本語表記とローマ字（国際・西洋語順）表記の間で双方向に変換する TypeScript
ライブラリです。配送ラベル、海外の決済フォームなど、日本の住所をラテン文字で書く必要が
ある場面のためのものです。

**住所は個人情報です。このライブラリは住所をどこにも送信しません。** ホスト型 API は提供せず、
登録も不要です。住所データのローカルコピーを読み込み、既定では一切ネットワークアクセスを
行いません。この保証は `fetch` を例外を投げるスタブに差し替えたテストで検証されており、
ネットワークに到達する退行が入れば CI が落ちます。

**[ブラウザで試す](https://tomatomerde.github.io/jp-address-romaji/)** —— 公開版のパッケージを
そのままページ内で動かし、データはそのページ自身のオリジンから配っています。デモは
**出したリクエストを全部並べる**ので、ブラウザで使う場合の唯一の注意点——都道府県と市区町村は
URL に出て、それより後は出ない——を、文章ではなく実物で確かめられます。
[ブラウザで使う](#ブラウザで使う)を参照。

（英語版が原本です: [README.md](./README.md)）

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿二丁目8番1号');
// → { ok: true, value: { formatted: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿二丁目8-1', … } }
```

## このライブラリの位置づけ

住所正規化は**自作していません**。全面的に
[`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses)
に委譲しています。全角数字、漢数字、`丁目/番/号` とハイフン表記、都道府県の省略、異体字などは
すべて同ライブラリが処理します。本パッケージが実装するのは**その上のレイヤー**、すなわち
ローマ字化・語順変換・逆引き・各サービス向けフォーマット出力です。

また、読みを推測しません。ローマ字はすべてデータ由来です（データのローマ字フィールド、または
カナ読みを決定的に翻字したもの）。どちらも無い場合は明示的に失敗を返します。
**誤った宛名ラベルは、変換を断られることより有害だからです。**

## インストール

```sh
npm install jp-address-romaji jp-address-romaji-data
```

> **Node.js 18 以上、ESM 専用。** CommonJS ビルドは無く、追加する予定もありません——
> `require('jp-address-romaji')` は `ERR_PACKAGE_PATH_NOT_EXPORTED` で失敗します。`import`、または
> CommonJS からの動的 `import()` を使ってください。Node ではデータセットをファイルシステムから
> 読み、住所は端末の外に出ません。ブラウザにも対応していますが、データは自分でホストする
> 必要があります（[ブラウザで使う](#ブラウザで使う)）。詳細は[動作要件](#動作要件)。

`jp-address-romaji-data` はオフライン用データセットです。任意ですが、入れておけば設定不要で
動作します。自前のデータを指す場合:

```ts
import { configureDataSource } from 'jp-address-romaji';
configureDataSource({ dataDir: './address-data' });
```

データを自分で生成・更新する場合:

```sh
npx jp-address-romaji-data build --out ./address-data
```

このダウンロード時のみ Geolonia に接続します。**住所変換時は接続しません。**

## ブラウザで使う

ブラウザ用のエントリポイントを同梱しており、`exports` の `browser` 条件によって自動的に
選択されます。エクスポート条件を解釈するバンドラ（Vite・webpack・esbuild・Rollup・Parcel）で
あれば設定は不要です。API は Node と同一で、違うのはデータの供給元だけです——ページには
ファイルシステムが無いので、データは自分で配信し、その場所を指定します。

```ts
import { configureDataSource, toRomaji } from 'jp-address-romaji';

configureDataSource({ endpoint: 'https://your-site.example/address-data/ja' });

await toRomaji('東京都新宿区西新宿二丁目8番1号');
// → { ok: true, value: { formatted: '2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }
```

エンドポイントはデータセットのディレクトリに `/ja` を付けたものです。ライブラリはまず
`<endpoint>.json`（都道府県・市区町村の索引）を読み、続いて必要な1市区町村分の
`<endpoint>/<都道府県>/<市区町村>.json` だけを読みます。データセットは
`npx jp-address-romaji-data build --out ./address-data` で生成し、`address-data/` を静的
ファイルとして配信してください。全体は市区町村ごとに1ファイル（約1,900件）ですが、1回の変換で
取得するのは2ファイルなので、必要な市区町村だけを配信することもできます。その場合、配信して
いない市区町村の住所は、市区町村名を添えた `DATA_NOT_CONFIGURED` として返ります——例外では
なく、他と同じ失敗の値です。これには `0.1.7` 以降が要ります。**部分的なデータセットでは
これは異常系ではなく通常の入力**なので、導入不備としてではなく他の失敗理由と同じように
扱ってください。

**プライバシー上の主張がここで何を意味するか。** 市区町村ファイルの取得により、
**都道府県と市区町村は配信元サーバーのリクエスト URL に現れます**。それより後——番地・
建物名・宛名——はページ内で処理され、どこにも送信されません。プロセスの外に何も出ない Node
経路より弱い保証です。プライバシーを理由にこのライブラリを選ぶ利用者には、
どちらの保証なのかを明示してください。

[デモ](https://tomatomerde.github.io/jp-address-romaji/)がまさにこの構成です（一部の市区町村ぶんだけを
ページ自身のオリジンから配っています）。出したリクエストを全部並べてあるので、上の段落は
信用してもらうものではなく、確かめてもらえるものになっています。

`configureDataSource({ dataDir })` はブラウザでは動作しませんし、動作するふりもしません——
未設定のままとなり、変換は `DATA_NOT_CONFIGURED` を返します。

CI では変更のたびに、pack した tarball をブラウザ向けにバンドルしてヘッドレス Chromium で
住所を変換しています（`scripts/browser-smoke.mjs`）。ページが自分のオリジン以外に接続しないこと
も、そこで検証しています。

## 動作要件

Node エントリポイントは Node.js 18 以上、ブラウザ用エントリポイントはエクスポート条件を解釈する
バンドラが必要です。Node ではオフラインデータをファイルシステムから読み、ブラウザでは自身が
ホストするエンドポイントから読みます（[ブラウザで使う](#ブラウザで使う)）。

**ESM 専用で、CommonJS ビルドはありません。** 両パッケージとも `"type": "module"` で単一の ESM
エントリポイントのみを提供しており、`require()` で読める `dist/*.cjs` は存在せず、今後追加する
予定もありません。`import`（または CommonJS コードからの動的 `import()`）を使ってください。
`require('jp-address-romaji')` は `ERR_PACKAGE_PATH_NOT_EXPORTED` で失敗します。

## カバレッジ

同梱データセット全 638,567 行での実測:

| セグメント | 件数 | 実用可能 |
| --- | ---: | ---: |
| **丁目あり（都市部・住居表示）** | 92,971 | **99.99%** |
| **`大字` 始まり（農村部）** | 61,330 | **99.96%** |
| 全国 | 638,567 | **99.55%** |

カバレッジは都道府県ごとに**一様ではなく**、全国値はその差を隠しています。47都道府県のうち
21県は 99.9% 以上ですが、6府県は 95% 未満、2県は 90% 未満です（山梨 84.95%・長野 85.02%）。
一様なのは丁目ありのエントリのほうで、**全都道府県が 99.96% 以上**（ちょうど 100.00% でないのは
北海道だけ）。都市部の住所はほぼどこでも変換でき、拒否は一部の府県の丁目なしエントリに
集中する、という読み方になります。都道府県別の表は [docs/coverage.md](./docs/coverage.md) にあります。

読みが得られない全国 0.45% については、推測せず `NO_ROMAJI_DATA` を返します。

**カナとローマ字は同時に欠落しません。** ローマ字フィールドを持つのは 89.51% ですが、
カナ読みは 99.55% が持っています。つまり**約10件に1件はカナからの翻字で変換されており**、
この経路は稀なケースの保険ではなく主要な処理系です。

この数値は `scripts/measure-coverage.ts` が出力したものです。このスクリプトは公開パッケージには
含まれずこのリポジトリ側にあるので、別のデータ版で取り直すには clone とデータセットの生成が
必要です（`pnpm coverage:measure --data ./address-data`）。`npm install` だけでは実行できません。

## 非対応と明記するもの

- **ジオコーディング精度の保証**。同梱データから緯度経度は意図的に除外しています。
- **建物名の翻訳・ローマ字化**。建物名・部屋番号は `unparsed` として分離し、無変換で通します。
  型定義上も建物名に `romaji` フィールドはありません（意図的な設計です）。正規化器が一致させ
  られなかった住所の文字がここへ入ることはありません——失敗を返します。
  [部分一致した町名](#部分一致した町名)を参照。
- **京都の通り名のローマ字化**。保持はしますが翻訳はしません（下記）。
- **`fromRomaji` は西洋語順のみ**。都道府県が末尾にある前提です。`order: 'japanese'` の出力は
  表示用であり、そのまま入力に戻すことは想定していません（`PREFECTURE_NOT_FOUND` になります）。
  既定の西洋語順であればラウンドトリップします。
- **ローマ字から koaza を復元すること**。`fromRomaji` は koaza 専用の索引を持たないため、元の
  日本語住所にあった koaza はローマ字を経由した往復では復元できません（下記参照）。
- **データを自分でホストしないブラウザ利用**。フォールバック先のホスト型 API は意図的に
  用意していないため、エンドポイントを指定しないページでは何も変換できません
  （[ブラウザで使う](#ブラウザで使う)）。

### 京都市の通り名住所

京都市中心部では、町名の前に交差点と方向を示す通り名を書く慣習があります。**対応しています**:

```ts
await toRomaji('京都府京都市中京区烏丸通四条上ル笋町123');
// formatted:   '123 Takannacho, Nakagyo-ku, Kyoto-shi, Kyoto, Japan'
// kyotoStreet: '烏丸通四条上ル'
```

通り名は**正規化の前に**分離します。これは必須の処理です — 通り名には丁目と同じ漢数字が含まれる
ため、`烏丸通四条上ル笋町` をそのまま正規化器に渡すと**「四条」の四を丁目4と誤読**し、
まったく無関係の場所に解決されてしまいます。

通り名は行政区画ではなく道案内的な情報であり（正式な住所は町名＋番地）、`parsed.kyotoStreet` に
そのまま保持しますが、ローマ字文字列には**含めません**。ローマ字化もしません（データに通り名の
読みが無く、推測はこのライブラリが拒否する行為そのものだからです）。`fromRomaji` は通り名を復元
できないため、ローマ字を経由した往復では失われます。

通り名は認識できたが後続の町字がデータに無い場合は、`KYOTO_STREET_ADDRESS` を返し、
`partial.kyotoStreet` に通り名が入ります。

### 小字（named koaza）

町の下にさらに細かい区画名——小字——が付く住所があります。たとえば `長野県飯田市本町三丁目大横`
の `三丁目大横` です。データセットの読みがその小字全体を覆っていると確認できたときは、
ローマ字化して `parsed.koaza` に含めます:

```ts
await toRomaji('三重県伊賀市西明寺字天津川1-1');
// formatted:    '1-1 Azamatsugawa Saimyoji, Iga-shi, Mie, Japan'
// parsed.koaza: { ja: '字天津川', kana: 'アザアマツガワ', romaji: 'Azamatsugawa' }
```

読みを確認できないときは、住所の一部を落とすのではなく変換全体を失敗させます。冒頭に挙げた
`長野県飯田市本町三丁目大横` の `三丁目大横` がまさにそれで、データセットの読みは `３チョウメ`
——助数詞で止まっていて `大横` に届きません:

```ts
await toRomaji('長野県飯田市本町三丁目大横1-1');
// { ok: false, reason: 'KOAZA_READING_INCOMPLETE', … }
```

これを拒否するには `0.1.5` 以降が要ります。両方の例は
`packages/core/test/realdata.test.ts` で固定してあります。

同梱データセット全体での実測（`scripts/verify-data-assumptions.ts` の assumption 6/6b）:
638,567 件の町エントリのうち 437,014 件（68.437%）が koaza を持ちます。うち 18,409 件は数字のみで
`blockNumbers` に畳み込まれ、残る 418,605 件が名前つきです。名前つきの全件がカナ読みを持ちますが、
専用のローマ字フィールドを持つのは 781 件（0.187%）だけです。完全性チェックは名前つきのうち
417,206 件（99.666%）を通し、1,399 件（0.334%）を拒否します。拒否は2つの形があり、
どちらも**読みが名前より先に終わっている**ものです:

- **末尾の方位漢字（北/南/東/西/上/下/中）に読みが届いていない。** 南郷通（札幌市白石区）の
  koaza `一丁目北` のカナ読みは `チョウメ` までしか届きません。
- **読みが助数詞（`丁目`・`条`・`号`・`地割` など）で止まっているのに、名前がその先へ続く。**
  上の `三丁目大横` がこの形です——`横` は7つの方位漢字ではないので、方位漢字だけを見る
  検査では捕まりません。

こうした途中で切れた読みをローマ字化すると、別の実在する場所を静かに指してしまうため、
`KOAZA_READING_INCOMPLETE` として拒否します。

`fromRomaji` は koaza を復元しません——koaza 専用の索引が無いためです——ので、これは片方向だけの
機能拡張です。koaza を含む住所をローマ字化した文字列を `fromRomaji` に戻しても、同じ日本語住所には
なりません。多くは（`TOWN_NOT_FOUND` などで）失敗し、koaza の無い町に静かに解決されることは
ありません。

### 部分一致した町名

正規化は委譲しているため、書いた町名の**先頭だけ**に一致することがあります。`中井` はデータ
セットに存在しますが、`@geolonia/normalize-japanese-addresses` は無関係な `中町` の別名として
`中` も登録しており（末尾の `町` の省略を許容するため）、そちらを先に試します。その結果
`東京都新宿区中井1番1号` は `中町` に一致し、`井` が余っていました。

`0.1.7` まで、この余りは建物名の欄へ流され、変換は成功していました:

```ts
await toRomaji('東京都新宿区中井1番1号');
// 0.1.7: { ok: true, formatted: '井1-1, Nakacho, Shinjuku-ku, Tokyo, Japan' }
// 0.1.8: { ok: false, reason: 'TOWN_NOT_FOUND',
//          message: 'Resolved the town as "中町", but "井1-1" was left between it and the block numbers …' }
```

`0.1.8` からは、町名と番地の間に残った文字を失敗として返します。そこにある文字は一致させられ
なかった住所の一部であり、つまりその町名は住所が指している町ではありません。同じ形は、短い
町名が長い町名の先頭に一致する場合（`宮の森` / `宮の森一条`）や、表記そのものが余る場合
（`旭ケ丘1番1号`。先頭の `1` が丁目として読まれる）にも起きます。

正規化器が丸ごと一致できる形で書けば解決します——`中井1-1` と `中井一丁目1番1号` は、この変更の
前後どちらでも通ります。

番地のあとに書かれた建物名、および番地が無く空白で区切られた建物名（`…中町 サンプルビル301`）は、
これまでどおり `unparsed` としてそのまま通します。

### 実際に遭遇するデータ側の欠陥

以下は変換ロジックではなく**上流データの性質**です。本ライブラリはこれらを検出し、
誤った住所を出す代わりに失敗を返すため、利用時は「失敗」として現れます。

- **隣接エントリの読みを持ってしまっている行が少数あります。** 名前に対してカナが不自然に長い
  場合は信頼できないため、その住所は双方向とも到達不能になります（`toRomaji` は
  `CORRUPT_ROMAJI_DATA` を返し、`fromRomaji` も候補に出しません）。現行データでは稀です。
- **町字名の短縮形は曖昧になり得ます。** 出荷データセットに対してマッチャ自身のキー関数で
  実測: `fromRomaji` が索引するローマ字キーの 1.07%
  （259,703 中 2,780）が、同一市区町村内で複数の異なる町字に一致します（函館市には
  `昭和町` と `昭和` の両方が存在するため `"Showa"` は両方に一致）。フルネーム
  （`"Showa-cho"`）を書けばその約半分は解決し、本ライブラリの出力は常にフルネームです。
  短縮形を手入力した場合は候補付きの `AMBIGUOUS` が返ります。

## 状態と免責

**バージョン `0.x`。API は変わりうる状態です。** 個人プロジェクトであり、対応は
ベストエフォートで行います。Issue や Pull Request は歓迎しますが、応答時期は保証しません。

本ソフトウェアは MIT ライセンスのとおり **無保証（as is）** で提供します。定型文以上に
明示しておくべき制限が2点あります。いずれも「できているはず」と思われがちなものです。

- **変換に成功したことは、その住所が実在することを意味しません。** 出力はデータセットの
  内容を反映したものであって、配達可能であることも、現在使われていることも保証しません。
  市町村合併や住居表示の実施により、データセットは現実から一定期間遅れます。
- **郵送・法務・金融上の判断の唯一の根拠にしないでください。** このライブラリは推測せず
  拒否する設計で、失敗を呼び出し側が扱うべき型付きの値として返すのはそのためですが、
  保証しているのは「拒否すること」であって「正しいこと」ではありません。誤った住所が
  実損につながる場面では、しかるべき機関で確認してください。

## API

### `toRomaji(japaneseAddress, options?)`

```ts
const result = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3 サンプルビル301');
if (result.ok) {
  result.value.formatted;        // 'サンプルビル301, 1-2-3 Uehara, Shibuya-ku, Tokyo 151-0064, Japan'
  result.value.parsed.town;      // { ja: '上原', kana: 'ウエハラ', romaji: 'Uehara' }
  result.value.parsed.unparsed;  // 'サンプルビル301' — ローマ字化されない
} else {
  result.reason;                 // 'NO_ROMAJI_DATA' | 'TOWN_NOT_FOUND' | …
}
```

| オプション | 値 | 既定 | 備考 |
| --- | --- | --- | --- |
| `longVowel` | `'none'` `'macron'` `'circumflex'` `'oh'` | `'none'` | `'none'` はパスポート式ヘボン。それ以外はカナ読みが必要（下記）。 |
| `order` | `'western'` `'japanese'` | `'western'` | |
| `includeCountry` | boolean | `true` | 末尾に `, Japan` を付与。 |
| `postalCode` | `'suffix'` `'prefix'` `'omit'` | `'suffix'` | |
| `capitalization` | `'title'` `'upper'` | `'title'` | |
| `includeUnparsed` | boolean | `true` | 建物名を `formatted` に含めるか。`parsed` には常に保持。 |

`'none'` 以外の長音表記は、データのローマ字フィールドではなく**カナから導出**します。
データのローマ字は全大文字かつ既に長音が失われており（`KITA1-JOHIGASHI`）、そこから `Tōkyō` は
復元できないためです。カナ読みが無い場合は `KANA_REQUIRED_FOR_LONG_VOWELS` で失敗します。
黙って長音なしの綴りを返すことはしません。

### `fromRomaji(romajiAddress, options?)`

解決は必ず外側から内側へ（都道府県 → 市区町村 → 町字）行います。完全形キーで書けば、町字の
97.95% は市区町村が判明していれば一意ですが、全国文脈では 59.92% まで落ちます。市区町村名も
衝突します——**都道府県をまたいでローマ字表記を共有する市区町村の組が 39、関わる市区町村は 86**。
そのうち 19 組は日本語表記まで同じ名前で（伊達市・美里町・池田町 など）、
残る 20 組は**別の名前がたまたま同じローマ字になる**もの
です——`Mihama-cho` は三重県の御浜町と、他3県の美浜町。

このページのカバレッジと曖昧性の数値は、出荷データセットに対してマッチャ自身のキー関数で測り、
[docs/coverage.md](./docs/coverage.md) に生成しているものです。文のほうが追従していなければ
CI が落ちます。上の koaza の数値だけは `scripts/verify-data-assumptions.ts` 由来で、
同じ月次ワークフローが実行しますが、照合はしていません（報告のみ）。

複数該当する場合は、**候補付きで** `AMBIGUOUS` を返し、選択は呼び出し側に委ねます:

```ts
const result = await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto');
// { ok: false, reason: 'AMBIGUOUS',
//   candidates: [ …町: 夷町…, …町: 恵比須町… ] }
// 夷町 と 恵比須町 は京都市中京区に実在する別の町字で、
// どちらもローマ字は "Ebisu-cho" になります。
```

#### 郵便番号

入力中の郵便番号は `parsed.postalCode` に格納されます。照合手段を渡せば、曖昧な
ローマ字表記を絞り込むのに使えます:

```ts
await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto 604-8081', {
  postalCodeIndex: (code) => myPostalData[code],   // -> ['夷町']
});
// → { ok: true, … town: 夷町 }
```

郵便番号データは同梱していません。フルネームを書いても解決しない曖昧性は全形キーの 0.67%
（211,041 中 1,406、関与する町字は全国 2,622）にとどまり、日本郵便の `KEN_ALL`（独自の
ライセンスと更新系統を持つ第二のデータ源）を抱える価値に見合わないと判断しました。
既にお持ちの郵便番号データを差し込めます。

一つに絞り込めなかった場合は `AMBIGUOUS` のままです。**候補を推測で1つに決めることはありません。**

### `parse(address)`

表記（日本語／ローマ字）を自動判別し、いずれの場合も `ParsedAddress` を返します。

### `toFormat(parsed, target)`

住所がラベルではなく決済フォームや API に入る場合、必要なのはローマ字化そのものではなく、
その提供元が期待するフィールドに正しく分解することです。日本の住所は多くの API が前提と
する `line1 / city / state` の形に素直に収まらず、たいてい建物名が壊れます。

対象: `'google-i18n'` / `'shopify'` / `'stripe'`。

```ts
toFormat(parsed, 'stripe');
// { line1: '1-2-3 Uehara', line2: 'サンプルビル301', city: 'Shibuya-ku',
//   state: 'Tokyo', postal_code: '151-0064', country: 'JP' }
```

建物名は、その形式が2行目の住所に使うフィールドへ**そのまま・ローマ字化せずに**入ります
（Stripe は `line2`、Shopify は `address2`、`google-i18n` は `addressLines` の2要素目）。
これは意図的で、`サンプルビル301` は配達員が読む文字列であり、権威ある読み方が存在しない
ためです。

それ以外も各形式の呼び名に従います。都道府県は `state`（Stripe）/ `province`（Shopify）/
`administrativeArea`（`google-i18n`）に入り、市区町村と区は1つの locality 行にまとめられます。
`google-i18n` だけは町字を `sublocality` に保持できます（他の2つには対応する欄がありません）。

## 失敗は例外ではなく値

変換できない住所で例外は投げません。すべての入口が判別可能なユニオンを返すため、
失敗ケースの処理を型システムが強制します。

| `reason` | 意味 |
| --- | --- |
| `NO_ROMAJI_DATA` | 町字にローマ字もカナも無い。農村部の `大字` 名で頻出。 |
| `CORRUPT_ROMAJI_DATA` | データの読みが自己矛盾しており棄却した。 |
| `KANA_REQUIRED_FOR_LONG_VOWELS` | 長音表記を要求されたがカナ読みが無い。 |
| `KOAZA_READING_INCOMPLETE` | 町に名前つきの koaza があるが、その読みが名前全体を覆っているか確認できない（[小字（named koaza）](#小字named-koaza)を参照）。読みが不完全なまま出す代わりに拒否する。 |
| `AMBIGUOUS` | 複数の日本語住所が該当。`candidates` に格納。 |
| `TOWN_NOT_FOUND` / `CITY_NOT_FOUND` / `PREFECTURE_NOT_FOUND` | その階層で解決が止まったか、町名が部分的にしか一致せず番地の前に文字が残った（[部分一致した町名](#部分一致した町名)を参照）。`partial` に判明分を格納。 |
| `KYOTO_STREET_ADDRESS` | 通り名は認識できたが、後続の町字がデータに無い（[京都市の通り名住所](#京都市の通り名住所)）。 |
| `DATA_NOT_CONFIGURED` | データセット未導入・未設定。 |
| `EMPTY_INPUT` | 住所として認識できる内容が無い。 |

## ロードマップ

### 検討中

機能一覧からではなく、実際の住所データが要求するものから拾っています。いずれも
**既定でやらなかった理由**まで書いてあるので、**必要ならイシューでそう言ってください**。
実装するかどうかと既定値を決めるのは、実際の利用場面のほうです。

- [ローマ字から小字を読み戻す](https://github.com/tomatomerde/jp-address-romaji/issues/68)
  — `toRomaji` は書き出すのに `fromRomaji` は読み戻せず、往復が一方通行になっている
- [郵便番号の索引を同梱する](https://github.com/tomatomerde/jp-address-romaji/issues/69)
  — `postalCodeIndex` のフックはあるがデータが無い。既存のホスト型の選択肢は、
  郵便番号をどこかへ送って解決している
- [CommonJS ビルド](https://github.com/tomatomerde/jp-address-romaji/issues/70)
  — `require()` はどの Node のバージョンでも解決しない
- [建物名を判定する日本語文字クラスを広げる](https://github.com/tomatomerde/jp-address-romaji/issues/71)
  — `々`・互換漢字・BMP 外の漢字が範囲外。実データで踏むトリガーはまだ見つかっていない
- [ブラウザのデータ取得で市区町村を URL に出さない](https://github.com/tomatomerde/jp-address-romaji/issues/72)
  — ブラウザ経路の保証は Node より弱く、デモはそれを丸めずにそう書いている

いずれもこのライブラリの土台にある2つの規則には触れません——確認できない読みは、もっともらしい
綴りに丸めず拒否する。そしてホスト型のサービスにフォールバックしない（これは文章の主張ではなく、
テストが強制しています）。**挙動を足すものはオプトインで既定はオフ**にし、成果物を足すものは
いま出しているものを置き換えず、並べて出します。

**意図して**やらないと決めているものは[非対応と明記するもの](#非対応と明記するもの)にあります。

他にあれば
[イシューを立ててください](https://github.com/tomatomerde/jp-address-romaji/issues/new?template=feature_request.yml)。
**実際の住所を数件**添えてもらえると、それが判断材料になります。

## データ出典とライセンス

住所データはデジタル庁
**[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address)**
を出典とし、**[Geolonia](https://geolonia.com/)** が加工・公開したものです。

- [`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses) — MIT
- [`@geolonia/japanese-addresses-v2`](https://github.com/geolonia/japanese-addresses-v2) — MIT

アドレス・ベース・レジストリはデジタル庁により、商用利用を含む自由な利用を認める条件で
公開されています。利用にあたっては上記リンクで最新の条件をご確認ください。

本ライブラリは MIT ライセンスです。[LICENSE](./LICENSE) を参照してください。

## Contributing

このライブラリが壊してはいけない前提、ローカル開発環境のセットアップ、ブランチ・PR の運用は
[CONTRIBUTING.md](./CONTRIBUTING.md)（英語）を参照してください。
