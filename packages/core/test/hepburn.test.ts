import { describe, expect, it } from 'vitest';
import { kanaToRomaji, toKatakana, isTransliterableKana } from '../src/romaji/hepburn.js';
import { romanizeStem } from '../src/romaji/format.js';
import {
  isUsableRomajiField,
  isPlausibleReading,
} from '../src/romaji/validate.js';
import { numberToKanji, kanjiToNumber } from '../src/kanjiNumbers.js';

describe('kanaToRomaji', () => {
  it.each([
    ['ウエハラ', 'uehara'],
    ['サッポロシ', 'sapporoshi'],       // sokuon doubles the consonant
    ['ロッポンギ', 'roppongi'],
    ['ハッチョウボリ', 'hatchobori'],    // っ + ch -> tch
    ['シンバシ', 'shimbashi'],          // n -> m before b
    ['シンイチ', "shin'ichi"],          // n + vowel disambiguated
    ['トウキョウト', 'tokyoto'],         // long vowels unmarked by default
    ['オオノ', 'ono'],
    ['ニイガタ', 'niigata'],            // ii written in full
    ['ケーキ', 'keki'],                 // choonpu
    ['セキガハラ', 'sekigahara'],
  ])('romanizes %s as %s', (kana, expected) => {
    expect(kanaToRomaji(kana, 'none')).toBe(expected);
  });

  it.each([
    ['トウキョウト', 'tōkyōto'],
    ['オオノ', 'ōno'],
    ['ホッカイドウ', 'hokkaidō'],
    ['ジュウニソウ', 'jūnisō'],
    ['ケーキ', 'kēki'],
  ])('marks long vowels with macrons: %s -> %s', (kana, expected) => {
    expect(kanaToRomaji(kana, 'macron')).toBe(expected);
  });

  it('supports the passport OH convention for long o only', () => {
    expect(kanaToRomaji('オオノ', 'oh')).toBe('ohno');
    expect(kanaToRomaji('トウキョウ', 'oh')).toBe('tohkyoh');
    // Long u is not affected by the OH convention.
    expect(kanaToRomaji('ジュウニソウ', 'oh')).toBe('junisoh');
  });

  it('accepts hiragana as well as katakana', () => {
    expect(toKatakana('うえはら')).toBe('ウエハラ');
    expect(kanaToRomaji('うえはら', 'none')).toBe('uehara');
  });

  it('refuses to transliterate kanji rather than guessing a reading', () => {
    expect(kanaToRomaji('渋谷', 'none')).toBeUndefined();
    expect(kanaToRomaji('', 'none')).toBeUndefined();
    expect(kanaToRomaji('ウエハラ町', 'none')).toBeUndefined();
  });

  it('keeps an embedded digit rather than refusing the whole reading', () => {
    // Real v2 reading for Sapporo's 北十条西 (北海道札幌市北区): the block
    // number is spelled into the kana itself (キタ１０ジョウニシ, full-width
    // digit), matching the town's own romaji field "Kita10-Jonishi". A digit
    // is part of the name, not an untranslatable character.
    expect(kanaToRomaji('キタ１０ジョウニシ', 'none')).toBe('kita10jonishi');
  });
});

describe('isTransliterableKana', () => {
  it('accepts a reading with an embedded digit', () => {
    expect(isTransliterableKana('キタ１０ジョウニシ')).toBe(true);
    expect(isTransliterableKana('ウメガオカキタ１バンチョウ')).toBe(true);
  });

  it('rejects a reading with a genuinely untranslatable character', () => {
    // Real v2 corruption in 茨城県東茨城郡大洗町's oaza_cho_k for サンビーチ:
    // a full-width hyphen (U+FF0D) where a choonpu (ー, U+30FC) belongs. NFKC
    // folds it to an ASCII hyphen, which is not a kana character.
    expect(isTransliterableKana('サンビ－チ')).toBe(false);
    // Real v2 corruption in 富山県高岡市: full-width Latin letters embedded
    // in an otherwise-katakana reading.
    expect(isTransliterableKana('ＩＣパーク')).toBe(false);
  });
});

