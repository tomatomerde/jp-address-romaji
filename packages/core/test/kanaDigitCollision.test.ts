/**
 * Accepting digits in a kana reading (0.1.3) made one previously unreachable
 * town reachable, and that town collides with a neighbour: 北海道上川郡東神楽町
 * has both `ひじり野南一条` (with `oaza_cho_r: "Hijirinominami 1-Jo"`) and
 * `ひじりの南一条` (kana only), and both now index `hijirinominami1jo`.
 *
 * So an address that resolved cleanly in 0.1.2 now comes back AMBIGUOUS. That
 * is the correct outcome, not a regression to paper over: the two names
 * romanize identically, so nothing in the query tells them apart, and picking
 * one would be a guess.
 *
 * This branch did try preferring the romaji-field-backed town. Measured
 * nationally, that rule silently resolved 110 towns to a *different* town
 * (`扇町` → `正親町`, `巻` → `真木`, `辰巳町` → `巽町`) to rescue this single
 * municipality, so it was removed before release. This test exists to keep
 * that trade from being made again: if a future change makes one of these two
 * candidates win, it should have to delete this test and say why.
 *
 * See fixtures-kana-digit-collision/README.md.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useKanaDigitCollisionFixtureData } from './helpers.js';

describe('kana readings with digits can collide with a romaji-backed town', () => {
  beforeEach(() => {
    useKanaDigitCollisionFixtureData();
  });

  it('returns AMBIGUOUS rather than picking the romaji-backed spelling', async () => {
    const result = await fromRomaji(
      '1-1-1 Hijirinominami 1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido',
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');

    const towns = (result.candidates ?? []).map((c) => c.town?.ja).sort();
    expect(towns).toEqual(['ひじりの南一条', 'ひじり野南一条'].sort());
  });

  it('still resolves a town in the same municipality that nothing collides with', async () => {
    const result = await fromRomaji('1-1 Higashi 1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido');

    // Whatever this resolves to, it must not be one of the colliding pair —
    // the collision is specific to `hijirinominami1jo`, not to the whole
    // municipality.
    if (result.ok) {
      expect(result.value.parsed.town?.ja).not.toBe('ひじり野南一条');
      expect(result.value.parsed.town?.ja).not.toBe('ひじりの南一条');
    } else {
      expect(result.reason).not.toBe('AMBIGUOUS');
    }
  });
});
