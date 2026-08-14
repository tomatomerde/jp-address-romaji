/**
 * Regression tests for `fromRomaji` failing to read back its own
 * `longVowel: 'oh'` output for a municipality name.
 *
 * `formatMunicipality` (`romaji/format.ts`) romanizes a municipality's STEM
 * alone in the requested style and appends the administrative suffix's
 * literal reading from `SUFFIXES` — it never "oh"-s the suffix itself
 * (`当別町` -> `"Tohbetsu-cho"`, never `"Tohbetsuchoh"`). Before this fix,
 * `candidateKeys`/`exactKeys` (`fromRomaji.ts`) only indexed the WHOLE kana
 * reading (stem + suffix) transliterated together as one word, which
 * diverges from that split rendering in two independent ways — see
 * fixtures-oh-suffix-boundary/README.md for the full explanation:
 *
 *  - the suffix's own kana can carry a long vowel (町 -> チョウ), so its
 *    whole-word "oh" spelling ("...choh") is not the literal suffix
 *    `stemKey` knows how to strip ("...cho");
 *  - a moraic ン at the stem/suffix boundary can nasal-assimilate toward the
 *    suffix's leading consonant when the whole reading is transliterated as
 *    one word ("...nammachi"), which never happens when the stem is
 *    romanized in isolation, as `formatMunicipality` does ("...nan-machi").
 *
 * The fix (`ohSplitKey` in fromRomaji.ts) reconstructs the same split key
 * `formatMunicipality` itself would produce and adds it to both
 * `candidateKeys` and `exactKeys`, gated on the caller supplying the
 * record's own kanji name (`ja`) — town-level matching (`matchTowns`) never
 * passes `ja`, since `formatTown` never splits a suffix off a town name in
 * the first place.
 *
 * Uses a dedicated fixture dataset (see fixtures-oh-suffix-boundary/README.md)
 * rather than the general `fixtures/data`, which is deliberately sparse
 * v1-derived data whose coverage CLAUDE.md asks not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji, candidateKeys, exactKeys } from '../src/fromRomaji.js';
import { formatMunicipality } from '../src/romaji/format.js';
import { normalizeRomajiKey } from '../src/data/prefectures.js';
import { useOhSuffixBoundaryFixtureData } from './helpers.js';

beforeAll(() => useOhSuffixBoundaryFixtureData());

describe('fromRomaji: reads back its own longVowel:"oh" municipality output', () => {
  it('formatMunicipality never "oh"-s the suffix itself (pins the forward shape this bug is about)', () => {
    expect(formatMunicipality('当別町', 'トウベツチョウ', 'Tobetsu-cho', 'oh')).toBe('Tohbetsu-cho');
    expect(formatMunicipality('長南町', 'チョウナンマチ', 'Chonan-machi', 'oh')).toBe('Chohnan-machi');
  });

  it('resolves "Tohbetsu-cho, Hokkaido" — suffix 町 itself has a long vowel', async () => {
    // Reported bug: fromRomaji('Tohbetsu-cho, Hokkaido') returned
    // CITY_NOT_FOUND against the published 0.1.2/0.1.3 behavior.
    const result = await fromRomaji('Tohbetsu-cho, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.county?.ja).toBe('石狩郡');
    expect(result.partial?.city?.ja).toBe('当別町');
  });

  it('resolves "Chohnan-machi, Chiba" — nasal assimilation at the stem/suffix boundary', async () => {
    // A second, independent divergence: -machi has no long vowel, but a
    // moraic ン sits right at the boundary (チョウナン + マチ).
    const result = await fromRomaji('Chohnan-machi, Chiba');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.county?.ja).toBe('長生郡');
    expect(result.partial?.city?.ja).toBe('長南町');
  });

  it('still resolves all four longVowel styles for the same two municipalities', async () => {
    const cases: Array<{ ja: string; kana: string; romaji: string; countyJa: string; cityJa: string }> = [
      { ja: '当別町', kana: 'トウベツチョウ', romaji: 'Tobetsu-cho', countyJa: '石狩郡', cityJa: '当別町' },
      { ja: '長南町', kana: 'チョウナンマチ', romaji: 'Chonan-machi', countyJa: '長生郡', cityJa: '長南町' },
    ];
    for (const c of cases) {
      for (const style of ['none', 'macron', 'circumflex', 'oh'] as const) {
        const rendered = formatMunicipality(c.ja, c.kana, c.romaji, style);
        expect(rendered).toBeDefined();
        const result = await fromRomaji(`${rendered}, ${c.ja === '当別町' ? 'Hokkaido' : 'Chiba'}`);
        expect(result.ok, `style=${style} q="${rendered}"`).toBe(false);
        if (result.ok) continue;
        expect(result.reason, `style=${style} q="${rendered}"`).toBe('TOWN_NOT_FOUND');
        expect(result.partial?.county?.ja, `style=${style}`).toBe(c.countyJa);
        expect(result.partial?.city?.ja, `style=${style}`).toBe(c.cityJa);
      }
    }
  });

  it('candidateKeys/exactKeys include the split-suffix "oh" key, given the record\'s own kanji name', () => {
    const wantKey = normalizeRomajiKey('Tohbetsu-cho');
    expect(candidateKeys('トウベツチョウ', 'Tobetsu-cho', '当別町').has(wantKey)).toBe(true);
    expect(exactKeys('トウベツチョウ', 'Tobetsu-cho', '当別町').has(wantKey)).toBe(true);
  });

  it('does NOT add the split-suffix key without `ja` — town-level matching must not gain it', () => {
    // formatTown never splits a suffix off a town name, so a town whose name
    // happens to end in a suffix-shaped kana reading must not get this extra
    // key: candidateKeys is also used for town matching (matchTowns), which
    // intentionally omits `ja`.
    const wantKey = normalizeRomajiKey('Tohbetsu-cho');
    expect(candidateKeys('トウベツチョウ', 'Tobetsu-cho').has(wantKey)).toBe(false);
    expect(exactKeys('トウベツチョウ', 'Tobetsu-cho').has(wantKey)).toBe(false);
  });
});
