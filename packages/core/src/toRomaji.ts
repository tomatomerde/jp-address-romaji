/**
 * Japanese address -> romanized, western-order address.
 */

import type {
  ParsedAddress,
  Result,
  RomajiAddress,
  ToRomajiOptions,
  AddressComponent,
  Failure,
  LongVowelStyle,
} from './types.js';
import {
  isDataConfigured,
  normalizeJapanese,
  splitBlockNumbers,
  type NormalizedAddress,
} from './normalizer.js';
import { findPrefectureByJa } from './data/prefectures.js';
import {
  applyCapitalization,
  formatBlockNumbers,
  formatKoaza,
  formatMunicipality,
  formatTown,
} from './romaji/format.js';
import { splitKyotoStreet } from './kyoto.js';
import { isKoazaReadingComplete, isPlausibleReading } from './romaji/validate.js';

const DEFAULTS: Required<Omit<ToRomajiOptions, never>> = {
  longVowel: 'none',
  order: 'western',
  includeCountry: true,
  postalCode: 'suffix',
  capitalization: 'title',
  includeUnparsed: true,
};

function fail(reason: Failure['reason'], message: string, partial?: Partial<ParsedAddress>): Failure {
  return { ok: false, reason, message, ...(partial ? { partial } : {}) };
}

/** Prefecture romaji comes from the fixed 47-entry table. */
function prefectureRomaji(ja: string, style: LongVowelStyle): string | undefined {
  const entry = findPrefectureByJa(ja);
  if (!entry) return undefined;
  switch (style) {
    case 'macron':
      return entry.romajiMacron;
    case 'circumflex':
      return entry.romajiMacron
        .replace(/ō/g, 'ô').replace(/Ō/g, 'Ô')
        .replace(/ū/g, 'û').replace(/Ū/g, 'Û')
        .replace(/ā/g, 'â').replace(/Ā/g, 'Â')
        .replace(/ē/g, 'ê').replace(/Ē/g, 'Ê');
    case 'oh':
      return entry.romajiMacron.replace(/Ō/g, 'Oh').replace(/ō/g, 'oh');
    case 'none':
    default:
      return entry.romaji;
  }
}

/**
 * The municipality as the dataset names it, for an error message.
 *
 * Built the same way the dataset's own file paths are (county + city + ward),
 * so the name in the message is the one a reader can look for in their data
 * directory. Falls back to describing what little was resolved rather than
 * printing an empty string.
 */
