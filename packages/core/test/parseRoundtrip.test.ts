/**
 * Regression test for a review finding: `parse()` routed any input
 * containing so much as one Japanese character to `toRomaji`, even though
 * `fromRomaji` deliberately supports a Japanese-script building-name
 * segment carried through verbatim (see fromRomaji.ts's own splitting of
 * such segments before matching, and roundtrip.test.ts). So the library's
 * own round trip broke for any address with a building name:
 * `toRomaji`'s output could not be read back by `parse` even though
 * `fromRomaji` itself handled it fine.
 *
 * The fix must still route unambiguous Japanese input to `toRomaji`,
 * including the trap case of a building name that itself starts with a
 * prefecture name (`東京都民ビル`, `北海道ビル`) — `parse` must not "solve"
 * that by guessing a direction from partial evidence; it should behave
 * exactly as it did for these inputs before this fix (route to Japanese,
 * fail with a normal, deterministic reason).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { parse, detectScript } from '../src/parse.js';
import { useFixtureData } from './helpers.js';

beforeAll(() => useFixtureData());

describe('parse: round-trips a toRomaji output containing a Japanese building name', () => {
  it('reads back what toRomaji produced for an address with a building name', async () => {
    const forward = await toRomaji('東京都新宿区西新宿三丁目5番12号 サンプルビル301');
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    const formatted = forward.value.formatted;

    // fromRomaji already handles this input directly (this is the
    // existing, unaffected behavior the regression compares against).
    const direct = await fromRomaji(formatted);
    expect(direct.ok).toBe(true);

    // parse() must route the same input the same way fromRomaji would,
    // not fall back to toRomaji just because a Japanese building-name
    // segment is present.
    const routed = await parse(formatted);
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    // Casing of the echoed-back romaji is fromRomaji.ts's concern, not
    // parse()'s — what matters here is that parse() reached fromRomaji's
    // successful result at all, instead of failing at the routing step.
    expect(routed.value.town?.ja).toBe('西新宿');
    expect(routed.unparsed).toBe('サンプルビル301');
  });

  it('detects such an address as romaji, not Japanese', () => {
    const formatted =
      'サンプルビル301, 3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo, Japan';
    expect(detectScript(formatted)).toBe('romaji');
  });

  it('still detects a plain Japanese address as Japanese (unaffected case)', () => {
    expect(detectScript('東京都渋谷区上原1-2-3')).toBe('japanese');
  });

  it('still detects a plain romaji address as romaji (unaffected case)', () => {
    expect(detectScript('1-2-3 Uehara, Shibuya-ku, Tokyo')).toBe('romaji');
  });

  it('trap: a building name starting with a prefecture name is still routed to Japanese, not guessed at', async () => {
    expect(detectScript('東京都民ビル')).toBe('japanese');
    expect(detectScript('北海道ビル')).toBe('japanese');

    // Same deterministic (non-AMBIGUOUS, non-crash) failure as before this
    // fix — there is no romaji information in the input for fromRomaji to
    // use, so toRomaji is still the right direction, and it still cannot
    // resolve a bare building name to a municipality.
    const result = await parse('東京都民ビル');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CITY_NOT_FOUND');
  });
});
