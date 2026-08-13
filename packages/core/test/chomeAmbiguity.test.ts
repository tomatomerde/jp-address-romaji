/**
 * Regression tests for a town-level ambiguity bug present in the published
 * `jp-address-romaji@0.1.2`: when a town has both chome-bearing rows and a
 * chome-less row, and the leading number in a romaji address is a valid
 * chome number for that town, `fromRomaji` silently read it as the chome —
 * even though the exact same input is equally readable as a chome-less
 * address with that number as the first block number. `"1-1 Asagishi"` in
 * 盛岡市 could mean 浅岸一丁目1 (chome 1, block 1) or 浅岸1番1号 (chome-less,
 * block 1-1); the library picked the former without telling the caller a
 * second reading existed. The invariant this protects is the same one
 * `roundtrip.test.ts` states in its header comment: ja -> romaji -> ja must
 * be identity or an explicit failure, never a silently different address.
 *
 * This is a different ambiguity from the one `matches.length > 1` (distinct
 * towns sharing a romanization) already handles a few lines above it in
 * fromRomaji.ts: there, the same leading number picks between two DIFFERENT
 * towns; here, it picks between two READINGS of the SAME town.
 *
 * Uses a dedicated fixture dataset (see fixtures-chome-ambiguity/README.md)
 * rather than the general `fixtures/data`, which is deliberately sparse
 * v1-derived data whose coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useChomeAmbiguityFixtureData } from './helpers.js';

beforeAll(() => useChomeAmbiguityFixtureData());

describe('fromRomaji: chome vs chome-less collision for the same town', () => {
  it('reports AMBIGUOUS when the leading number is a valid chome and a chome-less row also exists', async () => {
    const result = await fromRomaji('1-1 Asagishi, Morioka-shi, Iwate');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates).toHaveLength(2);

    const chomeReading = result.candidates?.find((c) => c.chome !== undefined);
    expect(chomeReading?.town?.ja).toBe('浅岸');
    expect(chomeReading?.chome).toBe(1);
    expect(chomeReading?.blockNumbers).toEqual([1]);

    const chomelessReading = result.candidates?.find((c) => c.chome === undefined);
    expect(chomelessReading?.town?.ja).toBe('浅岸');
    expect(chomelessReading?.blockNumbers).toEqual([1, 1]);
  });

  it('gives the same two readings for a different valid chome number (2-3)', async () => {
    const result = await fromRomaji('2-3 Asagishi, Morioka-shi, Iwate');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');

    const chomeReading = result.candidates?.find((c) => c.chome !== undefined);
    expect(chomeReading?.chome).toBe(2);
    expect(chomeReading?.blockNumbers).toEqual([3]);

    const chomelessReading = result.candidates?.find((c) => c.chome === undefined);
    expect(chomelessReading?.blockNumbers).toEqual([2, 3]);
  });

  it('is not ambiguous when the leading number is not a valid chome — falls through to the chome-less reading', async () => {
    // 浅岸 only has chome 1 and 2 in this fixture. 99 cannot be a chome, so
    // the only possible reading is the chome-less entry with every number
    // folded into blockNumbers. Not ambiguous: there is only one reading.
    const result = await fromRomaji('99-1 Asagishi, Morioka-shi, Iwate');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('浅岸');
    expect(result.value.parsed.chome).toBeUndefined();
    expect(result.value.parsed.blockNumbers).toEqual([99, 1]);
  });

  it('is not ambiguous with no leading number at all', async () => {
    const result = await fromRomaji('Asagishi, Morioka-shi, Iwate');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('浅岸');
    expect(result.value.parsed.chome).toBeUndefined();
    expect(result.value.parsed.blockNumbers).toEqual([]);
  });
});
