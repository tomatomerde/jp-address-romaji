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
import { isDataConfigured, normalizeJapanese, splitBlockNumbers } from './normalizer.js';
import { findPrefectureByJa } from './data/prefectures.js';
import {
  applyCapitalization,
  formatBlockNumbers,
  formatMunicipality,
  formatTown,
} from './romaji/format.js';
import { splitKyotoStreet } from './kyoto.js';
import { isPlausibleReading } from './romaji/validate.js';

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

  const { blockNumbers, unparsed } = splitBlockNumbers(normalized.rest);

  const parsed: ParsedAddress = {
    ...(postalCode ? { postalCode } : {}),
    prefecture,
    ...(county ? { county } : {}),
    city,
    ...(ward ? { ward } : {}),
    town,
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
 */
function splitPostalCode(input: string): PostalSplit {
  const normalized = input.normalize('NFKC');
  const match = normalized.match(/〒?\s*(\d{3})\s*[-‐‑−ー－]\s*(\d{4})(?!\d)/);
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
  const segments: string[] = [];

  if (opts.order === 'western') {
    // Smallest unit first: "3-5-12 Nishi-Shinjuku, Shibuya-ku, Tokyo".
    segments.push([numbers, town].filter(Boolean).join(' '));
    if (parsed.ward?.romaji) segments.push(parsed.ward.romaji);
    if (parsed.city?.romaji) segments.push(parsed.city.romaji);
    if (parsed.county?.romaji) segments.push(parsed.county.romaji);
    if (parsed.prefecture?.romaji) segments.push(parsed.prefecture.romaji);
  } else {
    // Japanese order, romanized: "Tokyo, Shibuya-ku, Nishi-Shinjuku 3-5-12".
    if (parsed.prefecture?.romaji) segments.push(parsed.prefecture.romaji);
    if (parsed.county?.romaji) segments.push(parsed.county.romaji);
    if (parsed.city?.romaji) segments.push(parsed.city.romaji);
    if (parsed.ward?.romaji) segments.push(parsed.ward.romaji);
    segments.push([town, numbers].filter(Boolean).join(' '));
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