describe('dataset romaji validation', () => {
  it('accepts real names', () => {
    expect(isUsableRomajiField('UEHARA')).toBe(true);
    expect(isUsableRomajiField('ASAHIGAOKA 1')).toBe(true);
  });

  it('rejects values that collapsed to a bare number', () => {
    // Real corruption in the source data (Asahikawa, Nakashibetsu, Hirosaki).
    expect(isUsableRomajiField('10')).toBe(false);
    expect(isUsableRomajiField('1')).toBe(false);
    expect(isUsableRomajiField('')).toBe(false);
    expect(isUsableRomajiField(undefined)).toBe(false);
  });

  it('keeps a trailing digit that belongs to the name', () => {
    // Real v2 entries: the digit is part of the name (政和第一, 四重麦四), not
    // a chome. An earlier version stripped trailing digits before validating
    // and truncated these to "Seiwadai" / "Yoemugi".
    expect(isUsableRomajiField('Seiwadai1')).toBe(true);
    expect(isUsableRomajiField('Yoemugi4')).toBe(true);
  });

  it('flags a reading whose length is implausible for its kanji', () => {
    // 円山 carries 円山西町's reading in the source data.
    expect(isPlausibleReading('円山', 'マルヤマニシマチ')).toBe(false);
    expect(isPlausibleReading('円山西町', 'マルヤマニシマチ')).toBe(true);
    expect(isPlausibleReading('上原', 'ウエハラ')).toBe(true);
    // Single-kanji names legitimately carry long readings.
    expect(isPlausibleReading('幸', 'サイワイ')).toBe(true);
  });

  it('does not flag ordinary mixed-script urban names', () => {
    // Regression: an earlier version counted only kanji toward the length
    // budget, so any hiragana/katakana that is part of the NAME ITSELF (not
    // the reading) was invisible to the check. Real chome-address names like
    // these were flagged as corrupt even though their readings are exactly
    // right — measured nationally, that version flagged 368 entries, 268 of
    // which (73%) were exactly this false-positive shape.
    expect(isPlausibleReading('南あいの里三丁目', 'ミナミアイノサト')).toBe(true);
    expect(isPlausibleReading('流通センター一丁目', 'リュウツウセンター')).toBe(true);
    expect(isPlausibleReading('柏インター東', 'カシワインターヒガシ')).toBe(true);
    expect(isPlausibleReading('おおたかの森東一丁目', 'オオタカノモリヒガシ')).toBe(true);
  });

  it('still flags genuine corruption once mixed scripts are accounted for', () => {
    // A real corrupt row found by re-measuring nationally after the fix:
    // 荒田 (2 kanji) paired with a reading that belongs to a much longer name.
    expect(isPlausibleReading('荒田', 'アラタカミコマタ')).toBe(false);
  });

  it('strips the 大字/字 prefix from the reading as well as the name', () => {
    // Regression, measured on the real v2 dataset: the prefix is spelled out
    // in the kana too, so stripping it from only the kanji side inflated the
    // ratio and flagged 23,193 entries (3.65% of everything with a reading).
    // All four of these are real v2 records that were being refused.
    expect(isPlausibleReading('大字三泊村', 'オオアザサンドマリムラ')).toBe(true);
    expect(isPlausibleReading('大字稚内村', 'オオアザワッカナイムラ')).toBe(true);
    expect(isPlausibleReading('大字盃村', 'オオアザサカズキムラ')).toBe(true);
    expect(isPlausibleReading('大字泊村', 'オオアザトマリムラ')).toBe(true);
    // The 字 (aza) prefix behaves the same way.
    expect(isPlausibleReading('字政和第一', 'アザセイワダイイチ')).toBe(true);
    // A v1-style row, where the prefix appears in the name but not the
    // reading, must still pass.
    expect(isPlausibleReading('大字三内', 'サンナイ')).toBe(true);
  });
});

describe('romanizeStem: long-vowel styles must apply the same transliterability check as none', () => {
  // Regression: `style === 'none'` routes through kanaToRomaji, which checks
  // isTransliterableKana and returns undefined for anything it cannot spell.
  // The macron/circumflex/oh branches used to call analyzeKana/renderSyllables
  // directly, skipping that check entirely — untranslatable characters were
  // passed through verbatim instead of causing a refusal. That let an input
  // that correctly failed under the default style succeed under a long-vowel
  // style, the opposite of the intended relationship (the long-vowel styles
  // are documented as *requiring* the kana source, i.e. should be at least as
  // strict, never looser).
  const STYLES = ['none', 'macron', 'circumflex', 'oh'] as const;

  it('refuses an untranslatable kana reading under every style, not just none', () => {
    // Real v2 corruption: 茨城県東茨城郡大洗町's oaza_cho_k for サンビーチ has
    // a full-width hyphen (NFKC-folds to ASCII '-') where a choonpu belongs.
    const untranslatable = 'サンビ－チ';
    for (const style of STYLES) {
      expect(romanizeStem(untranslatable, undefined, style)).toBeUndefined();
    }
  });

  it('keeps accepting a kana reading with an embedded digit under every style', () => {
    // Real v2 reading for Sapporo's 北十条西 (北海道札幌市北区). Digits inside
    // a reading are part of the name (the block number), not untranslatable
    // characters, so no style should refuse this.
    const withDigit = 'キタ１０ジョウニシ';
    expect(romanizeStem(withDigit, undefined, 'none')).toBe('kita10jonishi');
    expect(romanizeStem(withDigit, undefined, 'macron')).toBe('kita10jōnishi');
    expect(romanizeStem(withDigit, undefined, 'circumflex')).toBe('kita10jônishi');
    expect(romanizeStem(withDigit, undefined, 'oh')).toBe('kita10johnishi');
  });
});

describe('kanji numerals', () => {
  it.each([
    [1, '一'], [3, '三'], [9, '九'], [10, '十'],
    [11, '十一'], [20, '二十'], [21, '二十一'], [99, '九十九'],
  ])('writes %i as %s', (n, kanji) => {
    expect(numberToKanji(n)).toBe(kanji);
  });

  it('round-trips', () => {
    for (let i = 1; i <= 99; i++) {
      expect(kanjiToNumber(numberToKanji(i))).toBe(i);
    }
  });
});
