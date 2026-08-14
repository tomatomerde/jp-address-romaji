/**
 * Kana -> romaji transliteration (Hepburn).
 *
 * This is the one piece of linguistic conversion the library performs itself,
 * and it is deterministic: it reads a kana reading supplied by the address
 * dataset and spells it out. It never infers a reading from kanji.
 *
 * Why we transliterate at all, when the dataset also ships a romaji field:
 * that field is ALL-CAPS and already stripped of vowel length (`KITA1-JOHIGASHI`),
 * so macron/circumflex/"oh" output cannot be recovered from it. Those styles are
 * derived from kana; passport style can use either source.
 */

import type { LongVowelStyle } from '../types.js';

/** Two-kana sequences, matched before single kana. */
const DIGRAPHS: Record<string, string> = {
  キャ: 'kya', キュ: 'kyu', キョ: 'kyo',
  ギャ: 'gya', ギュ: 'gyu', ギョ: 'gyo',
  シャ: 'sha', シュ: 'shu', ショ: 'sho', シェ: 'she',
  ジャ: 'ja', ジュ: 'ju', ジョ: 'jo', ジェ: 'je',
  チャ: 'cha', チュ: 'chu', チョ: 'cho', チェ: 'che',
  ヂャ: 'ja', ヂュ: 'ju', ヂョ: 'jo',
  ニャ: 'nya', ニュ: 'nyu', ニョ: 'nyo',
  ヒャ: 'hya', ヒュ: 'hyu', ヒョ: 'hyo',
  ビャ: 'bya', ビュ: 'byu', ビョ: 'byo',
  ピャ: 'pya', ピュ: 'pyu', ピョ: 'pyo',
  ミャ: 'mya', ミュ: 'myu', ミョ: 'myo',
  リャ: 'rya', リュ: 'ryu', リョ: 'ryo',
  ファ: 'fa', フィ: 'fi', フェ: 'fe', フォ: 'fo',
  ヴァ: 'va', ヴィ: 'vi', ヴェ: 've', ヴォ: 'vo',
  ウィ: 'wi', ウェ: 'we', ウォ: 'wo',
  ティ: 'ti', ディ: 'di', トゥ: 'tu', ドゥ: 'du',
  ツァ: 'tsa', ツィ: 'tsi', ツェ: 'tse', ツォ: 'tso',
};

/** Single kana. */
const MONOGRAPHS: Record<string, string> = {
  ア: 'a', イ: 'i', ウ: 'u', エ: 'e', オ: 'o',
  カ: 'ka', キ: 'ki', ク: 'ku', ケ: 'ke', コ: 'ko',
  ガ: 'ga', ギ: 'gi', グ: 'gu', ゲ: 'ge', ゴ: 'go',
  サ: 'sa', シ: 'shi', ス: 'su', セ: 'se', ソ: 'so',
  ザ: 'za', ジ: 'ji', ズ: 'zu', ゼ: 'ze', ゾ: 'zo',
  タ: 'ta', チ: 'chi', ツ: 'tsu', テ: 'te', ト: 'to',
  ダ: 'da', ヂ: 'ji', ヅ: 'zu', デ: 'de', ド: 'do',
  ナ: 'na', ニ: 'ni', ヌ: 'nu', ネ: 'ne', ノ: 'no',
  ハ: 'ha', ヒ: 'hi', フ: 'fu', ヘ: 'he', ホ: 'ho',
  バ: 'ba', ビ: 'bi', ブ: 'bu', ベ: 'be', ボ: 'bo',
  パ: 'pa', ピ: 'pi', プ: 'pu', ペ: 'pe', ポ: 'po',
  マ: 'ma', ミ: 'mi', ム: 'mu', メ: 'me', モ: 'mo',
  ヤ: 'ya', ユ: 'yu', ヨ: 'yo',
  ラ: 'ra', リ: 'ri', ル: 'ru', レ: 're', ロ: 'ro',
  ワ: 'wa', ヰ: 'i', ヱ: 'e', ヲ: 'o',
  ヴ: 'vu',
  // Small vowels standing alone (rare, but keep them lossless).
  ァ: 'a', ィ: 'i', ゥ: 'u', ェ: 'e', ォ: 'o',
  ャ: 'ya', ュ: 'yu', ョ: 'yo', ヮ: 'wa',
};

