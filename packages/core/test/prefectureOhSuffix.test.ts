/**
 * Regression test for a review finding: `data/prefectures.ts` registered
 * suffix-carrying keys ("Tokyo-to", "Osaka-fu", "Aomori-ken") for the plain
 * and macron romaji spellings, but not for the "oh"-style passport spelling
 * ("Ohsaka", "Tohkyoh"). `findPrefectureByRomaji('Ohsaka-fu')`,
 * `'Tohkyoh-to'`, and `'Kohchi-ken'` returned `undefined` even though the
 * same names without a suffix, and the plain/macron spellings with a
 * suffix, all resolved.
 */

import { describe, expect, it } from 'vitest';
import { findPrefectureByRomaji } from '../src/data/prefectures.js';

describe('findPrefectureByRomaji: "oh"-style spelling with an administrative suffix', () => {
  it('resolves Ohsaka-fu (oh-style + fu)', () => {
    const p = findPrefectureByRomaji('Ohsaka-fu');
    expect(p?.ja).toBe('大阪府');
  });

  it('resolves Tohkyoh-to (oh-style + to)', () => {
    const p = findPrefectureByRomaji('Tohkyoh-to');
    expect(p?.ja).toBe('東京都');
  });

  it('resolves Kohchi-ken (oh-style + ken)', () => {
    const p = findPrefectureByRomaji('Kohchi-ken');
    expect(p?.ja).toBe('高知県');
  });

  it('still resolves the pre-existing spellings (unaffected cases)', () => {
    expect(findPrefectureByRomaji('Ohsaka')?.ja).toBe('大阪府');
    expect(findPrefectureByRomaji('Osaka-fu')?.ja).toBe('大阪府');
    expect(findPrefectureByRomaji('Ōsaka-fu')?.ja).toBe('大阪府');
  });
});
