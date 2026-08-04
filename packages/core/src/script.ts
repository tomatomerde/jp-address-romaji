/**
 * Script detection, shared by the language-detecting `parse()` entry point
 * and by `fromRomaji()`'s handling of embedded building names.
 *
 * Kept in its own module (rather than living in parse.ts) because fromRomaji.ts
 * needs it too, and parse.ts already imports fromRomaji.ts — putting it there
 * would create a cycle.
 */

/** Does this string contain Japanese script (kana or kanji)? */
export function containsJapanese(input: string): boolean {
  // Hiragana, katakana, CJK ideographs, and the halfwidth katakana block.
  return /[぀-ゟ゠-ヿ㐀-䶿一-鿿ｦ-ﾝ]/.test(input);
}
