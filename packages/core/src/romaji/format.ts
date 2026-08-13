/**
 * Rendering of romanized address components.
 *
 * Two jobs live here:
 *  1. Turning the dataset's ALL-CAPS, space-separated values (`SAPPORO SHI`)
 *     into conventional address casing (`Sapporo-shi`).
 *  2. Choosing the reading of an administrative suffix. `町` is read either
 *     "machi" or "cho" and `村` either "mura" or "son" depending on the
 *     municipality; that choice is read out of the dataset, never guessed.
 */

import type { LongVowelStyle } from '../types.js';
import { analyzeKana, renderSyllables, kanaToRomaji, isTransliterableKana } from './hepburn.js';
import { isUsableRomajiField } from './validate.js';

/** Administrative suffixes, with their possible readings. */
const SUFFIXES: Record<string, { kana: string[]; romaji: string[] }> = {
  都: { kana: ['ト'], romaji: ['to'] },
  道: { kana: ['ドウ'], romaji: ['do'] },
  府: { kana: ['フ'], romaji: ['fu'] },
  県: { kana: ['ケン'], romaji: ['ken'] },
  郡: { kana: ['グン'], romaji: ['gun'] },
  市: { kana: ['シ'], romaji: ['shi'] },
  区: { kana: ['ク'], romaji: ['ku'] },
  町: { kana: ['チョウ', 'マチ'], romaji: ['cho', 'machi'] },
  村: { kana: ['ムラ', 'ソン'], romaji: ['mura', 'son'] },
};

