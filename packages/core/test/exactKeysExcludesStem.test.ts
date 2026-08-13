/**
 * Pins that `exactKeys` and `candidateKeys` are NOT interchangeable, even
 * though they are nearly identical in shape (both build a `Set<string>` from
 * a kana reading and a romaji field). The one difference — `candidateKeys`
 * also adds each value's `stemKey()` (the value with its administrative
 * suffix stripped); `exactKeys` does not — is exactly what
 * `matchMunicipality`'s exact-vs-stem tiebreaker relies on: an exact-reading
 * match ("Fuchu-cho" against 府中町's own `Fuchu-cho`) must be preferred over
 * one that only exists once both sides are stemmed down to "fuchu" ("Fuchu-cho"
 * against 府中市's `Fuchu-shi`, stemmed).
 *
 * Nothing about the two functions' *shapes* stops a future "these are
 * basically duplicated, let's unify them" refactor from making `exactKeys`
 * stem-inclusive like `candidateKeys` — and CONTRIBUTING.md's own advice ("if
 * you add a test, break the code it protects and confirm it fails") is what
 * caught that such a refactor changes national resolution behavior (the
 * 府中市/府中町 collision) while every *existing* test at the time still
 * passed, because none of them asserted on `exactKeys`'s output directly —
 * only on end-to-end `fromRomaji()` behavior that happened to be covered by
 * other fixtures. This test asserts on the sets themselves so that gap can't
 * reopen silently.
 */

import { describe, expect, it } from 'vitest';
import { candidateKeys, exactKeys } from '../src/fromRomaji.js';

describe('exactKeys vs candidateKeys: the stem-key difference is deliberate, not incidental', () => {
  it('candidateKeys includes the administrative-suffix-stripped form of the romaji field', () => {
    const keys = candidateKeys(undefined, 'Fuchu-cho');
    expect(keys.has('fuchucho')).toBe(true);
    expect(keys.has('fuchu')).toBe(true);
  });

  it('exactKeys does NOT include the stemmed form — only the field taken verbatim', () => {
    const keys = exactKeys(undefined, 'Fuchu-cho');
    expect(keys.has('fuchucho')).toBe(true);
    expect(keys.has('fuchu')).toBe(false);
  });

  it('candidateKeys includes the stemmed form of a kana-derived reading too', () => {
    // カサマチ ("Kasamachi") transliterates to "kasamachi"; candidateKeys
    // also offers its stem ("kasa") so a query that omits the suffix still
    // matches. exactKeys must not.
    const candidate = candidateKeys('カサマチ');
    const exact = exactKeys('カサマチ');
    expect(candidate.has('kasamachi')).toBe(true);
    expect(candidate.has('kasa')).toBe(true);
    expect(exact.has('kasamachi')).toBe(true);
    expect(exact.has('kasa')).toBe(false);
  });
});
