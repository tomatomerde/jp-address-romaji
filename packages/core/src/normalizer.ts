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

import { config, normalize as geoloniaNormalize } from '@geolonia/normalize-japanese-addresses';
import type { NormalizeResult } from '@geolonia/normalize-japanese-addresses';

import { getPlatform } from './platform/current.js';

/** How the address dataset is reached. */
export interface DataSourceOptions {
  /**
   * Directory containing the address data (the parent of `ja.json` and `ja/`).
   * Everything stays on this machine.
   *
   * Node only. A browser has no filesystem to read it from, so this option
   * leaves the library unconfigured there and conversions fail with
   * `DATA_NOT_CONFIGURED` — use `endpoint` instead.
   */
  dataDir?: string;
  /**
   * Explicit endpoint, for advanced setups such as a private mirror — and the
   * only way to supply data in a browser.
   *
   * The dataset is read as `<endpoint>.json` (the prefecture/municipality
   * index) and `<endpoint>/<prefecture>/<municipality>.json`, so an endpoint
   * ends at `ja`.
   *
   * Setting this to an `http(s)` URL means the prefecture and municipality of
   * every address you convert appear in a request URL sent to that host. The
   * rest of the address — block numbers, building name, addressee — does not.
   * Only do this if you control the host.
   */
  endpoint?: string;
  /** Size of the upstream in-memory cache. Defaults to 1000 entries. */
  cacheSize?: number;
}

let configured = false;

/**
 * Point the library at an address dataset.
 *
 * Call once at startup. If `jp-address-romaji-data` is installed, this is
 * done automatically on first use and you do not need to call it.
 *
 * In a browser only `endpoint` can be honoured — see {@link DataSourceOptions}.
 */
export function configureDataSource(options: DataSourceOptions = {}): void {
  if (options.endpoint) {
    // Validate before storing: config.japaneseAddressesApi is read by both
    // directions (this module's own dataAccess.ts for fromRomaji, and the
    // upstream normalizer for toRomaji), and both concatenate it with a
    // suffix and pass it to `new URL(...)`. A malformed value here — most
    // often a filesystem path passed where a URL was expected, e.g.
    // `{ endpoint: './address-data/ja' }` meant for `dataDir` — must not
    // become an uncaught TypeError three calls later inside a conversion.
    // An `http(s)` (or `file:`) endpoint, including one with a path and no
    // scheme-relative shortcuts, still parses fine and keeps working
    // unchanged; only a non-URL string is rejected here.
    try {
      new URL(options.endpoint);
    } catch {
      configured = false;
      return;
    }
    config.japaneseAddressesApi = options.endpoint;
  } else {
    const platform = getPlatform();
    const dir = options.dataDir ?? platform.resolveBundledDataDir();
    // `dataDirToEndpoint` is `undefined` in a browser, where a local directory
    // cannot be read at all. Leaving the library unconfigured is the honest
    // outcome: the caller gets DATA_NOT_CONFIGURED instead of a dataset
    // fetched from somewhere they did not name.
    const endpoint = dir === undefined ? undefined : platform.dataDirToEndpoint(dir);
    if (endpoint === undefined) {
      configured = false;
      return;
    }
    config.japaneseAddressesApi = endpoint;
  }
  if (options.cacheSize !== undefined) config.cacheSize = options.cacheSize;
  configured = true;
}

