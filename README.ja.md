# jp-address-romaji

日本の住所を、日本語表記とローマ字（国際・西洋語順）表記の間で双方向に変換する TypeScript ライブラリです。

**住所は個人情報です。このライブラリは住所をどこにも送信しません。** ホスト型 API は提供せず、登録も不要です。住所データのローカルコピーを読み込み、既定では一切ネットワークアクセスを行いません。この保証は `fetch` を例外を投げるスタブに差し替えたテストで検証されています。

The English README is the primary one: [README.md](./README.md).

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

### `fromRomaji(romajiAddress)`

解決は必ず外側から内側へ（都道府県 → 市区町村 → 町字）行います。町字のローマ字は市区町村が
判明していれば 99.7% 一意ですが、全国文脈では大きく落ち、市区町村名も全国で 13 件衝突します
（`Date-shi` は 北海道伊達市 と 福島県伊達市 の両方）。

複数該当する場合は、**候補付きで** `AMBIGUOUS` を返し、選択は呼び出し側に委ねます:

```ts
const result = await fromRomaji('1-1 Harabetsu, Aomori-shi, Aomori');
// { ok: false, reason: 'AMBIGUOUS', candidates: [ …大字原別…, …原別一丁目… ] }
```

入力に郵便番号があれば、絞り込みのヒントとして利用します。

### `parse(address)`

表記（日本語／ローマ字）を自動判別し、いずれの場合も `ParsedAddress` を返します。

### `toFormat(parsed, target)`

対象: `'google-i18n'` / `'shopify'` / `'stripe'`。建物名は各形式の 2 行目の住所欄にそのまま入ります。

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
| `KYOTO_STREET_ADDRESS` | 京都の通り名住所。非対応（下記）。 |
| `DATA_NOT_CONFIGURED` | データセット未導入・未設定。 |
| `EMPTY_INPUT` | 住所として認識できる内容が無い。 |

## カバレッジ（利用前に必ずお読みください）

カバレッジは一様ではなく、**平均値は実態を隠します**。全国の町字レベル 277,656 行での実測:

| セグメント | 件数 | ローマ字カバレッジ |
| --- | ---: | ---: |
| **丁目あり（都市部・住居表示）** | 90,972 | **99.83%** |
| 丁目なし（郊外・大字） | 99,451 | 75.46% |
| `大字` 始まり | 10,701 | **3.62%** |
| 全国 distinct | 190,423 | 87.11% |

全体カバレッジが低い県（青森 46%、沖縄 50%、長野 61%、福島 64%）も、
**丁目エントリに限れば約 100%** です。欠落しているのは郊外の `大字` 名です。

したがって:

- 国際発送の宛先は圧倒的に都市部の丁目形式住所であり、実効カバレッジは非常に高くなります。
- 郊外住所では `NO_ROMAJI_DATA` が返ります。**これは仕様どおりの動作です。**

なお、カナとローマ字は**同時に欠落**します（277,656 行中、カナのみ存在はわずか 50 行）。
カナによるフォールバックで欠落を救うことはできません。

`pnpm coverage:measure --data ./address-data` で、お使いのデータ版に対して再計測できます。
生成済みレポートは [docs/coverage.md](./docs/coverage.md) にあります。

## 非対応と明記するもの

- **ジオコーディング精度の保証**。同梱データから緯度経度は意図的に除外しています。
- **京都市の通り名住所**（`四条通烏丸東入ル`）。通り名部分を黙って捨てるのではなく、
  `KYOTO_STREET_ADDRESS` として明示的に失敗させます。
- **建物名の翻訳・ローマ字化**。建物名・部屋番号は `unparsed` として分離し、無変換で通します。
  型定義上も建物名に `romaji` フィールドはありません（意図的な設計です）。

## データ出典とライセンス

住所データはデジタル庁
**[アドレス・ベース・レジストリ](https://www.digital.go.jp/policies/base_registry_address)**
を出典とし、**[Geolonia](https://geolonia.com/)** が加工・公開したものです。

- [`@geolonia/normalize-japanese-addresses`](https://github.com/geolonia/normalize-japanese-addresses) — MIT
- [`@geolonia/japanese-addresses-v2`](https://github.com/geolonia/japanese-addresses-v2) — MIT

アドレス・ベース・レジストリはデジタル庁により、商用利用を含む自由な利用を認める条件で
公開されています。利用にあたっては上記リンクで最新の条件をご確認ください。

本ライブラリは MIT ライセンスです。[LICENSE](./LICENSE) を参照してください。

## 動作要件

Node.js 18 以上。オフラインデータをファイルシステムから読むため、既定構成は Node 専用です。
ブラウザで使う場合は、自身がホストするエンドポイント経由でデータを供給する必要があります。
