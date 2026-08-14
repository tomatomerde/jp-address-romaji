/**
 * `romanizeStem` (`packages/core/src/romaji/format.ts`) transliterates the
 * kana for every `longVowel` style except `'none'`, which uses the dataset's
 * romaji field instead. For 17 towns nationwide the two sources disagree on
 * how to spell a number in the name — the kana spells it as a DIGIT, the
 * romaji field spells it as a WORD:
 *
 *   前郷一番町 (秋田県横手市): oaza_cho_k "マエゴウ１バンチョウ",
 *                              oaza_cho_r "Maego Ichibancho"
 *
 * so the same real place came back spelled two different *words* — not two
 * diacritic variants of the same word — depending only on which style the
 * caller asked for:
 *
 *   toRomaji(..., {longVowel:'none'})   -> "Maego Ichibancho, ..."
 *   toRomaji(..., {longVowel:'macron'}) -> "Maegō1Banchō, ..."
 *
 * Judgment call (see docs/project-status.md item 4 and the caller's task
 * description): there is no way to tell, from the dataset alone, which of
 * the two spellings — if either — is the one to trust for the long-vowel
 * styles, since they have no source but the kana (it alone carries vowel
 * length; the romaji field cannot express it). Picking one would be exactly
 * the guess CLAUDE.md's "never guess a reading" value exists to refuse, and
 * "'none'` style must keep working unchanged (the existing, already-shipped,
 * already-correct behavior for these 17 towns). So the fix makes the
 * long-vowel styles refuse — a typed failure — for a stem where the two
 * sources disagree on digits, rather than silently emit a spelling that
 * might not match what a `'none'`-style caller (or a human reading the
 * dataset) would consider correct.
 *
 * Three levels of test, from most to least direct:
 *  1. Unit tests on `romanizeStem`/`formatTown` themselves.
 *  2. An end-to-end `toRomaji` test against a dedicated fixture dataset (see
 *     fixtures-digit-word-mismatch/README.md), reproducing the bug report
 *     verbatim.
 *  3. A check that the previously-shipped, unaffected cases are not
 *     regressed: `'none'` style for this same town, and a digit-bearing
 *     reading where both sources agree (Sapporo-style `Kita10Jonishi`).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { formatTown, romanizeStem } from '../src/romaji/format.js';
import { toRomaji } from '../src/toRomaji.js';
import { useDigitWordMismatchFixtureData } from './helpers.js';

describe('romanizeStem: refuses long-vowel styles when kana and romaji field disagree on digits', () => {
  const kana = 'マエゴウ１バンチョウ';
  const romajiField = 'Maego Ichibancho';

  it("'none' is unaffected: still prefers the romaji field, digits and all", () => {
    expect(romanizeStem(kana, romajiField, 'none')).toBe(romajiField.toLowerCase());
    expect(formatTown(kana, romajiField, 'none')).toBe('Maego Ichibancho');
  });

  it("'macron' refuses rather than silently spelling the number as a digit", () => {
    expect(romanizeStem(kana, romajiField, 'macron')).toBeUndefined();
    expect(formatTown(kana, romajiField, 'macron')).toBeUndefined();
  });

  it("'circumflex' and 'oh' refuse for the same reason", () => {
    expect(romanizeStem(kana, romajiField, 'circumflex')).toBeUndefined();
    expect(romanizeStem(kana, romajiField, 'oh')).toBeUndefined();
  });

  it('does not refuse when there is no romaji field to disagree with', () => {
    // The ~10% of towns with kana but no romaji field must still
    // transliterate normally under long-vowel styles — this refusal is
    // specifically about disagreement, not about digits in general.
    expect(romanizeStem(kana, undefined, 'macron')).toBe('maegō1banchō');
  });

  it('does not refuse when both sources agree the number is a digit (Sapporo-style)', () => {
    // キタ１０ジョウニシ / "Kita10-Jonishi" — both sides spell it as a digit,
    // so there is no disagreement to refuse over.
    expect(romanizeStem('キタ１０ジョウニシ', 'Kita10-Jonishi', 'macron')).toBe('kita10jōnishi');
  });
});

describe('toRomaji: reproduces the bug report and confirms the fix', () => {
  beforeEach(() => {
    useDigitWordMismatchFixtureData();
  });

  it("'none' still returns the word-form spelling, unchanged", async () => {
    const result = await toRomaji('秋田県横手市前郷一番町', { longVowel: 'none' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.romaji).toBe('Maego Ichibancho');
  });

  it("'macron' now fails instead of returning \"Maegō1Banchō\"", async () => {
    const result = await toRomaji('秋田県横手市前郷一番町', { longVowel: 'macron' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Not NO_ROMAJI_DATA: there IS romaji data, it just disagrees with the
    // kana on digits, which is a different situation from having no data at
    // all. KANA_REQUIRED_FOR_LONG_VOWELS is the closest existing typed
    // failure toRomaji.ts already wires up for "this style can't produce a
    // trustworthy answer for this town" (see fromRomaji.ts/toRomaji.ts
    // ownership note in this test's header comment).
    expect(result.reason).toBe('KANA_REQUIRED_FOR_LONG_VOWELS');
  });
});
