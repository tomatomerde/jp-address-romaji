/**
 * Regression test for issue #58: a municipality whose town file the dataset
 * does not carry made `toRomaji` **throw**, while `fromRomaji` answered the
 * same situation with a typed `DATA_NOT_CONFIGURED`.
 *
 * The two directions reach the dataset through different code. `fromRomaji`
 * goes through this package's own `dataAccess.ts`, which checks
 * `response.ok`/catches a failed read and degrades to "no data available".
 * `toRomaji` delegates normalization to
 * `@geolonia/normalize-japanese-addresses`, which fetches the town file itself
 * and passes the response straight to `JSON.parse`; `normalizeJapanese` did
 * not catch that, so the error propagated out of a function whose whole
 * contract is that failures come back as values.
 *
 * This is not an exotic state. `README.md` tells callers they may publish only
 * the municipalities they care about, and the project's own demo does exactly
 * that — so a caller following the documentation hits it with the first
 * address outside the slice they host.
 *
 * ## What must NOT happen instead
 *
 * `TOWN_NOT_FOUND`. With no town file the normalization stops at level 2,
 * which is indistinguishable from "the town is not in this municipality" if
 * you only look at `level`. Answering that would be a confident wrong answer
 * about a town that exists — the exact failure mode this library is built to
 * refuse — so the assertions below pin the reason, not merely `ok === false`.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { configureDataSource } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { toRomaji } from '../src/toRomaji.js';
import { useFixtureData } from './helpers.js';

/** `../fixtures/data` with `ja/東京都/渋谷区.json` removed. See its README. */
const MISSING_TOWN_FILE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-missing-town-file',
  'data',
);

/** In the fixture index but not on disk / not served. */
const UNSERVED_JA = '東京都渋谷区神南一丁目1-1';
const UNSERVED_ROMAJI = '1-1 Jinnan, Shibuya-ku, Tokyo';
/** Present in both fixtures, so the same setup must still convert it. */
const SERVED_JA = '東京都新宿区西新宿三丁目5番12号';
const SERVED_ROMAJI = '3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan';

describe('a municipality whose town file is missing from a dataDir', () => {
  afterEach(() => useFixtureData());

  function useMissingTownFileData(): void {
    clearDataCache();
    configureDataSource({ dataDir: MISSING_TOWN_FILE_DATA_DIR });
  }

  it('returns a typed failure from toRomaji instead of throwing', async () => {
    useMissingTownFileData();
    const result = await toRomaji(UNSERVED_JA);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('DATA_NOT_CONFIGURED');
    // Not TOWN_NOT_FOUND: 神南 is a real town of 渋谷区, and saying otherwise
    // would be the library guessing.
    expect(result.message).toContain('東京都渋谷区');
  });

  it('names the municipality in `partial`, so the caller knows which file to publish', async () => {
    useMissingTownFileData();
    const result = await toRomaji(UNSERVED_JA);
    if (result.ok) throw new Error('expected a failure');
    expect(result.partial?.prefecture?.ja).toBe('東京都');
    expect(result.partial?.city?.ja).toBe('渋谷区');
  });

  it('agrees with fromRomaji, which already handled this', async () => {
    useMissingTownFileData();
    const reverse = await fromRomaji(UNSERVED_ROMAJI);
    expect(reverse.ok).toBe(false);
    if (reverse.ok) return;
    expect(reverse.reason).toBe('DATA_NOT_CONFIGURED');
  });

  it('still converts a municipality the dataset does carry', async () => {
    useMissingTownFileData();
    // The half that a failure-only test would not prove: the fixture is not
    // simply broken, and the recovery path has not swallowed working reads.
    const result = await toRomaji(SERVED_JA);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe(SERVED_ROMAJI);
  });

  it('leaves the complete fixture unaffected', async () => {
    useFixtureData();
    const result = await toRomaji(UNSERVED_JA);
    // Same address, same code, dataset that has the file: it converts. If this
    // ever fails, the recovery above is firing when nothing went wrong.
    expect(result.ok).toBe(true);
  });
});
