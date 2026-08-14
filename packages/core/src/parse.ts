/**
 * Language- and order-detecting entry point.
 */

import type { ParsedAddress, Result } from './types.js';
import { toRomaji } from './toRomaji.js';
import { fromRomaji } from './fromRomaji.js';
import { containsJapanese } from './script.js';
import { findPrefectureByRomaji } from './data/prefectures.js';

export { containsJapanese };

/** Which form the input is written in. */
export type AddressScript = 'japanese' | 'romaji';

// Mirrors just the two pieces of fromRomaji.ts's own tokenize() needed to
// recognize a western-order address by shape: a trailing country name, and
// a postal code that can appear anywhere in the string (not only at the
// end — see toRomaji's `postalCode: 'prefix'` rendering). Duplicated here
// rather than imported because tokenize() is private to fromRomaji.ts and
// this check must stay synchronous and independent of the address dataset.
const TRAILING_COUNTRY = /[,\s]+(japan|nippon|nihon)\s*$/i;
const POSTAL_CODE = /(?<![\d\-‐‑−ー－])〒?\s*(\d{3})\s*[-‐‑−ー－]\s*(\d{4})(?![\d\-‐‑−ー－])/;

/**
 * Does `address` have the comma-separated, ends-in-a-known-prefecture shape
 * that only a western-order romaji address takes?
 *
 * `fromRomaji` deliberately lets a building-name segment carry Japanese
 * script through verbatim (it splits such segments out before matching —
 * see fromRomaji.ts), so an address can legitimately contain Japanese text
 * and still be a romaji address overall: `toRomaji`'s own output does this
 * whenever `includeUnparsed` carries a Japanese building name. "Contains
 * Japanese somewhere" therefore cannot decide the routing by itself.
 *
 * This looks instead at the one part of the shape that is a closed-set
 * lookup, not a guess: whether the last comma-separated segment (after
 * stripping a trailing country name and any postal code) names one of the
 * 47 prefectures. A genuine Japanese-order address never has that shape —
 * it is unsegmented and, since it is Japanese throughout, its last segment
 * is never a bare romaji prefecture name either.
 */
function looksLikeRomajiAddress(address: string): boolean {
  const text = address
    .normalize('NFKC')
    .trim()
    .replace(TRAILING_COUNTRY, '')
    .replace(POSTAL_CODE, ' ')
    .trim();
  const segments = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const last = segments[segments.length - 1];
  return !!last && !containsJapanese(last) && findPrefectureByRomaji(last) !== undefined;
}

/**
 * Detect whether an address is written in Japanese or in romaji.
 *
 * Not a pure "does it contain Japanese script?" test: a romaji address can
 * carry an embedded Japanese building-name segment (see
 * {@link looksLikeRomajiAddress}), and that must still be routed to
 * `fromRomaji`, not `toRomaji`. A building name with no other address
 * information (`"東京都民ビル"`, `"北海道ビル"`) has no romaji shape to
 * recognize, so it correctly falls through to 'japanese' here — the same
 * as before this distinction existed.
 */
export function detectScript(input: string): AddressScript {
  if (!containsJapanese(input)) return 'romaji';
  return looksLikeRomajiAddress(input) ? 'romaji' : 'japanese';
}

/**
 * Parse an address written in either script into a common structure.
 *
 * Detection is by script, not by word order: a Japanese address is always in
 * Japanese order, and a romanized one is parsed as western order.
 */
export async function parse(address: string): Promise<Result<ParsedAddress>> {
  if (!address || !address.trim()) {
    return { ok: false, reason: 'EMPTY_INPUT', message: 'Input address is empty.' };
  }

  if (detectScript(address) === 'japanese') {
    const result = await toRomaji(address);
    if (!result.ok) return result;
    return {
      ok: true,
      value: result.value.parsed,
      ...(result.value.parsed.unparsed ? { unparsed: result.value.parsed.unparsed } : {}),
    };
  }

  const result = await fromRomaji(address);
  if (!result.ok) return result;
  return {
    ok: true,
    value: result.value.parsed,
    ...(result.value.parsed.unparsed ? { unparsed: result.value.parsed.unparsed } : {}),
  };
}
