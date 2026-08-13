/**
 * Regression tests for a municipality-level ambiguity bug present in the
 * published `jp-address-romaji@0.1.2`: `matchMunicipality` stemmed the QUERY
 * segment (not just the dataset's own reading) before matching, so a
 * municipality name with an administrative suffix could collide with an
 * unrelated municipality that merely shares the same stem once the suffix is
 * stripped from both sides — e.g. "Fuchu-cho" (広島県安芸郡府中町) resolving
 * to 広島県府中市 ("Fuchu-shi") instead, because both stem to "fuchu". On top
 * of that, the first matching record in the dataset was accepted outright,
 * with no AMBIGUOUS check at the municipality level at all (unlike the town
 * level, which already returns AMBIGUOUS with candidates for exactly this
 * kind of collision).
 *
 * Uses a dedicated fixture dataset (see
 * fixtures-municipality-ambiguity/README.md) rather than the general
 * `fixtures/data`, which is deliberately sparse v1-derived data whose
 * coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useMunicipalityAmbiguityFixtureData } from './helpers.js';

beforeAll(() => useMunicipalityAmbiguityFixtureData());

describe('fromRomaji: municipality name collisions', () => {
  it('prefers the exact reading over one that only matches after stemming (Fuchu-cho vs Fuchu-shi)', async () => {
    // Fuchu-cho, only stemmed, collides with 府中市 (Fuchu-shi -> stem "fuchu"),
    // but "Fuchu-cho" is 府中町's own actual reading. The exact match must win.
    const result = await fromRomaji('Fuchu-cho, Hiroshima');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('府中町');
    expect(result.partial?.county?.ja).toBe('安芸郡');
  });

  it('still resolves the county-qualified form correctly', async () => {
    const result = await fromRomaji('Fuchu-cho, Aki-gun, Hiroshima');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('府中町');
    expect(result.partial?.county?.ja).toBe('安芸郡');
  });

  it('reports AMBIGUOUS when two municipalities genuinely share the same exact reading (Esashi-cho)', async () => {
    // 檜山郡江差町 and 枝幸郡枝幸町 both romanize to exactly "Esashi-cho" —
    // unlike the Fuchu case, there is no exact-vs-stem tiebreaker available,
    // so this must stay ambiguous rather than picking one.
    const result = await fromRomaji('Esashi-cho, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates?.map((c) => c.city?.ja).sort()).toEqual(['枝幸町', '江差町'].sort());
    expect(result.candidates?.every((c) => c.level === 2)).toBe(true);
  });

  it('resolves the Esashi-cho collision once the county disambiguates it', async () => {
    const viaHiyama = await fromRomaji('Esashi-cho, Hiyama-gun, Hokkaido');
    expect(viaHiyama.ok).toBe(false);
    if (!viaHiyama.ok) {
      expect(viaHiyama.reason).toBe('TOWN_NOT_FOUND');
      expect(viaHiyama.partial?.city?.ja).toBe('江差町');
    }

    const viaEsashiGun = await fromRomaji('Esashi-cho, Esashi-gun, Hokkaido');
    expect(viaEsashiGun.ok).toBe(false);
    if (!viaEsashiGun.ok) {
      expect(viaEsashiGun.reason).toBe('TOWN_NOT_FOUND');
      expect(viaEsashiGun.partial?.city?.ja).toBe('枝幸町');
    }
  });

  it('carries blockNumbers and unparsed through to municipality-level AMBIGUOUS candidates', async () => {
    // What precedes the (still-ambiguous) municipality segments — numbers and
    // a building name here — cannot be resolved into a town at this level
    // (which municipality's town list to even search is exactly what's
    // ambiguous), but it must not be silently dropped from candidates a
    // caller picks from and renders. Regression: buildMunicipalityCandidate
    // (added in a2b28f1) hardcoded blockNumbers: [] and no unparsed field at
    // all, unlike the town-level AMBIGUOUS branch below, which does carry
    // both through.
    const result = await fromRomaji('Sunshine Bldg 5F, 1-1 Sakura, Esashi-cho, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates).toHaveLength(2);
    for (const candidate of result.candidates ?? []) {
      expect(candidate.level).toBe(2);
      expect(candidate.blockNumbers).toEqual([1, 1]);
      expect(candidate.unparsed).toBe('Sunshine Bldg 5F, Sakura');
    }
  });

  it('resolves a real town into the correct one of two colliding municipalities (Shimanto-cho vs Shimanto-shi)', async () => {
    // The reported bug: "1-1 Nakamura, Shimanto-cho, Kochi" used to resolve
    // into 高知県四万十市中村 (wrong municipality) instead of
    // 高知県高岡郡四万十町中村 (what was actually typed).
    const town = await fromRomaji('1-1 Nakamura, Shimanto-cho, Kochi');
    expect(town.ok).toBe(true);
    if (!town.ok) return;
    expect(town.value.parsed.city?.ja).toBe('四万十町');
    expect(town.value.parsed.county?.ja).toBe('高岡郡');
    expect(town.value.parsed.town?.ja).toBe('中村');

    const city = await fromRomaji('1-1 Nakamura, Shimanto-shi, Kochi');
    expect(city.ok).toBe(true);
    if (!city.ok) return;
    expect(city.value.parsed.city?.ja).toBe('四万十市');
    expect(city.value.parsed.county).toBeUndefined();
    expect(city.value.parsed.town?.ja).toBe('中村');
  });
});
