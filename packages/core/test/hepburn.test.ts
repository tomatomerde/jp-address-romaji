import { describe, expect, it } from 'vitest';
import { kanaToRomaji, toKatakana } from '../src/romaji/hepburn.js';
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
