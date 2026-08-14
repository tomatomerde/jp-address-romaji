/**
 * Regression test for a review finding: `dataAccess.ts`'s reverse-direction
 * cache (`fromRomaji`'s per-municipality file cache) was a plain `Map` with
 * no eviction, so a long-running process doing `fromRomaji` nationwide
 * would retain a parsed file for every municipality it had ever looked up,
 * forever — about 1,899 of them in the real dataset.
 *
 * Uses `setDataCacheLimit` (test-only, not exported from index.ts) to make
 * eviction observable with the small fixture dataset instead of requiring
 * hundreds of distinct municipality fixtures.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  clearDataCache,
  getDataCacheSize,
  loadMachiAza,
  loadPrefectures,
  setDataCacheLimit,
} from '../src/dataAccess.js';
import { useFixtureData } from './helpers.js';

// Distinct municipalities present in test/fixtures/data/ja/ — enough to
// exceed a small cache limit.
const MUNICIPALITIES: Array<[string, string]> = [
  ['京都府', '京都市中京区'],
  ['北海道', '旭川市'],
  ['北海道', '札幌市中央区'],
  ['新潟県', '三島郡出雲崎町'],
  ['東京都', '新宿区'],
  ['東京都', '渋谷区'],
  ['青森県', '青森市'],
];

describe('dataAccess: bounded reverse-direction cache', () => {
  beforeEach(() => {
    useFixtureData();
    setDataCacheLimit(3);
  });
  afterEach(() => {
    // Restore the production default so no other test in this file/worker
    // is affected.
    setDataCacheLimit(500);
    clearDataCache();
  });

  it('never grows past the configured limit', async () => {
    await loadPrefectures();
    for (const [pref, city] of MUNICIPALITIES) {
      const towns = await loadMachiAza(pref, city);
      expect(towns).toBeDefined();
      expect(getDataCacheSize()).toBeLessThanOrEqual(3);
    }
    // Exercised strictly more distinct files than the limit allows, so
    // eviction must actually have happened, not just "stayed under by
    // coincidence".
    expect(MUNICIPALITIES.length + 1).toBeGreaterThan(3);
    expect(getDataCacheSize()).toBe(3);
  });

  it('still returns correct data for a municipality evicted and then re-requested', async () => {
    await loadPrefectures();
    const first = await loadMachiAza('京都府', '京都市中京区');
    expect(first).toBeDefined();
    // Load enough others to evict the first one from a limit-3 cache.
    for (const [pref, city] of MUNICIPALITIES.slice(1)) {
      await loadMachiAza(pref, city);
    }
    // Re-request the evicted municipality: must re-read from disk and
    // return the same data, not a stale or missing result.
    const again = await loadMachiAza('京都府', '京都市中京区');
    expect(again).toEqual(first);
  });
});