function municipalityLabel(normalized: NormalizedAddress): string {
  const parts = [
    normalized.pref?.ja,
    normalized.county?.ja,
    normalized.city?.ja,
    normalized.ward?.ja,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join('') : 'this address';
}

/**
 * Whatever was resolved down to the municipality, as a `partial`.
 *
 * Deliberately does not require a romanization for any of it: this is
 * diagnostic output for a failure that has nothing to do with readings, and
 * dropping a component because its romaji is missing would hide the very
 * field the caller needs to know which file to publish.
 */
function resolvedMunicipality(
  normalized: NormalizedAddress,
  style: LongVowelStyle,
  postalCode?: string,
): Partial<ParsedAddress> | undefined {
  const partial: Partial<ParsedAddress> = { blockNumbers: [] };
  if (normalized.pref) {
    const romaji = prefectureRomaji(normalized.pref.ja, style);
    partial.prefecture = {
      ja: normalized.pref.ja,
      ...(normalized.pref.kana ? { kana: normalized.pref.kana } : {}),
      ...(romaji ? { romaji } : {}),
    };
  }
  const county = buildMunicipality(normalized.county, style);
  const city = buildMunicipality(normalized.city, style);
  const ward = buildMunicipality(normalized.ward, style);
  if (county) partial.county = county;
  if (city) partial.city = city;
  if (ward) partial.ward = ward;
  if (postalCode) partial.postalCode = postalCode;
  partial.level = normalized.level;
  return partial.prefecture ? partial : undefined;
}

/**
 * Convert a Japanese address into a romanized address for international use.
 *
 * Returns a failure rather than a guess whenever a component cannot be backed
 * by the dataset. In particular, rural `oaza` town names frequently carry
 * neither a romaji field nor a kana reading; those yield `NO_ROMAJI_DATA`.
 */
export async function toRomaji(
  japaneseAddress: string,
  options: ToRomajiOptions = {},
): Promise<Result<RomajiAddress>> {
  const opts = { ...DEFAULTS, ...options };

  if (!japaneseAddress || !japaneseAddress.trim()) {
    return fail('EMPTY_INPUT', 'Input address is empty.');
  }
  if (!isDataConfigured()) {
    return fail(
      'DATA_NOT_CONFIGURED',
      'No address dataset is configured. Install `jp-address-romaji-data`, or call ' +
        '`configureDataSource({ dataDir })` with a local data directory.',
    );
  }
  const { postalCode, rest: withoutPostal } = splitPostalCode(japaneseAddress);

  // A Kyoto street phrase must come out before normalization: its street names
  // contain the same kanji numerals as chome, so `烏丸通四条上ル笋町` would
  // otherwise be read as chome 4 of an unrelated town. See kyoto.ts.
  const { street: kyotoStreet, rest: withoutStreet } = splitKyotoStreet(withoutPostal);
  const normalized = await normalizeJapanese(withoutStreet);

  // Handled before anything else reads `normalized`, because every other
  // branch below would describe this state as something it is not: with no
  // town file, `level` stops at 2 and the flow falls through to
  // TOWN_NOT_FOUND — "the town could not be identified" — about a town that
  // may well be in the dataset on a host that carries it. `fromRomaji`
  // already answers this situation with DATA_NOT_CONFIGURED; the two
  // directions reach the dataset through different code and used to disagree,
  // with this one throwing outright (#58).
  if (normalized.townDataUnavailable) {
    const where = municipalityLabel(normalized);
    return fail(
      'DATA_NOT_CONFIGURED',
      `The dataset has no readable town data for ${where}. Reading it failed: ` +
        `${normalized.townDataUnavailable.reason}`,
      resolvedMunicipality(normalized, opts.longVowel, postalCode),
    );
  }

  if (!normalized.pref) {
    return fail('PREFECTURE_NOT_FOUND', `Could not identify a prefecture in "${japaneseAddress}".`);
  }

  const prefRomaji = prefectureRomaji(normalized.pref.ja, opts.longVowel);
  if (!prefRomaji) {
    return fail(
      'PREFECTURE_NOT_FOUND',
      `"${normalized.pref.ja}" is not a recognized prefecture.`,
    );
  }
  const prefecture: AddressComponent = {
    ja: normalized.pref.ja,
    ...(normalized.pref.kana ? { kana: normalized.pref.kana } : {}),
    romaji: prefRomaji,
  };

  const partial: Partial<ParsedAddress> = { prefecture, blockNumbers: [] };
  if (postalCode) partial.postalCode = postalCode;

  if (!normalized.city) {
    return fail('CITY_NOT_FOUND', `Could not identify a municipality in "${japaneseAddress}".`, partial);
  }

  // County / city / ward each carry their own reading in the dataset.
  const county = buildMunicipality(normalized.county, opts.longVowel);
  const city = buildMunicipality(normalized.city, opts.longVowel);
  const ward = buildMunicipality(normalized.ward, opts.longVowel);

  if (!city || !city.romaji) {
    return fail(
      opts.longVowel === 'none' ? 'NO_ROMAJI_DATA' : 'KANA_REQUIRED_FOR_LONG_VOWELS',
      opts.longVowel === 'none'
        ? `No usable romanization is available for "${normalized.city.ja}".`
        : `The "${opts.longVowel}" long-vowel style needs a kana reading, and none is ` +
          `available for "${normalized.city.ja}".`,
      partial,
    );
  }
  if (county) partial.county = county;
  partial.city = city;
  if (ward) partial.ward = ward;

  if (kyotoStreet) partial.kyotoStreet = kyotoStreet;

  if (!normalized.town) {
    return fail(
      kyotoStreet ? 'KYOTO_STREET_ADDRESS' : 'TOWN_NOT_FOUND',
      kyotoStreet
        ? `Recognized the Kyoto street phrase "${kyotoStreet}", but the town that follows it ` +
          `("${normalized.rest}") is not in the dataset for ${city.romaji}.`
        : `Resolved only to ${city.romaji}; the town could not be identified in "${japaneseAddress}".`,
      { ...partial, level: normalized.level },
    );
  }

  // A reading whose length is implausible for its kanji indicates a shifted
  // dataset row (see isPlausibleReading). Both the kana and the romaji are
  // wrong in that case, so there is nothing trustworthy left to romanize from.
  if (!isPlausibleReading(normalized.town.ja, normalized.town.kana)) {
    return fail(
      'CORRUPT_ROMAJI_DATA',
      `The dataset's reading for "${normalized.town.ja}" ("${normalized.town.kana}") is ` +
        `implausible for that name and appears to belong to a different entry. ` +
        `Refusing to romanize from it.`,
      { ...partial, town: { ja: normalized.town.ja }, level: normalized.level },
    );
  }

  const townRomaji = formatTown(normalized.town.kana, normalized.town.romaji, opts.longVowel);
  if (!townRomaji) {
    const needsKana = opts.longVowel !== 'none';
    return fail(
      needsKana && normalized.town.romaji ? 'KANA_REQUIRED_FOR_LONG_VOWELS' : 'NO_ROMAJI_DATA',
      needsKana && normalized.town.romaji
        ? `The "${opts.longVowel}" long-vowel style needs a kana reading, and none is ` +
          `available for "${normalized.town.ja}".`
        : `The dataset has no usable romanization for the town "${normalized.town.ja}". ` +
          `This is common for rural "oaza" place names; the address cannot be romanized ` +
          `without inventing a reading.`,
      { ...partial, town: { ja: normalized.town.ja }, level: normalized.level },
    );
  }

  const town: AddressComponent = {
    ja: normalized.town.ja,
    ...(normalized.town.kana ? { kana: normalized.town.kana } : {}),
    romaji: townRomaji,
  };

  // A named koaza (small-area subdivision) sitting inside the town, e.g.
  // 「本町三丁目大横」's koaza 「三丁目大横」. `recoverKoazaNumber`
  // (normalizer.ts) already folded a purely-numeric koaza into the block
  // numbers, so anything that reaches us here is text that must itself be
  // romanized — or refused, never dropped. See CLAUDE.md's "never guess a
  // reading" value and docs/project-status.md item 1 for the bug this closes:
  // `toRomaji('長野県飯田市本町三丁目大横1-1', {})` used to silently return
  // "1-1 Hommachi, Iida-shi, Nagano, Japan", a DIFFERENT, koaza-less address.
  let koaza: AddressComponent | undefined;
  if (normalized.koaza) {
    if (!isKoazaReadingComplete(normalized.koaza.ja, normalized.koaza.kana)) {
      return fail(
        'KOAZA_READING_INCOMPLETE',
        `"${normalized.town.ja}" has a named koaza "${normalized.koaza.ja}", but the dataset's ` +
          `reading for it${normalized.koaza.kana ? ` ("${normalized.koaza.kana}")` : ''} cannot ` +
          `be verified to cover the whole name. Refusing to romanize a possibly-truncated ` +
          `reading rather than silently dropping part of the address.`,
        { ...partial, town, koaza: { ja: normalized.koaza.ja }, level: normalized.level },
      );
    }
    const koazaRomaji = formatKoaza(normalized.koaza.kana, normalized.koaza.romaji, opts.longVowel);
    if (!koazaRomaji) {
      const needsKana = opts.longVowel !== 'none';
      return fail(
        needsKana && normalized.koaza.romaji ? 'KANA_REQUIRED_FOR_LONG_VOWELS' : 'NO_ROMAJI_DATA',
        needsKana && normalized.koaza.romaji
          ? `The "${opts.longVowel}" long-vowel style needs a kana reading, and none is ` +
            `available for the koaza "${normalized.koaza.ja}".`
          : `The dataset has no usable romanization for the koaza "${normalized.koaza.ja}".`,
        { ...partial, town, koaza: { ja: normalized.koaza.ja }, level: normalized.level },
      );
    }
    koaza = {
      ja: normalized.koaza.ja,
      ...(normalized.koaza.kana ? { kana: normalized.koaza.kana } : {}),
      romaji: koazaRomaji,
    };
  }

  const { blockNumbers, unparsed } = splitBlockNumbers(normalized.rest);

  const parsed: ParsedAddress = {
    ...(postalCode ? { postalCode } : {}),
    prefecture,
    ...(county ? { county } : {}),
    city,
    ...(ward ? { ward } : {}),
    town,
    ...(koaza ? { koaza } : {}),
    ...(kyotoStreet ? { kyotoStreet } : {}),
    ...(normalized.chome !== undefined ? { chome: normalized.chome } : {}),
    blockNumbers,
    ...(unparsed ? { unparsed } : {}),
    level: normalized.level,
  };

  const formatted = render(parsed, opts);
  return {
    ok: true,
    value: { formatted, parsed },
    ...(unparsed ? { unparsed } : {}),
  };
}

function buildMunicipality(
  part: { ja: string; kana?: string; romaji?: string } | undefined,
  style: LongVowelStyle,
): AddressComponent | undefined {
  if (!part) return undefined;
  const romaji = formatMunicipality(part.ja, part.kana, part.romaji, style);
  return {
    ja: part.ja,
    ...(part.kana ? { kana: part.kana } : {}),
    ...(romaji ? { romaji } : {}),
  };
}

/** A postal code plus the input with that code removed. */
interface PostalSplit {
  postalCode?: string;
  /** Input with the postal code removed, ready for the normalizer. */
  rest: string;
}

/**
 * Separate the postal code from the rest of the address.
 *
 * The postal code must be removed before normalization. A leading `〒151-0064`
 * stops the upstream normalizer from recognizing the address at all (it
 * returns level 0), and a trailing one is otherwise carried into the leftover
 * text and misread as a building name.
 *
 * The `NNN-NNNN` shape alone is not enough to identify a postal code: a
 * 4-digit block number followed by a hyphenated banchi (`西新宿1123-4567`)
 * or a phone number (`TEL03-1234-5678`) both contain an unrelated
 * `\d{3}[-]\d{4}` substring. Both sides of the match are therefore required
 * to *not* be adjacent to another digit or dash-like character — that's what
 * marks the run as an isolated code rather than a fragment of a longer
 * digit/hyphen sequence. `(?<!\d)` alone (front boundary only) still let a
 * pattern like `090-1234-5678` match `090-1234`, since nothing followed the
 * `4` immediately except another hyphen; excluding hyphens too closes that
 * gap.
 */
function splitPostalCode(input: string): PostalSplit {
  const normalized = input.normalize('NFKC');
  const match = normalized.match(
    /(?<![\d\-‐‑−ー－])〒?\s*(\d{3})\s*[-‐‑−ー－]\s*(\d{4})(?![\d\-‐‑−ー－])/,
  );
  if (!match) return { rest: normalized };
  const rest = normalized.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { postalCode: `${match[1]}-${match[2]}`, rest };
}

/** Pull a `NNN-NNNN` postal code out of the raw input, if present. */
export function extractPostalCode(input: string): string | undefined {
  return splitPostalCode(input).postalCode;
}

/** Render a parsed address into a single line. */
function render(parsed: ParsedAddress, opts: Required<ToRomajiOptions>): string {
  const numbers = formatBlockNumbers(parsed.chome, parsed.blockNumbers);
  const town = parsed.town?.romaji ?? '';
  // Administratively, a koaza sits between the town and the chome/block
  // numbers (town > koaza > chome > banchi), so it is placed immediately
  // next to the town on the side that reflects that — adjacent to it in both
  // orders, and always as its own space-separated word so it can never be
  // mistaken for one of the hyphenated digits in `numbers`.
  const koaza = parsed.koaza?.romaji;
  const segments: string[] = [];

  if (opts.order === 'western') {
    // Smallest unit first: "2-8-1 Nishi-Shinjuku, Shinjuku-ku, Tokyo".
    segments.push([numbers, koaza, town].filter(Boolean).join(' '));
    if (parsed.ward?.romaji) segments.push(parsed.ward.romaji);
    if (parsed.city?.romaji) segments.push(parsed.city.romaji);
    if (parsed.county?.romaji) segments.push(parsed.county.romaji);
    if (parsed.prefecture?.romaji) segments.push(parsed.prefecture.romaji);
  } else {
    // Japanese order, romanized: "Tokyo, Shinjuku-ku, Nishi-Shinjuku 2-8-1".
    if (parsed.prefecture?.romaji) segments.push(parsed.prefecture.romaji);
    if (parsed.county?.romaji) segments.push(parsed.county.romaji);
    if (parsed.city?.romaji) segments.push(parsed.city.romaji);
    if (parsed.ward?.romaji) segments.push(parsed.ward.romaji);
    segments.push([town, koaza, numbers].filter(Boolean).join(' '));
  }

  let line = segments.filter(Boolean).join(', ');

  if (parsed.postalCode && opts.postalCode === 'prefix') {
    line = `〒${parsed.postalCode} ${line}`;
  } else if (parsed.postalCode && opts.postalCode === 'suffix') {
    line = `${line} ${parsed.postalCode}`;
  }

  if (opts.includeUnparsed && parsed.unparsed) {
    // Building names are passed through verbatim, never romanized. Placement
    // follows the convention of each order: western addresses commonly list
    // the suite/building as a leading item, while Japanese order writes it
    // immediately after the block numbers — at the very end of the line.
    line = opts.order === 'japanese' ? `${line}, ${parsed.unparsed}` : `${parsed.unparsed}, ${line}`;
  }

  if (opts.includeCountry) line = `${line}, Japan`;

  return applyCapitalization(line, opts.capitalization);
}
