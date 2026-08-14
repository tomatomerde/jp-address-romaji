/**
 * Thin wrapper over @geolonia/normalize-japanese-addresses.
 *
 * We do not reimplement address normalization. That library already handles
 * full-width digits, kanji numerals, `丁目/番/号` vs hyphen notation, missing
 * prefectures and character variants, and it is the sole source of the kana
 * and romaji readings we rely on.
 *
 * What this module adds is the privacy guarantee: the upstream library
 * defaults to a hosted HTTP endpoint, and we never use it implicitly. The
 * endpoint is pointed at a local `file://` directory, and if no local data is
 * configured we fail with DATA_NOT_CONFIGURED rather than quietly sending an
 * address to a third party.
 */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

import { config, normalize as geoloniaNormalize } from '@geolonia/normalize-japanese-addresses';
import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses';

/** How the address dataset is reached. */
export interface DataSourceOptions {
  /**
   * Directory containing the address data (the parent of `ja.json` and `ja/`).
   * Everything stays on this machine.
   */
  dataDir?: string;
  /**
   * Explicit endpoint, for advanced setups such as a private mirror.
   *
   * Setting this to an `http(s)` URL means every address you convert is sent
   * to that host. Only do this if you control it.
   */
  endpoint?: string;
  /** Size of the upstream in-memory cache. Defaults to 1000 entries. */
  cacheSize?: number;
}

let configured = false;

