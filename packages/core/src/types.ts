/**
 * Core types for jp-address-romaji.
 *
 * Design rule that drives every type in this file: the library never guesses.
 * A romanization is emitted only when it is backed by the address dataset
 * (an authoritative romaji field, or a kana reading we transliterate
 * deterministically). When that backing is absent, the API returns an explicit
 * failure instead of a plausible-looking string.
 */

/** Long-vowel notation for romanized output. */
export type LongVowelStyle =
  /** Passport Hepburn: long vowels are not marked at all (Satō -> Sato). */
  | 'none'
  /** Macron: Satō, Tōkyō. Requires a kana reading. */
  | 'macron'
  /** Circumflex: Satô, Tôkyô. Requires a kana reading. */
  | 'circumflex'
  /** Passport "OH" convention: long o becomes "oh" (Satoh, Ohno). Requires a kana reading. */
  | 'oh';

/** Component ordering of the rendered address. */
export type AddressOrder =
  /** Western order: block numbers, town, city, prefecture, postal code. */
  | 'western'
  /** Japanese order romanized: prefecture, city, town, block numbers. */
  | 'japanese';

/**
 * A single address component.
 *
 * `romaji` and `kana` are optional on purpose: for roughly 15% of rural
 * `oaza`-style town names the source dataset carries neither, and the type
 * must make that absence visible rather than hide it behind a guess.
 */
export interface AddressComponent {
  /** Japanese (kanji/kana) form, as normalized by the address dataset. */
  ja: string;
  /** Katakana reading, when the dataset provides one. */
  kana?: string;
  /** Romanized form, when it can be derived from the dataset. */
  romaji?: string;
}

/**
 * Normalization level reported by @geolonia/normalize-japanese-addresses.
 *
 * - 0: nothing recognized
 * - 1: prefecture
 * - 2: city/ward
 * - 3: town (machi-aza), including chome
 * - 8: street-level (residential display or parcel number)
 */
export type NormalizationLevel = 0 | 1 | 2 | 3 | 8;

/**
 * A structured Japanese address.
 *
 * Note that `unparsed` is deliberately a plain string with no romaji sibling:
 * building names and room numbers are out of scope and are never translated or
 * romanized. They are carried through verbatim.
 */
export interface ParsedAddress {
  /** Postal code in `NNN-NNNN` form, when present in the input. */
  postalCode?: string;
  prefecture?: AddressComponent;
  /**
   * County (`郡`), present only for towns and villages that sit inside one.
   * Kept separate because the dataset models it separately.
   */
  county?: AddressComponent;
  /** Municipality: `市` / `町` / `村`, or a Tokyo special ward (`区`). */
  city?: AddressComponent;
  /** Ward (`区`) of a designated city, e.g. `中央区` of `札幌市`. */
  ward?: AddressComponent;
  /** Town (machi-aza) without the chome suffix. */
  town?: AddressComponent;
  /**
   * Kyoto street phrase (`烏丸通四条上ル`), when the address uses one.
   *
   * Navigational rather than administrative: the official address is the town
   * plus its number, so this is preserved verbatim but not rendered into the
   * romanized string. It has no romaji form because the dataset carries no
   * readings for street names.
   */
  kyotoStreet?: string;
  /** Chome number, when the town carries one. `西新宿三丁目` -> 3. */
  chome?: number;
  /**
   * Block/house numbers following the town, outermost first.
   * `5番12号` -> [5, 12]. The chome is NOT included here; see `chome`.
   */
  blockNumbers: number[];
  /**
   * Building name, room number, and anything else the normalizer could not
   * attribute to an administrative component.
   *
   * Out of scope by design: never romanized, never translated.
   */
  unparsed?: string;
  /** How far the address could be resolved. */
  level: NormalizationLevel;
}

/** Why a conversion could not be completed. */
export type FailureReason =
  /** The prefecture could not be identified. */
  | 'PREFECTURE_NOT_FOUND'
  /** The city/ward could not be identified. */
  | 'CITY_NOT_FOUND'
  /** The town could not be identified within the resolved city. */
  | 'TOWN_NOT_FOUND'
  /**
   * The town was identified but the dataset carries neither a romaji field nor
   * a kana reading for it. Common for rural `oaza`-style names.
   */
  | 'NO_ROMAJI_DATA'
  /**
   * The dataset's romaji field for this entry failed validation (for example a
   * value that collapsed to a bare number). We refuse to emit it.
   */
  | 'CORRUPT_ROMAJI_DATA'
  /**
   * The requested long-vowel style needs a kana reading, and none is available.
   */
  | 'KANA_REQUIRED_FOR_LONG_VOWELS'
  /** More than one Japanese address matches the romaji input. */
  | 'AMBIGUOUS'
  /** Kyoto-style street-name addresses are not supported in this version. */
  | 'KYOTO_STREET_ADDRESS'
  /** No address dataset has been configured. */
  | 'DATA_NOT_CONFIGURED'
  /** The input was empty or contained no recognizable address. */
  | 'EMPTY_INPUT';

/** A failed conversion, with whatever was resolved before the failure. */
export interface Failure {
  ok: false;
  reason: FailureReason;
  /** Human-readable explanation. Always English. */
  message: string;
  /** Components that were resolved before the failure, for diagnostics. */
  partial?: Partial<ParsedAddress>;
  /**
   * Candidate interpretations, populated when `reason` is `AMBIGUOUS`.
   * The caller decides; the library does not pick one.
   */
  candidates?: ParsedAddress[];
}

/** A successful conversion. */
export interface Success<T> {
  ok: true;
  value: T;
  /**
   * Building name / room number carried through from the input.
   * Present whenever the input had one; not romanized.
   */
  unparsed?: string;
}

/**
 * Result of a conversion. Failures are returned, not thrown, so that callers
 * are forced by the type system to handle the "cannot convert" case.
 */
export type Result<T> = Success<T> | Failure;

/** Options for {@link toRomaji}. */
export interface ToRomajiOptions {
  /** Long-vowel notation. Default: `'none'` (passport Hepburn). */
  longVowel?: LongVowelStyle;
  /** Component ordering. Default: `'western'`. */
  order?: AddressOrder;
  /** Append `, Japan`. Default: `true`. */
  includeCountry?: boolean;
  /** Where to place the postal code. Default: `'suffix'`. */
  postalCode?: 'suffix' | 'prefix' | 'omit';
  /** Letter casing of the output. Default: `'title'`. */
  capitalization?: 'title' | 'upper';
  /**
   * Append the building name / room number to the rendered string.
   * It is passed through verbatim (never romanized). Default: `true`.
   */
  includeUnparsed?: boolean;
}

/** A romanized address, both as a string and as its parts. */
export interface RomajiAddress {
  /** The fully rendered address string. */
  formatted: string;
  /** The structured address the string was rendered from. */
  parsed: ParsedAddress;
}
