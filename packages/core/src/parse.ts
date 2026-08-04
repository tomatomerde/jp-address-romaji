/**
 * Language- and order-detecting entry point.
 */

import type { ParsedAddress, Result } from './types.js';
import { toRomaji } from './toRomaji.js';
import { fromRomaji } from './fromRomaji.js';
import { containsJapanese } from './script.js';

export { containsJapanese };

/** Which form the input is written in. */
export type AddressScript = 'japanese' | 'romaji';

/** Detect whether an address is written in Japanese or in romaji. */
export function detectScript(input: string): AddressScript {
  return containsJapanese(input) ? 'japanese' : 'romaji';
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
