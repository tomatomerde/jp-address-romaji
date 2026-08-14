/**
 * Regression tests for a bug documented in docs/project-status.md ("2【中】"):
 * `fromRomaji` could not read back `toRomaji`'s own `{ longVowel: 'oh' }`
 * output for a municipality whose administrative-suffix kana reading itself
 * contains a long vowel — 町 read チョウ ("cho"), as opposed to マチ
 * ("machi") — because the suffix's own o+u pair gets rendered `choh` under
 * 'oh' style if the whole kana reading is transliterated in one pass, a
 * spelling `formatMunicipality` never actually emits (it always emits the
 * literal, style-invariant `cho` from its `SUFFIXES` table):
 *
 *   toRomaji('北海道石狩郡当別町', { longVowel: 'oh' })
 *     -> partial.city.romaji = "Tohbetsu-cho"
 *   fromRomaji('Tohbetsu-cho, Hokkaido')
 *     -> ok: false, reason: 'CITY_NOT_FOUND'   (before the fix)
 *
 * Root cause: `candidateKeys`/`exactKeys` (fromRomaji.ts) transliterated the
 * whole kana reading (トウベツチョウ) as one string instead of mirroring
 * `formatMunicipality`'s stem-then-literal-suffix rendering.
 *
 * Three levels of test, from most to least direct:
 *  1. Unit tests on `candidateKeys`/`exactKeys` themselves — the exact
 *     functions whose key set was missing the needed entry.
 *  2. An end-to-end `fromRomaji` test against a dedicated fixture dataset
 *     (see fixtures-longvowel-oh/README.md), reproducing the bug report
 *     verbatim.
 *  3. A `formatMunicipality` unit test pinning the forward-direction output
 *     this fix has to agree with (that side was already correct — this just
 *     documents the contract `candidateKeys` must not drift from).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { candidateKeys, exactKeys, fromRomaji } from '../src/fromRomaji.js';
import { formatMunicipality } from '../src/romaji/format.js';
import { useLongVowelOhFixtureData } from './helpers.js';

describe('formatMunicipality: forward direction (already correct, pinned as a contract)', () => {
  it("renders 当別町's 'oh'-style suffix as the literal short form, not the suffix's own long vowel", () => {
    expect(formatMunicipality('当別町', 'トウベツチョウ', 'Tobetsu-cho', 'oh')).toBe('Tohbetsu-cho');
  });
});

describe('candidateKeys / exactKeys: municipality-suffix-aware oh-style keys', () => {
  it("candidateKeys includes the key for formatMunicipality's own 'oh'-style rendering", () => {
    const keys = candidateKeys('トウベツチョウ', 'Tobetsu-cho', '当別町');
    // "Tohbetsu-cho" normalized: lowercase, hyphen stripped.
    expect(keys.has('tohbetsucho')).toBe(true);
    // The whole-string transliteration this used to rely on exclusively
    // produces "tohbetsuchoh" instead — that is the bug, not a key we assert
    // must be absent, but demonstrating the fix is not just accidentally
    // present makes the point concrete: the correct key was simply missing
    // before, not present-but-shadowed.
  });

  it("exactKeys also includes it, so the query is an EXACT match, not merely a stem match", () => {
    // Matters for matchMunicipality's exact-over-stem tiebreaker: a query
    // spelled exactly as the dataset's own correct reading must not lose to
    // some other municipality that only matches after stemming.
    const keys = exactKeys('トウベツチョウ', 'Tobetsu-cho', '当別町');
    expect(keys.has('tohbetsucho')).toBe(true);
  });

  it('without `ja`, the suffix-aware key is not added (municipality-only behavior)', () => {
    // Town names never split an administrative suffix off (formatTown does
    // not call splitAdministrativeSuffix), so candidateKeys must not invent
    // this branch's output for a bare kana/romaji pair with no `ja` given —
    // matchTowns relies on that.
    const keys = candidateKeys('トウベツチョウ', 'Tobetsu-cho');
    expect(keys.has('tohbetsucho')).toBe(false);
  });
});

describe('fromRomaji: reads back its own toRomaji({ longVowel: "oh" }) municipality output', () => {
  beforeAll(() => useLongVowelOhFixtureData());

  it('resolves "Tohbetsu-cho, Hokkaido" to 当別町 instead of failing with CITY_NOT_FOUND', async () => {
    const result = await fromRomaji('Tohbetsu-cho, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // No town was given, so this stops at the municipality level — the bug
    // was that it never got this far at all (CITY_NOT_FOUND).
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('当別町');
    expect(result.partial?.county?.ja).toBe('石狩郡');
  });

  it('also resolves the county-qualified form', async () => {
    const result = await fromRomaji('Tohbetsu-cho, Ishikari-gun, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('当別町');
  });
});