/** Has a dataset been configured (explicitly or via the bundled package)? */
export function isDataConfigured(): boolean {
  if (configured) return true;
  const dir = getPlatform().resolveBundledDataDir();
  if (dir) {
    configureDataSource({ dataDir: dir });
    // Report what configureDataSource actually decided rather than assuming it
    // succeeded: it declines a directory it cannot turn into an endpoint, and
    // answering `true` there would promise data that is not reachable.
    return configured;
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
/**
 * Did the caller's own text name this koaza, right after the town?
 *
 * Position matters, not mere presence. Koaza names are often a single common
 * character once the `字`/`大字` prefix is stripped, and a plain `includes`
 * then fires on anything: `字町` matched the 町 of 川崎町 in
 * `宮城県柴田郡川崎町大字小野1-1`. Anchoring on the town keeps the question
 * to "does the address continue with this koaza", which is what decides
 * whether dropping it would lose something the caller wrote.
 *
 * If the town itself is not found in the input — the caller spelled it some
 * way the dataset does not — this answers false and the koaza is left off,
 * which is the conservative direction: the output then says only what the
 * input said.
 */
function inputNamesKoaza(input: string, machiAza: { oaza_cho?: string; koaza?: string }): boolean {
  const { oaza_cho: town, koaza } = machiAza;
  if (!town || !koaza) return false;
  const nfkc = (s: string) => s.normalize('NFKC');
  const strip = (s: string) => s.replace(/^(?:大字|字)/, '');
  const needle = strip(nfkc(koaza));
  if (needle.length === 0) return false;
  const haystack = nfkc(input);
  const at = haystack.indexOf(nfkc(town));
  if (at < 0) return false;
  return strip(haystack.slice(at + nfkc(town).length)).startsWith(needle);
}

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
  /**
   * Named small-area subdivision (`小字`/koaza) inside the town, when the
   * matched record has one that is NOT already handled by
   * {@link recoverKoazaNumber} above (a bare number + suffix, folded into the
   * leading digit of `rest` instead — see that function's own comment). This
   * is surfaced unconditionally otherwise; it is `toRomaji.ts`'s job, not
   * this module's, to decide whether the reading is complete enough to
   * romanize (see `romaji/validate.ts`'s `isKoazaReadingComplete`) — this
   * module only reports what the dataset carries.
   */
  koaza?: { ja: string; kana?: string; romaji?: string };
  chome?: number;
  /** Remaining text after the town: block numbers plus anything unparsed. */
  rest: string;
  level: 0 | 1 | 2 | 3 | 8;
  raw: NormalizeResult;
  /**
   * Set when the municipality's town file could not be read at all, as opposed
   * to being read and not containing the address.
   *
   * The two look identical from `level` alone — both stop at 2 — but they are
   * different answers: "this town is not in the dataset" versus "this part of
   * the dataset was not available". Reporting the first when the second
   * happened is the kind of confident wrong answer this library exists to
   * avoid, so the distinction is carried out of here rather than inferred.
   *
   * `reason` is the underlying error's message, kept verbatim. This module
   * does not know *why* the read failed — a 404 from a partially published
   * endpoint is the expected case (see `DataSourceOptions.endpoint`), but a
   * malformed file or a transient server error land here too, and claiming
   * one of them would be a guess.
   */
  townDataUnavailable?: { reason: string };
}

/** The upstream normalization level that stops at the municipality. */
const MUNICIPALITY_LEVEL = 2;

/**
 * Normalize a Japanese address and surface the dataset's readings.
 *
 * Returns a value in every case, including when the dataset cannot be read.
 * The upstream normalizer fetches the municipality's town file itself and
 * hands the response to `JSON.parse` without checking the status, so an
 * endpoint that does not carry that municipality makes it throw — and serving
 * only some municipalities is a configuration this package documents and
 * recommends (see `DataSourceOptions.endpoint`), which makes that a normal
 * outcome rather than an exceptional one. Letting it propagate would break the
 * one promise the whole API is shaped around: failures come back as values.
 *
 * The recovery re-runs the normalizer at municipality level, which reads only
 * the prefecture index — already fetched and cached by the attempt that just
 * failed, so this costs no additional request — and is what lets the caller
 * name the municipality whose data is missing.
 */
export async function normalizeJapanese(input: string): Promise<NormalizedAddress> {
  try {
    return buildNormalized(input, await geoloniaNormalize(input));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      const shallow = await geoloniaNormalize(input, { level: MUNICIPALITY_LEVEL });
      return { ...buildNormalized(input, shallow), townDataUnavailable: { reason } };
    } catch {
      // Even the index could not be read. Nothing about the address was
      // resolved, so nothing about it is reported.
      return {
        rest: '',
        level: 0,
        raw: { other: input, level: 0, metadata: { input } },
        townDataUnavailable: { reason },
      };
    }
  }
}

function buildNormalized(input: string, result: NormalizeResult): NormalizedAddress {
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

  // A koaza that `recoverKoazaNumber` already consumed (folded into
  // `rest`/`recoveredKoazaNumber` above) is fully represented there — do not
  // ALSO surface it here, or its digit would appear twice. Every other koaza
  // (named, like `三丁目大横`, or numbered-but-unrecoverable because a chome
  // is also present) is reported so the caller can decide what to do with it,
  // instead of it silently disappearing the way it used to.
  // ...and only when the CALLER's text named it. The upstream normalizer
  // resolves to one specific machi-aza row, and for a town whose rows all
  // carry a koaza it picks one regardless of what the input said. Surfacing
  // that unconditionally put a koaza the caller never wrote into the output:
  // `宮城県柴田郡川崎町大字小野1-1` came back as "1-1 Azamachi Ono", and the
  // same invented `字町` landed on four other unrelated towns in a 300-address
  // sample (8 of 300 gained a koaza this way). Printing a place name nobody
  // asked for is worse than the silent dropping this feature was built to fix.
  if (machiAza?.koaza && recoveredKoazaNumber === undefined && inputNamesKoaza(input, machiAza)) {
    out.koaza = {
      ja: machiAza.koaza,
      kana: machiAza.koaza_k,
      romaji: machiAza.koaza_r,
    };
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
