/**
 * Rendering of romanized address components.
 *
 * Two jobs live here:
 *  1. Turning the dataset's romaji field into conventional address casing
 *     (`Sapporo-shi`). Both forms the dataset has shipped are accepted: the
 *     older ALL-CAPS, space-separated style (`SAPPORO SHI`) and the v2 style
 *     already close to conventional casing (`Sapporo-shi`).
 *  2. Choosing the reading of an administrative suffix. `町` is read either
 *     "machi" or "cho" and `村` either "mura" or "son" depending on the
 *     municipality; that choice is read out of the dataset, never guessed.
 */

import type { LongVowelStyle } from '../types.js';
import { analyzeKana, renderSyllables, kanaToRomaji, isTransliterableKana } from './hepburn.js';
import { isUsableRomajiField } from './validate.js';

/**
 * Administrative suffixes, with their possible readings.
 *
 * Exported for fromRomaji.ts's `segmentQuality`, which uses this same table
 * to decide whether a suffix stripped off a QUERY token is a plausible
 * reading for the kanji suffix the matched record actually has — see the
 * comment there for why.
 */
export const SUFFIXES: Record<string, { kana: string[]; romaji: string[] }> = {
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
  // The romaji field didn't settle it (missing, or not recognized as one of
  // the spec's readings). The kana tail already says which reading applies —
  // read it off there before resorting to a guess. `大字`/`字`-style
  // rewritten prefixes (see isPlausibleReading's comment in validate.ts)
  // only ever sit in FRONT of the stem, never between the stem and the
  // suffix, so a plain endsWith check against the kana is safe here.
  if (!suffix && kana) {
    for (const reading of spec.kana) {
      if (kana.endsWith(reading) && kana.length > reading.length) {
        suffix = spec.romaji[spec.kana.indexOf(reading)];
        break;
      }
    }
  }

  // Last resort: neither the romaji field nor the kana settled it (e.g. no
  // kana either). Fall back to the first (most common) reading. Unreached by
  // the shipped dataset — every municipality has both fields — but kept so
  // the function still returns something rather than failing outright.
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
 * Does `text` contain a digit? Checked after NFKC folding so a full-width
 * `１` counts the same as an ASCII `1` — the same normalization
 * {@link isTransliterableKana} applies before it looks for digits.
 */
function containsDigit(text: string): boolean {
  return /[0-9]/.test(text.normalize('NFKC'));
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
 *
 * One more refusal lives in the long-vowel branch: for 17 towns nationwide
 * (see docs/project-status.md item 4 and
 * fixtures-digit-word-mismatch/README.md) the kana reading spells a number as
 * a DIGIT while the dataset's own romaji field spells the very same number as
 * a WORD — e.g. 前郷一番町: `マエゴウ１バンチョウ` vs `"Maego Ichibancho"`. Under
 * `'none'` that is invisible, since the branch above never looks at the kana
 * when the romaji field is usable. But every other style has no source *but*
 * the kana (it alone carries vowel length), so transliterating it verbatim
 * would spell the same town two different ways — not a diacritic difference,
 * a different word — depending only on which `longVowel` style the caller
 * picked, with nothing in the dataset to say which spelling, if either, is
 * the one to trust. That is exactly the situation CLAUDE.md's "never guess a
 * reading" value is about: an explicit failure the caller must handle beats a
 * spelling that might be the wrong one. This only fires when the two sources
 * actually disagree on digits — a reading like Sapporo's `キタ１０ジョウニシ`
 * (`Kita10Jonishi`), whose romaji field agrees the number is a digit
 * (`Kita10-Jonishi`), is unaffected, as is every reading with no romaji field
 * to disagree with at all.
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
  if (isUsableRomajiField(stemRomaji) && containsDigit(stemKana) && !containsDigit(stemRomaji)) {
    return undefined;
  }
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
 * Render a named koaza (small-area subdivision) name.
 *
 * Deliberately the same shape as {@link formatTown} — a koaza is, for
 * rendering purposes, just another stem to romanize; both route through
 * {@link romanizeStem} so the two never diverge on source precedence,
 * long-vowel handling, or transliterability rules. Kept as a separate,
 * separately-named function (rather than reusing `formatTown` directly)
 * because the two mean different things to a caller and may need to diverge
 * later — e.g. a koaza has no administrative suffix to ever split off, so
 * nothing here parallels `splitAdministrativeSuffix`.
 *
 * The caller (`toRomaji.ts`) is responsible for deciding WHETHER to call this
 * at all: it must first confirm the reading is complete enough to trust (see
 * `romaji/validate.ts`'s `isKoazaReadingComplete`). This function only
 * renders; it does not judge completeness.
 */
export function formatKoaza(
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
 * `西新宿二丁目8番1号` -> `2-8-1`.
 */
export function formatBlockNumbers(chome: number | undefined, blocks: readonly number[]): string {
  const parts = [...(chome !== undefined ? [chome] : []), ...blocks];
  return parts.join('-');
}
