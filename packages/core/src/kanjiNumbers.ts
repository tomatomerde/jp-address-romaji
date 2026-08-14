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

function digitValue(ch: string): number | undefined {
  const i = DIGITS.indexOf(ch as (typeof DIGITS)[number]);
  return i >= 0 ? i : undefined;
}

/**
 * Parse a strict tens/ones kanji numeral (1-99, no `百`) — the same shape
 * {@link numberToKanji} produces for a value under 100: an optional leading
 * digit (omitted for exactly 10-19), `十`, and an optional trailing digit
 * (omitted when the ones place is zero). Anything else — a bare run of
 * digit characters, a leading `一`/`〇` before `十`, a trailing `〇`, more
 * than one `十` — is not a shape `numberToKanji` ever writes, and is
 * rejected rather than guessed at.
 */
function parseTensOnes(text: string): number | undefined {
  if (text === '') return undefined;

  const juIndex = text.indexOf('十');
  if (juIndex === -1) {
    // No `十`: only a single digit character is valid ("三" -> 3). A bare
    // run of digit characters ("一〇一", "一二") is vertical/digit-style
    // writing that numberToKanji never emits — reject it rather than
    // silently reading only its first character.
    return text.length === 1 ? digitValue(text) : undefined;
  }
  if (text.indexOf('十', juIndex + 1) !== -1) return undefined; // more than one 十

  const prefix = text.slice(0, juIndex);
  const suffix = text.slice(juIndex + 1);

  let tens: number;
  if (prefix === '') {
    tens = 1; // "十" alone is 10, no leading 一.
  } else {
    if (prefix.length !== 1) return undefined;
    const d = digitValue(prefix);
    if (d === undefined || d < 2) return undefined; // "一十" / "〇十" not produced
    tens = d;
  }

  let ones = 0;
  if (suffix !== '') {
    if (suffix.length !== 1) return undefined;
    const d = digitValue(suffix);
    if (d === undefined || d === 0) return undefined; // trailing 〇 not produced
    ones = d;
  }

  return tens * 10 + ones;
}

/**
 * Parse kanji numerals of the form produced by {@link numberToKanji}.
 *
 * This is a strict inverse, not a general kanji-numeral reader: anything
 * outside the exact shapes `numberToKanji` writes (digit-style runs like
 * `一〇一`, a doubled `十十`, a bare `一百`) returns `undefined` rather than a
 * number that happens to parse out of the leftover characters. A wrong
 * number silently substituted for a rejected one is worse than the
 * rejection — see the project's "読みを推測しない" rule, which this mirrors
 * for numerals rather than romaji readings.
 *
 * `一〇一` (a common vertical-text digit-by-digit style for 101) is
 * deliberately rejected rather than accepted as 101: `numberToKanji` never
 * emits a bare run of digit characters for anything over 9, so there is no
 * grammar in this module that says which digit-run lengths are meant
 * positionally (101) versus which are simply malformed input, and guessing
 * one interpretation over the other is exactly what this function must not
 * do. Callers that need to read digit-style numerals should convert them
 * with a general-purpose kanji numeral parser upstream (e.g.
 * `@geolonia/japanese-numeral`, already a project dependency chain via
 * normalize-japanese-addresses) before calling this function.
 */
export function kanjiToNumber(input: string): number | undefined {
  const text = input.trim();
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);

  const hyakuIndex = text.indexOf('百');
  if (hyakuIndex === -1) return parseTensOnes(text);
  if (text.indexOf('百', hyakuIndex + 1) !== -1) return undefined; // more than one 百

  const prefix = text.slice(0, hyakuIndex);
  const rest = text.slice(hyakuIndex + 1);

  let hundreds: number;
  if (prefix === '') {
    hundreds = 1; // "百" alone is 100, no leading 一.
  } else {
    if (prefix.length !== 1) return undefined;
    const d = digitValue(prefix);
    if (d === undefined || d < 2) return undefined; // "一百" not produced
    hundreds = d;
  }

  if (rest === '') return hundreds * 100;
  const remainder = parseTensOnes(rest);
  return remainder === undefined ? undefined : hundreds * 100 + remainder;
}
