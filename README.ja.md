# jp-address-romaji

[![npm](https://img.shields.io/npm/v/jp-address-romaji.svg)](https://www.npmjs.com/package/jp-address-romaji)
[![CI](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml/badge.svg)](https://github.com/tomatomerde/jp-address-romaji/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node.js 18+](https://img.shields.io/badge/Node.js-18%2B-brightgreen.svg)](#動作要件)
[![ESM only](https://img.shields.io/badge/module-ESM%20only-orange.svg)](#動作要件)
[![no network at runtime](https://img.shields.io/badge/network%20at%20runtime-none-brightgreen.svg)](#動作要件)

[English](./README.md) | **日本語**

日本の住所を、日本語表記とローマ字（国際・西洋語順）表記の間で双方向に変換する TypeScript
ライブラリです。配送ラベル、海外の決済フォームなど、日本の住所をラテン文字で書く必要が
ある場面のためのものです。

**住所は個人情報です。このライブラリは住所をどこにも送信しません。** ホスト型 API は提供せず、
登録も不要です。住所データのローカルコピーを読み込み、既定では一切ネットワークアクセスを
行いません。この保証は `fetch` を例外を投げるスタブに差し替えたテストで検証されており、
ネットワークに到達する退行が入れば CI が落ちます。

（英語版が原本です: [README.md](./README.md)）

```ts
import { toRomaji, fromRomaji } from 'jp-address-romaji';

await toRomaji('東京都新宿区西新宿三丁目5番12号');
// → { ok: true, value: { formatted: '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan', … } }

await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
// → { ok: true, value: { formatted: '東京都新宿区西新宿三丁目5-12', … } }
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
> `require('jp-address-romaji')` は `ERR_REQUIRE_ESM` で失敗します。`import`、または
> CommonJS からの動的 `import()` を使ってください。データセットはファイルシステムから
> 読むため既定構成は Node 専用で、ブラウザで使うには自身がホストするエンドポイントが
> 必要です。詳細は[動作要件](#動作要件)。

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

## 動作要件

Node.js 18 以上。オフラインデータをファイルシステムから読むため、既定構成は Node 専用です。
ブラウザで使う場合は、自身がホストするエンドポイント経由でデータを供給する必要があります。

**ESM 専用で、CommonJS ビルドはありません。** 両パッケージとも `"type": "module"` で単一の ESM
エントリポイントのみを提供しており、`require()` で読める `dist/*.cjs` は存在せず、今後追加する
予定もありません。`import`（または CommonJS コードからの動的 `import()`）を使ってください。
`require('jp-address-romaji')` は `ERR_REQUIRE_ESM` で失敗します。

## カバレッジ

同梱データセット全 638,567 行での実測:

| セグメント | 件数 | 実用可能 |
| --- | ---: | ---: |
| **丁目あり（都市部・住居表示）** | 92,971 | **99.99%** |
| **`大字` 始まり（郊外）** | 61,330 | **99.96%** |
| 全国 | 638,567 | **99.55%** |

カバレッジは都道府県ごとに**一様ではなく**、全国値はその差を隠しています。47都道府県のうち
21県は 99.9% 以上ですが、6県は 95% 未満、2県は 90% 未満です（山梨 84.95%・長野 85.02%）。
一様なのは丁目ありのエントリのほうで、**全県が 99.96% 以上**（ちょうど 100.00% でないのは
北海道だけ）。都市部の住所はほぼどこでも変換でき、拒否は一部の県の丁目なしエントリに
集中する、という読み方になります。県別の表は [docs/coverage.md](./docs/coverage.md) にあります。

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
  型定義上も建物名に `romaji` フィールドはありません（意図的な設計です）。
- **京都の通り名のローマ字化**。保持はしますが翻訳はしません（下記）。
- **`fromRomaji` は西洋語順のみ**。都道府県が末尾にある前提です。`order: 'japanese'` の出力は
  表示用であり、そのまま入力に戻すことは想定していません（`PREFECTURE_NOT_FOUND` になります）。
  既定の西洋語順であればラウンドトリップします。

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

### 実際に遭遇するデータ側の欠陥

以下は変換ロジックではなく**上流データの性質**です。本ライブラリはこれらを検出し、
誤った住所を出す代わりに失敗を返すため、利用時は「失敗」として現れます。

- **隣接エントリの読みを持ってしまっている行が少数あります。** 名前に対してカナが不自然に長い
  場合は信頼できないため、その住所は双方向とも到達不能になります（`toRomaji` は
  `CORRUPT_ROMAJI_DATA` を返し、`fromRomaji` も候補に出しません）。現行データでは稀です。
- **町字名の短縮形は曖昧になり得ます。** 町字ローマ字の 1.23% が、同一市区町村内で複数の異なる
  町字に一致します（函館市には `昭和町` と `昭和一丁目` の両方が存在するため `"Showa"` は
  両方に一致）。フルネーム（`"Showa-cho"`）を書けば解決し、本ライブラリの出力は常にフルネーム
  です。短縮形を手入力した場合は候補付きの `AMBIGUOUS` が返ります。

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

解決は必ず外側から内側へ（都道府県 → 市区町村 → 町字）行います。町字のローマ字は市区町村が
判明していれば 99.05% 一意ですが、全国文脈では大きく落ち、市区町村名も全国で 13 件衝突します
（`Date-shi` は 北海道伊達市 と 福島県伊達市 の両方）。

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

郵便番号データは同梱していません。本物の曖昧性は町字ローマ字の 0.95% にとどまり、その多くは
フルネームを書けば解消するため、日本郵政の `KEN_ALL`（独自のライセンスと更新系統を持つ第二の
データ源）を抱える価値に見合わないと判断しました。既にお持ちの郵便番号データを差し込めます。

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
| `NO_ROMAJI_DATA` | 町字にローマ字もカナも無い。郊外の `大字` 名で頻出。 |
| `CORRUPT_ROMAJI_DATA` | データの読みが自己矛盾しており棄却した。 |
| `KANA_REQUIRED_FOR_LONG_VOWELS` | 長音表記を要求されたがカナ読みが無い。 |
| `AMBIGUOUS` | 複数の日本語住所が該当。`candidates` に格納。 |
| `TOWN_NOT_FOUND` / `CITY_NOT_FOUND` / `PREFECTURE_NOT_FOUND` | その階層で解決が止まった。`partial` に判明分を格納。 |
| `KYOTO_STREET_ADDRESS` | 通り名は認識できたが、後続の町字がデータに無い（下記）。 |
| `DATA_NOT_CONFIGURED` | データセット未導入・未設定。 |
| `EMPTY_INPUT` | 住所として認識できる内容が無い。 |

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
