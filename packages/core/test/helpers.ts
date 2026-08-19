import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureDataSource } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';

/** Directory holding the fixture dataset, in the same layout as the real one. */
export const FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'data',
);

/** Point the library at the fixture dataset. */
export function useFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: FIXTURE_DATA_DIR });
}

/**
 * A second, separate fixture dataset holding real municipality-name
 * collisions (府中市/府中町, 江差町/枝幸町, 四万十市/四万十町). Kept apart
 * from `FIXTURE_DATA_DIR` because that one is deliberately sparse v1-derived
 * data used to exercise refusal paths, and its coverage is not meant to be
 * "fixed" by adding records to it. See fixtures-municipality-ambiguity/README.md.
 */
export const MUNICIPALITY_AMBIGUITY_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-municipality-ambiguity',
  'data',
);

/** Point the library at the municipality-collision fixture dataset. */
export function useMunicipalityAmbiguityFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: MUNICIPALITY_AMBIGUITY_FIXTURE_DATA_DIR });
}

/**
 * A third, separate fixture dataset holding a real town (岩手県盛岡市浅岸) that
 * has both a chome-less row and chome rows. Kept apart from `FIXTURE_DATA_DIR`
 * for the same reason as the municipality-ambiguity fixture above — see
 * fixtures-chome-ambiguity/README.md.
 */
export const CHOME_AMBIGUITY_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-chome-ambiguity',
  'data',
);

/** Point the library at the chome/chome-less collision fixture dataset. */
export function useChomeAmbiguityFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: CHOME_AMBIGUITY_FIXTURE_DATA_DIR });
}

/**
 * A fifth, separate fixture dataset holding two real towns (岩手県遠野市青笹町
 * 青笹 and 福井県大飯郡おおい町名田庄挙原) whose koaza rows are themselves
 * numbered (`N地割`, `N号`). See fixtures-koaza-number-ambiguity/README.md.
 */
export const KOAZA_NUMBER_AMBIGUITY_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-koaza-number-ambiguity',
  'data',
);

/** Point the library at the numbered-koaza fixture dataset. */
export function useKoazaNumberAmbiguityFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: KOAZA_NUMBER_AMBIGUITY_FIXTURE_DATA_DIR });
}

/**
 * A sixth, separate fixture dataset holding the one real municipality
 * (北海道上川郡東神楽町) where accepting digits in a kana reading creates a
 * new romanized-key collision: `ひじり野南一条` (romaji field) and
 * `ひじりの南一条` (kana only) index the same key. See
 * fixtures-kana-digit-collision/README.md.
 */
export const KANA_DIGIT_COLLISION_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-kana-digit-collision',
  'data',
);

/** Point the library at the kana-digit collision fixture dataset. */
export function useKanaDigitCollisionFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: KANA_DIGIT_COLLISION_FIXTURE_DATA_DIR });
}

/**
 * A seventh, separate fixture dataset holding two real wards of 名古屋市
 * (中村区/`Nakamura-ku` and 中区/`Naka-ku`) whose stems collide once a query
 * suffix names the wrong KIND of administrative unit. See
 * fixtures-suffix-category/README.md.
 */
export const SUFFIX_CATEGORY_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-suffix-category',
  'data',
);

/** Point the library at the suffix-category fixture dataset. */
export function useSuffixCategoryFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: SUFFIX_CATEGORY_FIXTURE_DATA_DIR });
}

/**
 * An eighth, separate fixture dataset holding one real municipality
 * (北海道石狩郡当別町) whose administrative-suffix kana reading (町 read
 * チョウ, i.e. "cho") itself contains a long vowel. See
 * fixtures-longvowel-oh/README.md.
 */
export const LONGVOWEL_OH_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-longvowel-oh',
  'data',
);

/** Point the library at the longVowel:'oh' municipality-suffix fixture dataset. */
export function useLongVowelOhFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: LONGVOWEL_OH_FIXTURE_DATA_DIR });
}

/**
 * A ninth, separate fixture dataset holding one real town (青森県青森市
 * 大字駒込) that has a kana reading but no romaji field — about 10% of towns
 * in the shipped dataset. See fixtures-kana-only-town/README.md.
 */
export const KANA_ONLY_TOWN_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-kana-only-town',
  'data',
);

/** Point the library at the kana-only-town fixture dataset. */
export function useKanaOnlyTownFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: KANA_ONLY_TOWN_FIXTURE_DATA_DIR });
}

/**
 * A tenth, separate fixture dataset holding one real town (秋田県横手市
 * 前郷一番町) whose kana reading spells a number as a digit while its romaji
 * field spells the same number as a word. See
 * fixtures-digit-word-mismatch/README.md.
 */
export const DIGIT_WORD_MISMATCH_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-digit-word-mismatch',
  'data',
);

/** Point the library at the digit/word-mismatch fixture dataset. */
export function useDigitWordMismatchFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: DIGIT_WORD_MISMATCH_FIXTURE_DATA_DIR });
}

/**
 * An eleventh, separate fixture dataset holding a named-koaza (小字)
 * reproduction of the exact reported bug (長野県飯田市本町三丁目大横, the
 * koaza sitting inside 本町) plus real evidence of a koaza reading that
 * stops short of a trailing directional kanji (北海道札幌市白石区南郷通's
 * `一丁目北`/`十二丁目南`, from `scripts/verify-data-assumptions.ts`
 * assumption 6). See fixtures-koaza/README.md.
 */
export const KOAZA_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-koaza',
  'data',
);

/** Point the library at the named-koaza fixture dataset. */
export function useKoazaFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: KOAZA_FIXTURE_DATA_DIR });
}

/**
 * A twelfth, separate fixture dataset holding two real municipalities where
 * the upstream normalizer matches only a PREFIX of the town the caller wrote
 * (東京都新宿区's 中井/中町 and 北海道札幌市中央区's 宮の森/宮の森一条). See
 * fixtures-town-prefix-leftover/README.md.
 */
export const TOWN_PREFIX_LEFTOVER_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-town-prefix-leftover',
  'data',
);

/** Point the library at the town-prefix-leftover fixture dataset. */
export function useTownPrefixLeftoverFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: TOWN_PREFIX_LEFTOVER_FIXTURE_DATA_DIR });
}

/**
 * Run `fn` with `fetch` replaced by a stub that throws.
 *
 * Any network access — by our code or by the upstream normalizer — fails the
 * test loudly instead of silently succeeding against a remote API.
 */
export async function withNetworkBlocked<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    attempts.push(url);
    throw new Error(`Network access attempted: ${url}`);
  }) as typeof fetch;
  try {
    const result = await fn();
    if (attempts.length > 0) {
      throw new Error(`Network was accessed: ${attempts.join(', ')}`);
    }
    return result;
  } finally {
    globalThis.fetch = original;
  }
}
