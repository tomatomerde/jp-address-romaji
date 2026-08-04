/**
 * Romanized, western-order address -> structured address + Japanese text.
 *
 * Ambiguity is the central problem here. Measured over the national dataset,
 * a town's romanized name is unique within a known municipality 99.74% of the
 * time, but only 88.6% of the time nationwide, and 13 municipality names
 * collide across prefectures ("Date-shi" is both 北海道伊達市 and 福島県伊達市).
 *
 * So resolution is strictly outside-in: prefecture, then municipality, then
 * town. When more than one reading survives, we return AMBIGUOUS with the
 * candidates rather than picking one.
 */

import type { AddressComponent, Failure, ParsedAddress, Result } from './types.js';
import { findPrefectureByRomaji, normalizeRomajiKey, PREFECTURES } from './data/prefectures.js';
import { isDataConfigured } from './normalizer.js';
import {
  cityPathName,
  loadMachiAza,
  loadPrefectures,
  type CityRecord,
  type MachiAzaRecord,
} from './dataAccess.js';
import { kanaToRomaji } from './romaji/hepburn.js';
import { stripTrailingChomeNumber } from './romaji/validate.js';
import { numberToKanji } from './kanjiNumbers.js';

/** A Japanese address reconstructed from romaji. */
export interface JapaneseAddress {
  /** Address written in Japanese, in conventional order. */
  formatted: string;
  /** The structured form it was built from. */
  parsed: ParsedAddress;
}

function fail(reason: Failure['reason'], message: string, partial?: Partial<ParsedAddress>): Failure {
  return { ok: false, reason, message, ...(partial ? { partial } : {}) };
}

/** Administrative suffixes as they appear in romanized input. */
const SUFFIX_PATTERN = /[-\s]?(shi|ku|cho|chou|machi|mura|son|gun|city|ward)$/i;

/** Strip the administrative suffix so `Shibuya-ku` matches `渋谷区`. */
function stemKey(token: string): string {
  return normalizeRomajiKey(token.replace(SUFFIX_PATTERN, ''));
}

/** All romaji spellings a dataset record can reasonably be written as. */
function candidateKeys(jaName: string, kana?: string, romajiField?: string): Set<string> {
  const keys = new Set<string>();
  const add = (v: string | undefined) => {
    if (!v) return;
    keys.add(normalizeRomajiKey(v));
    keys.add(stemKey(v));
  };
  if (romajiField) add(stripTrailingChomeNumber(romajiField));
  if (kana) {
    // Accept every long-vowel convention the forward direction can emit.
    add(kanaToRomaji(kana, 'none'));
    add(kanaToRomaji(kana, 'macron'));
    add(kanaToRomaji(kana, 'oh'));
  }
  keys.delete('');
  return keys;
}

/**
 * Convert a western-order romaji address back into Japanese.
 *
 * Example input: `"3-5-12 Nishi-Shinjuku, Shinjuku-ku, Tokyo 160-0023"`.
 */