const MACRONS: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
const CIRCUMFLEXES: Record<string, string> = { a: 'â', i: 'î', u: 'û', e: 'ê', o: 'ô' };

/** A romanized syllable plus the information needed for later merging. */
export interface Syllable {
  /** Romaji text of the syllable. */
  text: string;
  /** Trailing vowel, or undefined for the moraic nasal. */
  vowel?: string;
  /** True for ン, which needs contextual n/m selection. */
  isNasal?: boolean;
  /** True when this syllable's vowel is lengthened (choonpu or vowel pair). */
  long?: boolean;
  /** Source kana this syllable was produced from. */
  src: string;
}

/** Convert hiragana to katakana and normalize width so one table suffices. */
export function toKatakana(input: string): string {
  let out = '';
  for (const ch of input.normalize('NFKC')) {
    const code = ch.codePointAt(0)!;
    // Hiragana block -> katakana block.
    if (code >= 0x3041 && code <= 0x3096) {
      out += String.fromCodePoint(code + 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Does this kana string contain anything we cannot transliterate?
 * Used to refuse rather than emit a partially-spelled name.
 *
 * ASCII digits (after NFKC folds full-width `０`-`９` to `0`-`9`) are
 * accepted: in the v2 dataset a digit inside a reading is part of the name
 * itself, not an untranslatable character — e.g. Sapporo's numbered blocks
 * (`キタ１０ジョウニシ` -> `Kita10Jonishi`, matching the town's own romaji
 * field `Kita10-Jonishi`). Measured on the full dataset, 16,918 of 635,698
 * `oaza_cho_k` readings fail this check; 16,914 of those contain nothing but
 * digits beyond ordinary kana, and rejecting them would wrongly refuse a
 * large slice of Sapporo. The remaining 4 are genuine corruption (a
 * full-width hyphen where a choonpu belongs, or full-width Latin letters)
 * and are correctly refused.
 *
 * This is the single source of truth for "can this reading be
 * transliterated" — both the `'none'` style (via {@link kanaToRomaji}) and
 * the long-vowel styles (via `romanizeStem` in `format.ts`) run through it,
 * so the styles cannot disagree on what counts as a valid reading.
 */
export function isTransliterableKana(input: string): boolean {
  const kana = toKatakana(input).replace(/[\s\u3000]/g, '');
  if (kana.length === 0) return false;
  for (let i = 0; i < kana.length; i++) {
    const two = kana.slice(i, i + 2);
    if (DIGRAPHS[two]) { i++; continue; }
    const one = kana[i]!;
    // ー must follow a kana that produces a vowel (not at start, not after ッ or ン).
    if (one === 'ー') {
      if (i === 0) return false;  // Leading ー is invalid.
      const prev = kana[i - 1]!;
      if (!MONOGRAPHS[prev]) return false;  // Previous character doesn't have a vowel to lengthen.
      continue;
    }
    if (MONOGRAPHS[one] || one === 'ッ' || one === 'ン' || /[0-9]/.test(one)) continue;
    return false;
  }
  return true;
}

/** Split kana into romanized syllables, resolving sokuon and choonpu. */
function toSyllables(kana: string): Syllable[] {
  const out: Syllable[] = [];
  let pendingSokuon = '';

  const push = (text: string, src: string, vowel?: string, isNasal?: boolean) => {
    let t = text;
    if (pendingSokuon) {
      // Standard Hepburn: っ + ch -> "tch" (Hatchō), otherwise double the consonant.
      t = t.startsWith('ch') ? 't' + t : (t[0] ?? '') + t;
      src = pendingSokuon + src;
      pendingSokuon = '';
    }
    out.push({ text: t, src, vowel, isNasal });
  };

  for (let i = 0; i < kana.length; i++) {
    const two = kana.slice(i, i + 2);
    const digraph = DIGRAPHS[two];
    if (digraph) {
      push(digraph, two, digraph.slice(-1));
      i++;
      continue;
    }

    const ch = kana[i]!;
    if (ch === 'ッ') { pendingSokuon = ch; continue; }
    if (ch === 'ン') { push('n', ch, undefined, true); continue; }
    if (ch === 'ー') {
      // Choonpu lengthens the previous syllable's vowel rather than adding one.
      const prev = out[out.length - 1];
      if (prev?.vowel) {
        prev.long = true;
        prev.src += ch;
      } else {
        // Unattached ー: include it verbatim so it doesn't vanish silently.
        push(ch, ch);
      }
      continue;
    }

    const mono = MONOGRAPHS[ch];
    if (mono) { push(mono, ch, mono.slice(-1)); continue; }
    // Unmapped character: keep it verbatim so nothing is silently dropped.
    push(ch, ch);
  }
  return out;
}

/**
 * Parse a kana reading into merged syllables.
 *
 * Exposed so callers can align a multi-token name (`SAPPORO SHI CHUO KU`)
 * against its reading and re-render individual segments.
 */
export function analyzeKana(reading: string): Syllable[] {
  const kana = toKatakana(reading).replace(/[\s\u3000]/g, '');
  const syllables = toSyllables(kana);

  // Merge bare vowels that lengthen the preceding syllable (オウ, オオ, ウウ...).
  const merged: Syllable[] = [];
  for (const cur of syllables) {
    const prev = merged[merged.length - 1];
    const isBareVowel = !cur.isNasal && cur.text.length === 1 && cur.text === cur.vowel;
    if (
      prev &&
      !prev.isNasal &&
      !prev.long &&
      prev.vowel &&
      isBareVowel &&
      isLongVowelPair(prev.vowel, cur.vowel!)
    ) {
      prev.long = true;
      prev.src += cur.src;
      continue;
    }
    merged.push({ ...cur });
  }
  return merged;
}

/** Render already-parsed syllables in the requested long-vowel style. */
export function renderSyllables(syllables: Syllable[], style: LongVowelStyle): string {
  let out = '';
  for (let i = 0; i < syllables.length; i++) {
    const cur = syllables[i]!;
    const next = syllables[i + 1];

    if (cur.isNasal) {
      // Passport Hepburn requires M before B, M and P.
      const following = next?.text ?? '';
      if (/^[bmp]/.test(following)) {
        out += 'm';
      } else if (/^[aiueoy]/.test(following)) {
        // Disambiguate n + vowel (Shin'ichi vs Shinichi).
        out += "n'";
      } else {
        out += 'n';
      }
      continue;
    }

    if (cur.long && cur.vowel) {
      // "ii" is conventionally written in full rather than marked long.
      out += cur.vowel === 'i'
        ? cur.text + 'i'
        : cur.text.slice(0, -1) + renderLongVowel(cur.vowel, style);
      continue;
    }

    out += cur.text;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Render a lengthened vowel according to the requested style. */
function renderLongVowel(vowel: string, style: LongVowelStyle): string {
  switch (style) {
    case 'macron':
      return MACRONS[vowel] ?? vowel;
    case 'circumflex':
      return CIRCUMFLEXES[vowel] ?? vowel;
    case 'oh':
      // Passport "OH" convention applies to long o only.
      return vowel === 'o' ? 'oh' : vowel;
    case 'none':
    default:
      // Passport Hepburn leaves vowel length unmarked.
      return vowel;
  }
}

/**
 * Should `first` followed by `second` be treated as one long vowel?
 *
 * Hepburn keeps "ei" as two letters (Seiwa, not Sēwa), so エイ is excluded.
 */
function isLongVowelPair(first: string, second: string): boolean {
  if (first === 'o' && (second === 'o' || second === 'u')) return true;
  if (first === 'u' && second === 'u') return true;
  if (first === 'a' && second === 'a') return true;
  if (first === 'e' && second === 'e') return true;
  if (first === 'i' && second === 'i') return true;
  return false;
}

/**
 * Transliterate a katakana (or hiragana) reading into romaji.
 *
 * Returns lowercase romaji; casing is applied by the formatting layer.
 * Returns `undefined` when the reading contains characters this function
 * cannot spell, so the caller can fail explicitly rather than emit a
 * half-transliterated name.
 */
export function kanaToRomaji(
  reading: string,
  style: LongVowelStyle = 'none',
): string | undefined {
  const kana = toKatakana(reading).replace(/[\s\u3000]/g, '');
  if (kana.length === 0) return undefined;
  if (!isTransliterableKana(kana)) return undefined;

  return renderSyllables(analyzeKana(kana), style) || undefined;
}

/** True when the style needs a kana reading (romaji field cannot supply it). */
export function requiresKana(style: LongVowelStyle): boolean {
  return style !== 'none';
}
