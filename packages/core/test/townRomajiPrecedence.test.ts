/**
 * Regression test for a collision introduced on this branch (not present in
 * published `jp-address-romaji@0.1.2`): once `isTransliterableKana` started
 * accepting kana readings that contain a digit, a town with no `oaza_cho_r`
 * romaji field but a kana reading identical to a DIFFERENT, romaji-backed
 * town's reading started matching `fromRomaji` queries meant for the latter.
 * `"1-1-1 Hijirinominami 1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido"`
 * resolved cleanly in 0.1.2; on this branch it started reporting `AMBIGUOUS`
 * between `ひじり野南一条` (has `oaza_cho_r: "Hijirinominami 1-Jo"`) and
 * `ひじりの南一条` (no romaji field, matches only via a kana transliteration
 * that happens to coincide).
 *
 * Fix: when a romanized key collides across more than one distinct town
 * within a municipality, prefer the town(s) reachable through their OWN
 * romaji field over one reachable only via a kana transliteration — the
 * dataset's romaji field is the authoritative spelling, and a kana-derived
 * key is a substitute for it, not the other way around.
 *
 * This must NOT fire when both colliding towns have their own romaji field
 * (see fromRomaji.test.ts's 夷町/恵比須町 case, using the general fixture
 * data, which must stay AMBIGUOUS) — see the comment on
 * `romajiFieldKey`/where it's used in fromRomaji.ts for why the preference
 * also must not fire via a STEMMED match of a candidate's own romaji field
 * (the 深谷/深谷町 case, exercised against the real dataset by
 * roundtrip.test.ts).
 *
 * Uses a dedicated fixture dataset (see
 * fixtures-town-romaji-precedence/README.md) rather than the general
 * `fixtures/data`, which is deliberately sparse v1-derived data whose
 * coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useTownRomajiPrecedenceFixtureData } from './helpers.js';

beforeAll(() => useTownRomajiPrecedenceFixtureData());

describe('fromRomaji: prefers a romaji-field-backed town over a kana-only collision', () => {
  it('resolves the romaji-field-backed town instead of reporting AMBIGUOUS', async () => {
    const result = await fromRomaji(
      '1-1-1 Hijirinominami 1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('ひじり野南一条');
    expect(result.value.parsed.town?.romaji).toBe('Hijirinominami 1-Jo');
    expect(result.value.parsed.chome).toBe(1);
    expect(result.value.parsed.blockNumbers).toEqual([1, 1]);
    expect(result.value.formatted).toBe('北海道上川郡東神楽町ひじり野南一条一丁目1-1');
  });

  it('resolves a different chome of the same romaji-field-backed town the same way', async () => {
    const result = await fromRomaji(
      '2-1 Hijirinominami 1-Jo, Higashikagura-cho, Kamikawa-gun, Hokkaido',
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('ひじり野南一条');
    expect(result.value.parsed.chome).toBe(2);
  });
});
