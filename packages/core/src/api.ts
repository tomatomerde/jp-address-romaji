/**
 * The public API of jp-address-romaji, shared by both entry points.
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
 *
 * This module holds no platform bindings of its own: it is re-exported
 * verbatim by `index.ts` (Node) and `index.browser.ts` (the `browser` export
 * condition), which differ only in which `platform/` implementation they
 * install. Keeping one list of exports is the point — the two runtimes expose
 * exactly the same API, so anything added here reaches both.
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
