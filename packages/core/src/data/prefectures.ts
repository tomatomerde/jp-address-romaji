/**
 * The 47 prefectures, with their conventional English forms.
 *
 * This table is hardcoded deliberately. It is a closed, stable set, and the
 * conventional English spellings are not mechanically derivable from the
 * dataset: `群馬` is written "Gunma" rather than the "Gumma" that strict
 * Hepburn nasal assimilation would produce, and the administrative suffix
 * (`都`/`府`/`県`) is dropped in English while `北海道` keeps its `道`.
 *
 * Hardcoding a fixed official list is not the same as guessing a reading.
 */

export interface PrefectureEntry {
  /** Japanese name including the administrative suffix. */
  ja: string;
  /** Katakana reading of the name including the suffix. */
  kana: string;
  /** Conventional English form, no long-vowel marks (`Tokyo`, `Osaka`). */
  romaji: string;
  /** Same name with macrons (`Tōkyō`, `Ōsaka`). */
  romajiMacron: string;
  /** JIS prefecture code, 1-47. */
  code: number;
}

export const PREFECTURES: readonly PrefectureEntry[] = [
  { code: 1, ja: '北海道', kana: 'ホッカイドウ', romaji: 'Hokkaido', romajiMacron: 'Hokkaidō' },
  { code: 2, ja: '青森県', kana: 'アオモリケン', romaji: 'Aomori', romajiMacron: 'Aomori' },
  { code: 3, ja: '岩手県', kana: 'イワテケン', romaji: 'Iwate', romajiMacron: 'Iwate' },
  { code: 4, ja: '宮城県', kana: 'ミヤギケン', romaji: 'Miyagi', romajiMacron: 'Miyagi' },
  { code: 5, ja: '秋田県', kana: 'アキタケン', romaji: 'Akita', romajiMacron: 'Akita' },
  { code: 6, ja: '山形県', kana: 'ヤマガタケン', romaji: 'Yamagata', romajiMacron: 'Yamagata' },
  { code: 7, ja: '福島県', kana: 'フクシマケン', romaji: 'Fukushima', romajiMacron: 'Fukushima' },
  { code: 8, ja: '茨城県', kana: 'イバラキケン', romaji: 'Ibaraki', romajiMacron: 'Ibaraki' },
  { code: 9, ja: '栃木県', kana: 'トチギケン', romaji: 'Tochigi', romajiMacron: 'Tochigi' },
  { code: 10, ja: '群馬県', kana: 'グンマケン', romaji: 'Gunma', romajiMacron: 'Gunma' },
  { code: 11, ja: '埼玉県', kana: 'サイタマケン', romaji: 'Saitama', romajiMacron: 'Saitama' },
  { code: 12, ja: '千葉県', kana: 'チバケン', romaji: 'Chiba', romajiMacron: 'Chiba' },
  { code: 13, ja: '東京都', kana: 'トウキョウト', romaji: 'Tokyo', romajiMacron: 'Tōkyō' },
  { code: 14, ja: '神奈川県', kana: 'カナガワケン', romaji: 'Kanagawa', romajiMacron: 'Kanagawa' },
  { code: 15, ja: '新潟県', kana: 'ニイガタケン', romaji: 'Niigata', romajiMacron: 'Niigata' },
  { code: 16, ja: '富山県', kana: 'トヤマケン', romaji: 'Toyama', romajiMacron: 'Toyama' },
  { code: 17, ja: '石川県', kana: 'イシカワケン', romaji: 'Ishikawa', romajiMacron: 'Ishikawa' },
  { code: 18, ja: '福井県', kana: 'フクイケン', romaji: 'Fukui', romajiMacron: 'Fukui' },
  { code: 19, ja: '山梨県', kana: 'ヤマナシケン', romaji: 'Yamanashi', romajiMacron: 'Yamanashi' },
  { code: 20, ja: '長野県', kana: 'ナガノケン', romaji: 'Nagano', romajiMacron: 'Nagano' },
  { code: 21, ja: '岐阜県', kana: 'ギフケン', romaji: 'Gifu', romajiMacron: 'Gifu' },
  { code: 22, ja: '静岡県', kana: 'シズオカケン', romaji: 'Shizuoka', romajiMacron: 'Shizuoka' },
  { code: 23, ja: '愛知県', kana: 'アイチケン', romaji: 'Aichi', romajiMacron: 'Aichi' },
  { code: 24, ja: '三重県', kana: 'ミエケン', romaji: 'Mie', romajiMacron: 'Mie' },
  { code: 25, ja: '滋賀県', kana: 'シガケン', romaji: 'Shiga', romajiMacron: 'Shiga' },
  { code: 26, ja: '京都府', kana: 'キョウトフ', romaji: 'Kyoto', romajiMacron: 'Kyōto' },
  { code: 27, ja: '大阪府', kana: 'オオサカフ', romaji: 'Osaka', romajiMacron: 'Ōsaka' },
  { code: 28, ja: '兵庫県', kana: 'ヒョウゴケン', romaji: 'Hyogo', romajiMacron: 'Hyōgo' },
  { code: 29, ja: '奈良県', kana: 'ナラケン', romaji: 'Nara', romajiMacron: 'Nara' },
  { code: 30, ja: '和歌山県', kana: 'ワカヤマケン', romaji: 'Wakayama', romajiMacron: 'Wakayama' },
  { code: 31, ja: '鳥取県', kana: 'トットリケン', romaji: 'Tottori', romajiMacron: 'Tottori' },
  { code: 32, ja: '島根県', kana: 'シマネケン', romaji: 'Shimane', romajiMacron: 'Shimane' },
  { code: 33, ja: '岡山県', kana: 'オカヤマケン', romaji: 'Okayama', romajiMacron: 'Okayama' },
  { code: 34, ja: '広島県', kana: 'ヒロシマケン', romaji: 'Hiroshima', romajiMacron: 'Hiroshima' },
  { code: 35, ja: '山口県', kana: 'ヤマグチケン', romaji: 'Yamaguchi', romajiMacron: 'Yamaguchi' },
  { code: 36, ja: '徳島県', kana: 'トクシマケン', romaji: 'Tokushima', romajiMacron: 'Tokushima' },
  { code: 37, ja: '香川県', kana: 'カガワケン', romaji: 'Kagawa', romajiMacron: 'Kagawa' },
  { code: 38, ja: '愛媛県', kana: 'エヒメケン', romaji: 'Ehime', romajiMacron: 'Ehime' },
  { code: 39, ja: '高知県', kana: 'コウチケン', romaji: 'Kochi', romajiMacron: 'Kōchi' },
  { code: 40, ja: '福岡県', kana: 'フクオカケン', romaji: 'Fukuoka', romajiMacron: 'Fukuoka' },
  { code: 41, ja: '佐賀県', kana: 'サガケン', romaji: 'Saga', romajiMacron: 'Saga' },
  { code: 42, ja: '長崎県', kana: 'ナガサキケン', romaji: 'Nagasaki', romajiMacron: 'Nagasaki' },
  { code: 43, ja: '熊本県', kana: 'クマモトケン', romaji: 'Kumamoto', romajiMacron: 'Kumamoto' },
  { code: 44, ja: '大分県', kana: 'オオイタケン', romaji: 'Oita', romajiMacron: 'Ōita' },
  { code: 45, ja: '宮崎県', kana: 'ミヤザキケン', romaji: 'Miyazaki', romajiMacron: 'Miyazaki' },
  { code: 46, ja: '鹿児島県', kana: 'カゴシマケン', romaji: 'Kagoshima', romajiMacron: 'Kagoshima' },
  { code: 47, ja: '沖縄県', kana: 'オキナワケン', romaji: 'Okinawa', romajiMacron: 'Okinawa' },
];