export async function fromRomaji(romajiAddress: string): Promise<Result<JapaneseAddress>> {
  if (!romajiAddress || !romajiAddress.trim()) {
    return fail('EMPTY_INPUT', 'Input address is empty.');
  }
  if (!isDataConfigured()) {
    return fail(
      'DATA_NOT_CONFIGURED',
      'No address dataset is configured. Install `jp-address-romaji-data`, or call ' +
        '`configureDataSource({ dataDir })` with a local data directory.',
    );
  }

  const { postalCode, segments } = tokenize(romajiAddress);
  if (segments.length === 0) {
    return fail('EMPTY_INPUT', 'No address components were found in the input.');
  }

  // --- prefecture: last segment ---
  let remaining = [...segments];
  const prefEntry = findPrefectureByRomaji(remaining[remaining.length - 1] ?? '');
  if (!prefEntry) {
    return fail(
      'PREFECTURE_NOT_FOUND',
      `Could not identify a prefecture. Expected one of the 47 prefecture names as the ` +
        `last component, but found "${remaining[remaining.length - 1] ?? ''}".`,
    );
  }
  remaining = remaining.slice(0, -1);

  const prefecture: AddressComponent = {
    ja: prefEntry.ja,
    kana: prefEntry.kana,
    romaji: prefEntry.romaji,
  };
  const partial: Partial<ParsedAddress> = { prefecture, blockNumbers: [] };
  if (postalCode) partial.postalCode = postalCode;

  const prefectures = await loadPrefectures();
  const prefRecord = prefectures?.find((p) => p.pref === prefEntry.ja);
  if (!prefRecord) {
    return fail(
      'DATA_NOT_CONFIGURED',
      `The dataset does not contain "${prefEntry.ja}". The configured data directory may be incomplete.`,
      partial,
    );
  }

  // --- municipality: consume segments from the end while they match ---
  const municipality = matchMunicipality(prefRecord.cities, remaining);
  if (!municipality) {
    return fail(
      'CITY_NOT_FOUND',
      `Could not identify a municipality in ${prefEntry.romaji} from "${remaining.join(', ')}".`,
      partial,
    );
  }
  remaining = remaining.slice(0, remaining.length - municipality.consumed);

  const record = municipality.record;
  if (record.county) {
    partial.county = { ja: record.county, kana: record.county_k, romaji: record.county_r };
  }
  partial.city = { ja: record.city, kana: record.city_k, romaji: record.city_r };
  if (record.ward) {
    partial.ward = { ja: record.ward, kana: record.ward_k, romaji: record.ward_r };
  }

  // --- town + numbers: whatever is left ---
  const rest = remaining.join(', ').trim();
  if (!rest) {
    return fail(
      'TOWN_NOT_FOUND',
      `Resolved only as far as ${cityPathName(record)}; no town component was present.`,
      { ...partial, level: 2 },
    );
  }

  const { numbers, name, unparsed } = splitNumbersAndName(rest);
  if (!name) {
    return fail('TOWN_NOT_FOUND', `No town name was found in "${rest}".`, { ...partial, level: 2 });
  }

  const towns = await loadMachiAza(prefRecord.pref, cityPathName(record));
  if (!towns) {
    return fail(
      'DATA_NOT_CONFIGURED',
      `The dataset has no town data for ${prefRecord.pref}${cityPathName(record)}.`,
      partial,
    );
  }

  const matches = matchTowns(towns, name);
  if (matches.length === 0) {
    return fail(
      'TOWN_NOT_FOUND',
      `"${name}" does not match any town in ${prefRecord.pref}${cityPathName(record)}.`,
      { ...partial, level: 2 },
    );
  }

  // Ambiguity must be resolved BEFORE interpreting the leading number.
  //
  // `大字原別` and `原別一丁目` both romanize to "Harabetsu", so for the input
  // "1-1 Harabetsu" the leading 1 is either a chome of 原別 or a banchi of
  // 大字原別. Filtering by chome first would silently pick one reading; the
  // honest answer is that the input does not determine the address.
  const distinct = [...new Set(matches.map((m) => m.oaza_cho ?? ''))];
  if (distinct.length > 1) {
    const candidates: ParsedAddress[] = distinct.map((oaza) => {
      const group = matches.filter((m) => m.oaza_cho === oaza);
      const withChome = group.find((m) => m.chome_n === numbers[0]);
      const rec = withChome ?? group[0]!;
      return withChome
        ? buildParsed(partial, rec, numbers[0], numbers.slice(1), unparsed, postalCode)
        : buildParsed(partial, rec, undefined, numbers, unparsed, postalCode);
    });
    return {
      ok: false,
      reason: 'AMBIGUOUS',
      message:
        `"${name}" matches ${distinct.length} distinct towns in ` +
        `${prefRecord.pref}${cityPathName(record)}: ${distinct.join(', ')}. ` +
        `Provide a postal code, or choose one of the returned candidates.`,
      partial,
      candidates,
    };
  }

  // A single town name. The leading number is its chome only if such a chome
  // actually exists; otherwise the town is the chome-less entry and every
  // number is a block number.
  const chomeEntries = matches.filter((m) => m.chome_n !== undefined);
  const plainEntry = matches.find((m) => m.chome_n === undefined);

  let chome: number | undefined;
  let blockNumbers = numbers;
  let resolved = plainEntry ?? matches[0]!;

  if (chomeEntries.length > 0 && numbers.length > 0) {
    const hit = chomeEntries.find((m) => m.chome_n === numbers[0]);
    if (hit) {
      chome = numbers[0];
      blockNumbers = numbers.slice(1);
      resolved = hit;
    } else if (!plainEntry) {
      return fail(
        'TOWN_NOT_FOUND',
        `"${name}" exists in ${prefRecord.pref}${cityPathName(record)}, but has no chome ` +
          `${numbers[0]}. Known chome: ${chomeEntries.map((m) => m.chome_n).join(', ')}.`,
        { ...partial, level: 2 },
      );
    }
  }

  const parsed = buildParsed(partial, resolved, chome, blockNumbers, unparsed, postalCode);
  return { ok: true, value: { formatted: renderJapanese(parsed), parsed }, ...(unparsed ? { unparsed } : {}) };
}

function buildParsed(
  partial: Partial<ParsedAddress>,
  record: MachiAzaRecord,
  chome: number | undefined,
  blockNumbers: number[],
  unparsed: string | undefined,
  postalCode: string | undefined,
): ParsedAddress {
  return {
    ...(postalCode ? { postalCode } : {}),
    ...(partial.prefecture ? { prefecture: partial.prefecture } : {}),
    ...(partial.county ? { county: partial.county } : {}),
    ...(partial.city ? { city: partial.city } : {}),
    ...(partial.ward ? { ward: partial.ward } : {}),
    town: {
      ja: record.oaza_cho ?? '',
      ...(record.oaza_cho_k ? { kana: record.oaza_cho_k } : {}),
      ...(record.oaza_cho_r ? { romaji: record.oaza_cho_r } : {}),
    },
    ...(chome !== undefined ? { chome } : {}),
    blockNumbers,
    ...(unparsed ? { unparsed } : {}),
    level: 3,
  };
}

