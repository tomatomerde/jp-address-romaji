/**
 * Arabic <-> kanji numerals, for the chome portion of an address.
 *
 * Scope is deliberately small: chome numbers are small positive integers
 * (the largest in the national dataset is well under 100), and this is only
 * used to write `3` back as `三丁目`. General-purpose numeral conversion for
 * address parsing is handled upstream by @geolonia/japanese-numeral.
 */

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'] as const;

/**
 * Write a number using kanji numerals in the style addresses use.
 * 1 -> 一, 10 -> 十, 11 -> 十一, 21 -> 二十一, 100 -> 百
 */
export function numberToKanji(value: number): string {
  if (!Number.isInteger(value) || value < 0) return String(value);
  if (value < 10) return DIGITS[value]!;
  if (value < 100) {
    const tens = Math.floor(value / 10);
    const ones = value % 10;
    // 10-19 are written without a leading 一.
    const tensPart = tens === 1 ? '十' : `${DIGITS[tens]!}十`;
    return ones === 0 ? tensPart : `${tensPart}${DIGITS[ones]!}`;
  }
  if (value < 1000) {
    const hundreds = Math.floor(value / 100);
    const remainder = value % 100;
    const hundredsPart = hundreds === 1 ? '百' : `${DIGITS[hundreds]!}百`;
    return remainder === 0 ? hundredsPart : `${hundredsPart}${numberToKanji(remainder)}`;
  }
  return String(value);
}

/** Parse kanji numerals of the form produced by {@link numberToKanji}. */
export function kanjiToNumber(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);

  let total = 0;
  let current = 0;
  let sawAny = false;

  for (const ch of text) {
    const digit = DIGITS.indexOf(ch as (typeof DIGITS)[number]);
    if (digit >= 0) {
      current = digit;
      sawAny = true;
      continue;
    }
    if (ch === '十') {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
      sawAny = true;
      continue;
    }
    if (ch === '百') {
      total += (current === 0 ? 1 : current) * 100;
      current = 0;
      sawAny = true;
      continue;
    }
    return undefined;
  }

  return sawAny ? total + current : undefined;
}
