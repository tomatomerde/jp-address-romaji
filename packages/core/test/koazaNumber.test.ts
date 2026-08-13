/**
 * Regression tests for a silent data-loss bug present in the published
 * `jp-address-romaji@0.1.2`: a town whose `koaza` (small-area) rows are
 * themselves numbered (`N地割` "chiwari" in rural Iwate, `N号` "gou"
 * elsewhere) has no `chome`, so the leading number of a hyphenated address
 * such as `2-3` is read by the upstream normalizer as koaza `2` plus block
 * number `3` — but `normalizeJapanese` only ever extracted `chome_n` and the
 * flat `oaza_cho`. The koaza number was read nowhere and silently vanished:
 * `青笹町青笹2-3` romanized as `"3 Aozasacho Aozasa"`, not `"2-3 ..."`. That is
 * a different, wrong address — exactly the outcome `roundtrip.test.ts`'s
 * header comment says must never happen silently.
 *
 * Uses a dedicated fixture dataset (see
 * fixtures-koaza-number-ambiguity/README.md) rather than the general
 * `fixtures/data`, which is deliberately sparse v1-derived data whose
 * coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { useKoazaNumberAmbiguityFixtureData } from './helpers.js';

beforeAll(() => useKoazaNumberAmbiguityFixtureData());

describe('toRomaji: numbered koaza (地割/号) must not swallow the leading number', () => {
  it('keeps both numbers for a town with a flat row plus numbered 地割 koaza rows (青笹町青笹)', async () => {
    const result = await toRomaji('岩手県遠野市青笹町青笹2-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('青笹町青笹');
    expect(result.value.parsed.chome).toBeUndefined();
    expect(result.value.parsed.blockNumbers).toEqual([2, 3]);
    expect(result.value.formatted).toBe('2-3 Aozasacho Aozasa, Tono-shi, Iwate, Japan');
  });

  it('agrees with the 番/号 notation of the same address', async () => {
    const hyphen = await toRomaji('岩手県遠野市青笹町青笹2-3');
    const banGo = await toRomaji('岩手県遠野市青笹町青笹2番3号');
    expect(hyphen.ok).toBe(true);
    expect(banGo.ok).toBe(true);
    if (!hyphen.ok || !banGo.ok) return;
    expect(hyphen.value.formatted).toBe(banGo.value.formatted);
  });

  it('still works for a single, non-hyphenated block number (no koaza row is matched)', async () => {
    const result = await toRomaji('岩手県遠野市青笹町青笹5');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.blockNumbers).toEqual([5]);
    expect(result.value.formatted).toBe('5 Aozasacho Aozasa, Tono-shi, Iwate, Japan');
  });

  it('keeps both numbers for a town with NO flat row — every row is a numbered 号 koaza (名田庄挙原)', async () => {
    const result = await toRomaji('福井県大飯郡おおい町名田庄挙原1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('名田庄挙原');
    expect(result.value.parsed.chome).toBeUndefined();
    expect(result.value.parsed.blockNumbers).toEqual([1, 1]);
    expect(result.value.formatted).toBe('1-1 Natasho Agehara, Oi-cho, Oi-gun, Fukui, Japan');
  });

  it('recovers a different koaza number correctly (not just a coincidental "1")', async () => {
    const result = await toRomaji('福井県大飯郡おおい町名田庄挙原3-9');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.blockNumbers).toEqual([3, 9]);
  });
});