const BY_JA = new Map(PREFECTURES.map((p) => [p.ja, p]));

/** Normalize a romaji prefecture name for lookup: lowercase, letters only. */
export function normalizeRomajiKey(input: string): string {
  return input
    .normalize('NFD')
    // Strip combining marks so "Tōkyō" and "Tokyo" collapse to the same key.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const BY_ROMAJI = new Map<string, PrefectureEntry>();
for (const p of PREFECTURES) {
  BY_ROMAJI.set(normalizeRomajiKey(p.romaji), p);
  BY_ROMAJI.set(normalizeRomajiKey(p.romajiMacron), p);
  // Accept the administrative suffix too: "Tokyo-to", "Osaka-fu", "Aomori-ken".
  const suffix = p.ja.endsWith('都') ? 'to' : p.ja.endsWith('府') ? 'fu' : p.ja.endsWith('道') ? '' : 'ken';
  if (suffix) {
    BY_ROMAJI.set(normalizeRomajiKey(p.romaji + suffix), p);
    BY_ROMAJI.set(normalizeRomajiKey(p.romajiMacron + suffix), p);
  }
  // "Oh"-style passport spellings, e.g. "Ohsaka", "Tohkyoh".
  BY_ROMAJI.set(normalizeRomajiKey(p.romajiMacron.replace(/[ōŌ]/g, (m) => (m === 'Ō' ? 'Oh' : 'oh'))), p);
}

/** Look up a prefecture by its Japanese name (with suffix). */
export function findPrefectureByJa(ja: string): PrefectureEntry | undefined {
  return BY_JA.get(ja);
}

/** Look up a prefecture by any accepted romaji spelling. */
export function findPrefectureByRomaji(romaji: string): PrefectureEntry | undefined {
  return BY_ROMAJI.get(normalizeRomajiKey(romaji));
}
