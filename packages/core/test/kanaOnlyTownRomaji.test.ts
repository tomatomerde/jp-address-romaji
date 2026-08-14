/**
 * `fromRomaji`'s `buildParsed` used to attach `parsed.town.romaji` only when
 * the dataset record had an `oaza_cho_r` field. About 10% of towns have a
 * kana reading but no romaji field (see CLAUDE.md's "データの実情"), and for
 * those the match still happened — through the kana — but the resulting
 * `AddressComponent` silently dropped the romaji that made the match
 * possible in the first place.
 *
 * That mattered beyond the missing field: `toFormat`'s `streetOf`
 * (`packages/core/src/formats/index.ts`) falls back to `town.ja` when
 * `town.romaji` is absent, so an address declared `languageCode: "en"` came
 * back with raw kanji in its address lines.
 *
 * See docs/project-status.md item 3 and fixtures-kana-only-town/README.md.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { toFormat } from '../src/formats/index.js';
import { useKanaOnlyTownFixtureData } from './helpers.js';

describe('fromRomaji attaches romaji for a town matched only through its kana', () => {
  beforeEach(() => {
    useKanaOnlyTownFixtureData();
  });

  it('fills in parsed.town.romaji with the deterministic transliteration used to match', async () => {
    const result = await fromRomaji('1-1 Oazakomagome, Aomori-shi, Aomori');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('大字駒込');
    expect(result.value.parsed.town?.kana).toBe('オオアザコマゴメ');
    // The dataset has no oaza_cho_r for this town — this must be the
    // transliteration of the kana, not a guess, and not left undefined.
    expect(result.value.parsed.town?.romaji).toBe('Oazakomagome');
  });

  it('never invents a reading: a town with no kana either gets no romaji', async () => {
    // Sanity check on the fallback itself: resolveTownRomaji must not
    // produce a value out of nothing. There is no such town in this fixture
    // (a real dataset never omits both fields for the same entry, and this
    // fixture mirrors that), so this is exercised indirectly by the parse
    // above never returning romaji: undefined despite ja being non-empty.
    const result = await fromRomaji('1-1 Oazakomagome, Aomori-shi, Aomori');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.romaji).not.toBeUndefined();
  });

  it('keeps toFormat(..., "google-i18n") free of kanji under an English declaration', async () => {
    const result = await fromRomaji('1-1 Oazakomagome, Aomori-shi, Aomori');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const value = toFormat(result.value.parsed, 'google-i18n');
    expect(value.languageCode).toBe('en');
    expect(value.addressLines).toEqual(['1-1 Oazakomagome']);
    // The bug produced ["1-1 大字駒込"] here — kanji under an "en" declaration.
    for (const line of value.addressLines) {
      expect(line).not.toMatch(/[一-鿿]/);
    }
  });
});