/** Split the input into a postal code and comma-separated segments. */
function tokenize(input: string): { postalCode?: string; segments: string[] } {
  let text = input.normalize('NFKC').trim();

  // Drop a trailing country name.
  text = text.replace(/[,\s]+(japan|nippon|nihon)\s*$/i, '');

  let postalCode: string | undefined;
  const postal = text.match(/〒?\s*(\d{3})\s*-\s*(\d{4})(?!\d)/);
  if (postal) {
    postalCode = `${postal[1]}-${postal[2]}`;
    text = text.replace(postal[0], ' ');
  }

  const segments = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return postalCode ? { postalCode, segments } : { segments };
}

/**
 * Match trailing segments against a municipality.
 *
 * Handles both `"Chuo-ku, Sapporo-shi"` (ward and city as separate segments)
 * and a single combined segment.
 */
function matchMunicipality(
  cities: CityRecord[],
  segments: string[],
): { record: CityRecord; consumed: number } | undefined {
  // Try two trailing segments first (ward + city, or city + county).
  for (const consumed of [2, 1]) {
    if (segments.length < consumed) continue;
    const tail = segments.slice(segments.length - consumed);
    for (const record of cities) {
      if (matchesMunicipality(record, tail)) return { record, consumed };
    }
  }
  return undefined;
}

function matchesMunicipality(record: CityRecord, tail: string[]): boolean {
  const cityKeys = candidateKeys(record.city, record.city_k, record.city_r);
  const wardKeys = record.ward
    ? candidateKeys(record.ward, record.ward_k, record.ward_r)
    : undefined;
  const countyKeys = record.county
    ? candidateKeys(record.county, record.county_k, record.county_r)
    : undefined;

  const keyOf = (s: string) => [normalizeRomajiKey(s), stemKey(s)];
  const hits = (keys: Set<string>, s: string) => keyOf(s).some((k) => k && keys.has(k));

  if (tail.length === 1) {
    const only = tail[0]!;
    // A designated city's ward cannot be identified from one segment: "Chuo-ku"
    // alone is ambiguous across Sapporo, Osaka, Kobe and others, so we require
    // the city segment too and let the two-segment branch handle it.
    if (record.ward) return false;
    return hits(cityKeys, only);
  }

  const [first, second] = tail as [string, string];
  if (record.ward && wardKeys) {
    // Western order puts the smaller unit first: "Chuo-ku, Sapporo-shi".
    if (hits(wardKeys, first) && hits(cityKeys, second)) return true;
  }
  if (record.county && countyKeys) {
    // "Izumozaki-machi, Santo-gun"
    if (hits(cityKeys, first) && hits(countyKeys, second)) return true;
  }
  return false;
}

/** Find towns whose romanization matches `name`. */
function matchTowns(towns: MachiAzaRecord[], name: string): MachiAzaRecord[] {
  const target = normalizeRomajiKey(name);
  const targetStem = stemKey(name);
  return towns.filter((t) => {
    if (!t.oaza_cho) return false;
    const keys = candidateKeys(t.oaza_cho, t.oaza_cho_k, t.oaza_cho_r);
    return keys.has(target) || (targetStem !== '' && keys.has(targetStem));
  });
}

/**
 * Separate leading/trailing numbers from the town name.
 *
 * `"3-5-12 Nishi-Shinjuku"` -> numbers [3,5,12], name "Nishi-Shinjuku"
 * `"Nishi-Shinjuku 3-5-12"` -> the same
 */
function splitNumbersAndName(input: string): {
  numbers: number[];
  name?: string;
  unparsed?: string;
} {
  const text = input.trim();

  const leading = text.match(/^(\d+(?:\s*-\s*\d+)*)\s+(.*)$/s);
  if (leading) {
    return {
      numbers: parseNumbers(leading[1]!),
      ...(leading[2]?.trim() ? { name: leading[2].trim() } : {}),
    };
  }

  const trailing = text.match(/^(.*?)\s+(\d+(?:\s*-\s*\d+)*)\s*$/s);
  if (trailing) {
    return {
      numbers: parseNumbers(trailing[2]!),
      ...(trailing[1]?.trim() ? { name: trailing[1].trim() } : {}),
    };
  }

  return { numbers: [], name: text };
}

function parseNumbers(input: string): number[] {
  return input
    .split('-')
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n));
}

/** Render a structured address as conventional Japanese text. */
export function renderJapanese(parsed: ParsedAddress): string {
  let out = '';
  out += parsed.prefecture?.ja ?? '';
  out += parsed.county?.ja ?? '';
  out += parsed.city?.ja ?? '';
  out += parsed.ward?.ja ?? '';
  out += parsed.town?.ja ?? '';
  if (parsed.chome !== undefined) out += `${numberToKanji(parsed.chome)}丁目`;
  if (parsed.blockNumbers.length > 0) out += parsed.blockNumbers.join('-');
  if (parsed.unparsed) out += ` ${parsed.unparsed}`;
  return out;
}
