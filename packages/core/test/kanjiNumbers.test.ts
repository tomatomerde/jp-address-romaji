/**
 * Regression tests for a review finding: `kanjiToNumber` collapsed
 * consecutive kanji digits instead of rejecting them, so a digit character
 * silently overwrote a still-pending one. `kanjiToNumber('一〇一')` (the
 * common vertical-text digit-by-digit style for 101) returned `1`; `'一二'`
 * returned `2`; `'十十'` returned `20`; `'十百'` returned `110` — a wrong
 * number returned in place of the `undefined` the input warrants, which is
 * exactly what the project's "読みを推測しない" rule forbids for numerals as
 * much as for romaji readings: a wrong answer is worse than a rejected one.
 *
 * `kanjiToNumber` is documented as a strict inverse of `numberToKanji`
 * ("Parse kanji numerals of the form produced by numberToKanji"), so the
 * fix rejects anything outside that exact grammar rather than picking one
 * of several plausible readings for it.
 */

import { describe, expect, it } from 'vitest';
import { kanjiToNumber, numberToKanji } from '../src/kanjiNumbers.js';

describe('kanjiToNumber: rejects shapes numberToKanji never produces', () => {
  it('rejects a digit-style run instead of reading only its first character', () => {
    // Digit-by-digit vertical-text style for 101. numberToKanji never emits
    // a bare run of digit characters for a value >= 10, so there is no
    // grammar here that says "101" rather than some other digit-run
    // reading — undefined is the honest answer, not a guess.
    expect(kanjiToNumber('一〇一')).toBeUndefined();
  });

  it('rejects two consecutive digit characters with no 十/百 between them', () => {
    expect(kanjiToNumber('一二')).toBeUndefined();
    expect(kanjiToNumber('三三')).toBeUndefined();
  });

  it('rejects a doubled 十 (not a shape numberToKanji writes)', () => {
    expect(kanjiToNumber('十十')).toBeUndefined();
  });

  it('rejects 十 directly followed by 百 (not a shape numberToKanji writes)', () => {
    expect(kanjiToNumber('十百')).toBeUndefined();
  });

  it('still parses every legitimate value 0-999 that numberToKanji writes', () => {
    for (let v = 0; v <= 999; v++) {
      expect(kanjiToNumber(numberToKanji(v))).toBe(v);
    }
  });

  it('still returns undefined for a numeral outside numberToKanji\'s range (千)', () => {
    expect(kanjiToNumber('千')).toBeUndefined();
  });

  it('rejects a bare leading 一 before 十 or 百, and a trailing 〇 (not emitted by numberToKanji)', () => {
    expect(kanjiToNumber('一百')).toBeUndefined();
    expect(kanjiToNumber('〇十')).toBeUndefined();
    expect(kanjiToNumber('十〇')).toBeUndefined();
  });
});
