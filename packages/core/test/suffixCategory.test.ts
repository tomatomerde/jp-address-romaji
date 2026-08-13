/**
 * Regression tests for `matchesMunicipality`/`segmentQuality` accepting a
 * stem match built from a query suffix that names the WRONG KIND of
 * administrative unit.
 *
 * `stemKey()` strips any of `shi/ku/cho/chou/machi/mura/son/gun/city/ward`
 * off a query token without knowing which kind of record it will end up
 * compared against. Before this fix, that let a village-style `-mura`
 * suffix stem-match a 区 (ward) record whose own stem happened to coincide,
 * and let a county-style `-gun` suffix resolve straight into a ward with no
 * ambiguity check at all — the same class of bug `matchTowns`'s "Uguisudani"
 * comment documents for query-side town-name stemming, but at the
 * municipality level.
 *
 * The fix (`SUFFIX_TOKEN_KANJI` in fromRomaji.ts) requires the suffix
 * stripped off the query to name the same KIND of unit (市/区/町/村/郡) as
 * the record's own suffix kanji, while still allowing any reading within
 * that kind (a 町 can genuinely be "-cho" or "-machi") — see
 * fromRomaji.test.ts's Izumozaki-machi case and
 * municipalityAmbiguity.test.ts's Fuchu-cho/Fuchu-shi case for that
 * leniency and the existing exact-vs-stem tiebreaker staying intact.
 *
 * Uses a dedicated fixture dataset (see fixtures-suffix-category/README.md)
 * rather than the general `fixtures/data`, which is deliberately sparse
 * v1-derived data whose coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useSuffixCategoryFixtureData } from './helpers.js';

beforeAll(() => useSuffixCategoryFixtureData());

describe('fromRomaji: a stem match requires the query suffix to name the right KIND of unit', () => {
  it('resolves "Nakamura" to 中村区 rather than reporting it AMBIGUOUS with 中区', async () => {
    // "Nakamura" stems (village-style "-mura") to "naka", which coincides
    // with 中区's own stem ("Naka-ku" stemmed of its city-style "-ku"). Only
    // 中村区 (whose OWN reading is "Nakamura-ku") is a genuine match; 中区
    // must not be dragged in as a second candidate just because the query's
    // wrong-kind suffix happened to stem the same way.
    const result = await fromRomaji('Nakamura, Nagoya-shi, Aichi');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('名古屋市');
    expect(result.partial?.ward?.ja).toBe('中村区');
  });

  it('does not let a county-style "-gun" suffix resolve into a ward', async () => {
    // Before the fix this silently resolved to 名古屋市中区 — writing 区 as
    // if it were 郡 was accepted outright, with no AMBIGUOUS check at all.
    // No ward or city genuinely reads as "-gun", so this must refuse.
    const result = await fromRomaji('Naka-gun, Nagoya-shi, Aichi');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CITY_NOT_FOUND');
  });

  it('still resolves the correct, exact reading for 中区', async () => {
    const result = await fromRomaji('Naka-ku, Nagoya-shi, Aichi');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.ward?.ja).toBe('中区');
  });

  it('still resolves the correct, exact reading for 中村区', async () => {
    const result = await fromRomaji('Nakamura-ku, Nagoya-shi, Aichi');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.ward?.ja).toBe('中村区');
  });
});