/** Resolve the optional companion data package, if it is installed. */
function resolveBundledDataDir(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    // The data package exposes its directory through its package.json.
    const pkgPath = require.resolve('jp-address-romaji-data/package.json');
    const dir = path.join(path.dirname(pkgPath), 'data');
    return fs.existsSync(path.join(dir, 'ja.json')) ? dir : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Point the library at an address dataset.
 *
 * Call once at startup. If `jp-address-romaji-data` is installed, this is
 * done automatically on first use and you do not need to call it.
 */
export function configureDataSource(options: DataSourceOptions = {}): void {
  if (options.endpoint) {
    config.japaneseAddressesApi = options.endpoint;
  } else {
    const dir = options.dataDir ?? resolveBundledDataDir();
    if (!dir) {
      configured = false;
      return;
    }
    // The upstream library concatenates `${api}${input}`, where input is
    // ".json" or "/<pref>/<city>.json" — so the endpoint ends at "ja".
    config.japaneseAddressesApi = pathToFileURL(path.join(dir, 'ja')).toString();
  }
  if (options.cacheSize !== undefined) config.cacheSize = options.cacheSize;
  configured = true;
}

/** Has a dataset been configured (explicitly or via the bundled package)? */
export function isDataConfigured(): boolean {
  if (configured) return true;
  const dir = resolveBundledDataDir();
  if (dir) {
    configureDataSource({ dataDir: dir });
    return true;
  }
  return false;
}

/**
 * Suffixes the upstream normalizer treats as a "numbered" koaza (small-area)
 * name — the same list it matches internally when deciding whether a leading
 * digit run in the input is a koaza number rather than a plain block number.
 * `地割` ("chiwari", a land-lot numbering used in rural Iwate towns) and `号`
 * ("gou") are the ones seen in the shipped dataset; the rest come from the
 * same upstream pattern and are kept for parity, on towns that don't have a
 * `chome`.
 */
export const NUMBERED_KOAZA = /^([0-9]+)(丁目|番町|番丁|条|軒|線|の町|ノ町|地割|号)$/;

/**
 * A koaza row whose name is just a number plus one of the suffixes above
 * consumes the leading digit of a hyphenated input (`2-3` -> koaza `２地割`
 * + block `3`) even though the town has no `chome`. Unlike chome, this
 * package has nowhere to put that number — there is no separate "koaza"
 * output field, and we do not invent a romanization for the koaza name
 * itself (no `koaza_r` in most of these rows; guessing one is exactly what
 * this library refuses to do). Recovering the digit here, as the new first
 * block number, keeps it from silently vanishing: `2-3` still comes out as
 * `2-3`, matching what the `番`/`号` notation of the same address already
 * produces (see toRomaji.test.ts and the real-world examples in
 * fixtures-koaza-number-ambiguity/README.md).
 */
function recoverKoazaNumber(koaza: string | undefined, chomeN: number | undefined): string | undefined {
  if (!koaza || chomeN !== undefined) return undefined;
  const match = koaza.normalize('NFKC').match(NUMBERED_KOAZA);
  return match?.[1];
}

/** Structured view of a normalization result, with readings attached. */
export interface NormalizedAddress {
  pref?: { ja: string; kana?: string; romaji?: string };
  county?: { ja: string; kana?: string; romaji?: string };
  city?: { ja: string; kana?: string; romaji?: string };
  ward?: { ja: string; kana?: string; romaji?: string };
  town?: { ja: string; kana?: string; romaji?: string };
  chome?: number;
  /** Remaining text after the town: block numbers plus anything unparsed. */
  rest: string;
  level: 0 | 1 | 2 | 3 | 8;
  raw: NormalizeResult;
}

/**
 * Normalize a Japanese address and surface the dataset's readings.
 *
 * Throws only if the underlying library throws; a missing town is reported
 * through `level`, not an exception.
 */
export async function normalizeJapanese(input: string): Promise<NormalizedAddress> {
  const result = await geoloniaNormalize(input);
  const meta = result.metadata ?? {};
  const machiAza = meta.machiAza;
  const cityMeta = meta.city;

  let rest = [result.addr, result.other].filter(Boolean).join(' ').trim();
  const recoveredKoazaNumber = recoverKoazaNumber(machiAza?.koaza, machiAza?.chome_n);
  if (recoveredKoazaNumber !== undefined) {
    // Re-attach with a hyphen so splitBlockNumbers (toRomaji.ts) parses it as
    // an additional leading block number, exactly as if the koaza number had
    // never been split off.
    rest = rest ? `${recoveredKoazaNumber}-${rest}` : recoveredKoazaNumber;
  }

  const out: NormalizedAddress = {
    rest,
    level: result.level as NormalizedAddress['level'],
    raw: result,
  };

  if (result.pref) {
    out.pref = {
      ja: result.pref,
      kana: meta.prefecture?.pref_k,
      romaji: meta.prefecture?.pref_r,
    };
  }
  if (cityMeta?.county) {
    out.county = { ja: cityMeta.county, kana: cityMeta.county_k, romaji: cityMeta.county_r };
  }
  if (cityMeta?.city) {
    out.city = { ja: cityMeta.city, kana: cityMeta.city_k, romaji: cityMeta.city_r };
  } else if (result.city) {
    // Fall back to the flat string when structured city metadata is absent.
    out.city = { ja: result.city };
  }
  if (cityMeta?.ward) {
    out.ward = { ja: cityMeta.ward, kana: cityMeta.ward_k, romaji: cityMeta.ward_r };
  }
  if (machiAza?.oaza_cho) {
    out.town = {
      ja: machiAza.oaza_cho,
      kana: machiAza.oaza_cho_k,
      romaji: machiAza.oaza_cho_r,
    };
    if (machiAza.chome_n !== undefined) out.chome = machiAza.chome_n;
  } else if (result.town) {
    out.town = { ja: result.town };
  }

  return out;
}

/**
 * Split the trailing text into block numbers and an unparsed remainder.
 *
 * `"2-3 サンプルビル301"` -> `{ blockNumbers: [2, 3], unparsed: "サンプルビル301" }`
 *
 * Anything that is not a leading run of hyphen-separated numbers is treated as
 * a building name and preserved verbatim. It is never romanized.
 */
export function splitBlockNumbers(rest: string): { blockNumbers: number[]; unparsed?: string } {
  const trimmed = rest.trim();
  if (!trimmed) return { blockNumbers: [] };

  const match = trimmed.match(/^(\d+(?:\s*[-‐‑−ー－]\s*\d+)*)\s*(.*)$/s);
  if (!match) return { blockNumbers: [], unparsed: trimmed };

  const numbers = match[1]!
    .split(/[-‐‑−ー－]/)
    .map((n) => Number.parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n));
  const remainder = (match[2] ?? '').trim();

  return remainder ? { blockNumbers: numbers, unparsed: remainder } : { blockNumbers: numbers };
}