/** Capitalize each word and each hyphen-separated part: `nishi-shinjuku`. */
// Latin letters, including accented ones: Latin-1 Supplement letters
// (excluding the non-letter × U+00D7 and ÷ U+00F7) plus Latin Extended-A,
// which together cover both circumflex (â, ô, ...) and macron (ā, ō, ...)
// long-vowel spellings.
const WORD_CHARS = /[A-Za-zÀ-ÖØ-öø-ſ'ʼ]+/g;

export function titleCase(input: string): string {
  return input.replace(WORD_CHARS, (word, offset: number) => {
    // Keep an apostrophe-separated continuation lowercase: `Shin'ichi`.
    if (offset > 0 && /['ʼ]/.test(input[offset - 1] ?? '')) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Apply the caller's capitalization choice. */
export function applyCapitalization(input: string, mode: 'title' | 'upper'): string {
  return mode === 'upper' ? input.toUpperCase() : input;
}

interface SplitResult {
  /** Stem with the administrative suffix removed. */
  stemKana?: string;
  stemRomaji?: string;
  /** Romanized suffix, e.g. `shi`, `ku`, `machi`. */
  suffix?: string;
}

/**
 * Separate a municipality name into stem and administrative suffix.
 *
 * `ja` decides *which* suffix applies; the dataset's romaji field decides
 * *how it is read* when more than one reading exists.
 */
export function splitAdministrativeSuffix(
  ja: string,
  kana?: string,
  romajiField?: string,
): SplitResult {
  const suffixKanji = ja.slice(-1);
  const spec = SUFFIXES[suffixKanji];
  const cleanRomaji = romajiField?.trim() || undefined;

  if (!spec) {
    return { stemKana: kana, stemRomaji: cleanRomaji };
  }

  // Determine the suffix reading from the dataset romaji when possible.
  let suffix: string | undefined;
  let stemRomaji = cleanRomaji;
  if (cleanRomaji) {
    const lower = cleanRomaji.toLowerCase();
    for (const candidate of spec.romaji) {
      // Match `SAPPORO SHI`, `SAPPORO-SHI` and `SAPPOROSHI` alike.
      const re = new RegExp(`[\\s-]*${candidate}$`);
      if (re.test(lower)) {
        suffix = candidate;
        stemRomaji = cleanRomaji.slice(0, lower.replace(re, '').length).trim();
        break;
      }
    }
  }
  // Fall back to the first (most common) reading when the dataset is silent.
  if (!suffix) suffix = spec.romaji[0];

  // Strip the corresponding reading off the kana.
  let stemKana = kana;
  if (kana) {
    // Prefer the reading that matches the romaji suffix we settled on.
    const order = [...spec.kana].sort((a, b) => {
      const ia = spec.romaji[spec.kana.indexOf(a)] === suffix ? 0 : 1;
      const ib = spec.romaji[spec.kana.indexOf(b)] === suffix ? 0 : 1;
      return ia - ib;
    });
    for (const reading of order) {
      if (kana.endsWith(reading) && kana.length > reading.length) {
        stemKana = kana.slice(0, -reading.length);
        break;
      }
    }
  }

  return { stemKana, stemRomaji, suffix };
}

/**
 * Romanize the stem of a component.
 *
 * Source precedence:
 *  - `'none'` style: the dataset's romaji field is authoritative when it
 *    passes validation; otherwise we transliterate the kana.
 *  - Any long-vowel style: the dataset field cannot express vowel length, so
 *    the kana reading is required. Returns undefined when it is absent, and
 *    the caller turns that into an explicit failure.
 *
 * Both branches gate the kana on {@link isTransliterableKana}. Previously
 * only the `'none'` branch did (via `kanaToRomaji`, which checks internally);
 * the long-vowel branch called `analyzeKana`/`renderSyllables` directly,
 * which pass unmapped characters through verbatim instead of refusing them.
 * That let untranslatable readings (e.g. a full-width hyphen standing in for
 * a choonpu) produce a plausible-looking `ok: true` result under `macron` /
 * `circumflex` / `oh` while the same input correctly failed with
 * `NO_ROMAJI_DATA` under `'none'` — the opposite of the intended relationship,
 * since the long-vowel styles are documented as *requiring* the kana source.
 */
export function romanizeStem(
  stemKana: string | undefined,
  stemRomaji: string | undefined,
  style: LongVowelStyle,
): string | undefined {
  if (style === 'none') {
    if (isUsableRomajiField(stemRomaji)) return stemRomaji.toLowerCase();
    return stemKana ? kanaToRomaji(stemKana, 'none') : undefined;
  }
  if (!stemKana || !isTransliterableKana(stemKana)) return undefined;
  const syllables = analyzeKana(stemKana);
  if (syllables.length === 0) return undefined;
  return renderSyllables(syllables, style) || undefined;
}

/**
 * Render a municipality component as `Stem-suffix` (`Sapporo-shi`, `Chuo-ku`).
 * Returns undefined when no romanization is available.
 */
export function formatMunicipality(
  ja: string,
  kana: string | undefined,
  romajiField: string | undefined,
  style: LongVowelStyle,
): string | undefined {
  const { stemKana, stemRomaji, suffix } = splitAdministrativeSuffix(ja, kana, romajiField);
  const stem = romanizeStem(stemKana, stemRomaji, style);
  if (!stem) return undefined;
  const titled = titleCase(stem);
  return suffix ? `${titled}-${suffix}` : titled;
}

/**
 * Render a town (machi-aza) name. The chome is not included here; it is
 * folded into the block-number sequence by the caller.
 */
export function formatTown(
  kana: string | undefined,
  romajiField: string | undefined,
  style: LongVowelStyle,
): string | undefined {
  const cleanRomaji = romajiField?.trim() || undefined;
  const stem = romanizeStem(kana, cleanRomaji, style);
  return stem ? titleCase(stem) : undefined;
}

/**
 * Build the block-number sequence for western order.
 * `西新宿三丁目5番12号` -> `3-5-12`.
 */
export function formatBlockNumbers(chome: number | undefined, blocks: readonly number[]): string {
  const parts = [...(chome !== undefined ? [chome] : []), ...blocks];
  return parts.join('-');
}
