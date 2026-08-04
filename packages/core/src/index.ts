/**
 * jp-address-romaji
 *
 * Bidirectional conversion between Japanese addresses and their romanized,
 * western-order equivalents.
 *
 * Addresses are personal data, so this library runs entirely on your machine.
 * It reads a local copy of the address dataset and, by default, makes no
 * network requests at all — nothing you convert leaves the process.
 *
 * Address normalization itself is delegated to
 * @geolonia/normalize-japanese-addresses; this package implements the layer
 * above it. Romanizations always come from the dataset (a romaji field, or a
 * kana reading transliterated deterministically). When neither is available
 * the API returns an explicit failure instead of a plausible guess.
 */

export { toRomaji, extractPostalCode } from './toRomaji.js';
export { fromRomaji, renderJapanese, type JapaneseAddress, type FromRomajiOptions } from './fromRomaji.js';
export { parse, detectScript, containsJapanese, type AddressScript } from './parse.js';
export {
  toFormat,
  type FormatTarget,
  type FormatMap,
  type GoogleI18nAddress,
  type ShopifyAddress,
  type StripeAddress,
} from './formats/index.js';

export {
  configureDataSource,
  isDataConfigured,
  type DataSourceOptions,
} from './normalizer.js';

export { clearDataCache } from './dataAccess.js';

export { kanaToRomaji, toKatakana } from './romaji/hepburn.js';
export { numberToKanji, kanjiToNumber } from './kanjiNumbers.js';
export { isKyotoStreetAddress, splitKyotoStreet, type KyotoSplit } from './kyoto.js';
export { PREFECTURES, findPrefectureByJa, findPrefectureByRomaji } from './data/prefectures.js';

export type {
  AddressComponent,
  AddressOrder,
  Failure,
  FailureReason,
  LongVowelStyle,
  NormalizationLevel,
  ParsedAddress,
  Result,
  RomajiAddress,
  Success,
  ToRomajiOptions,
} from './types.js';
