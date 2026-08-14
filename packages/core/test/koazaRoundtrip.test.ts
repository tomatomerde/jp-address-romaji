/**
 * Round-trip property test for the named-koaza class specifically.
 *
 * `roundtrip.test.ts` builds its cases as `pref + municipality + oaza_cho +
 * chome + "1-1"` from `fixtures/data` — it never includes a koaza, which is
 * exactly why the bug this file guards against (docs/project-status.md item
 * 1) survived undetected. This is a sibling test, not an edit to that file:
 * `fixtures/data` is deliberately sparse v1-derived data that CLAUDE.md asks
 * not to be "fixed" with new coverage, so the koaza fixtures live in their
 * own directory (see fixtures-koaza/README.md) and get their own loop here,
 * mirroring `roundtrip.test.ts`'s structure and invariant.
 *
 * The invariant is identical to `roundtrip.test.ts`'s: `ja -> romaji -> ja`
 * must be identity, or an explicit failure — never a silently different
 * address. For the koaza class specifically that includes two extra ways to
 * fail safely, both exercised here: `toRomaji` refusing an unverifiable
 * reading (`KOAZA_READING_INCOMPLETE`) instead of romanizing a truncated one,
 * and `fromRomaji` refusing to match at all rather than resolving to the
 * koaza-less town.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { KOAZA_FIXTURE_DATA_DIR, useKoazaFixtureData } from './helpers.js';

interface Town {
  oaza_cho?: string;
  koaza?: string;
}

interface City {
  county?: string;
  city: string;
  ward?: string;
}

interface Pref {
  pref: string;
  cities: City[];
}

/** Every (prefecture, municipality, town, koaza) row in the koaza fixtures. */
function loadCases(): { ja: string; koaza?: string }[] {
  const index = JSON.parse(
    fs.readFileSync(path.join(KOAZA_FIXTURE_DATA_DIR, 'ja.json'), 'utf-8'),
  ) as { data: Pref[] };

  const cases: { ja: string; koaza?: string }[] = [];
  for (const pref of index.data) {
    for (const city of pref.cities) {
      const municipality = `${city.county ?? ''}${city.city}${city.ward ?? ''}`;
      const file = path.join(KOAZA_FIXTURE_DATA_DIR, 'ja', pref.pref, `${municipality}.json`);
      if (!fs.existsSync(file)) continue;
      const towns = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { data: Town[] }).data;
      for (const town of towns) {
        if (!town.oaza_cho) continue;
        cases.push({
          ja: `${pref.pref}${municipality}${town.oaza_cho}${town.koaza ?? ''}1-1`,
          ...(town.koaza ? { koaza: town.koaza } : {}),
        });
      }
    }
  }
  return cases;
}

describe('round-trip: the named-koaza class specifically', () => {
  beforeAll(() => useKoazaFixtureData());

  it('never silently returns a different address, for every koaza fixture row', async () => {
    const cases = loadCases();
    // Sanity: both a koaza-bearing case and a plain (no-koaza) case must be
    // present, or this loop would trivially pass without exercising anything.
    expect(cases.some((c) => c.koaza)).toBe(true);
    expect(cases.some((c) => !c.koaza)).toBe(true);

    const mismatched: string[] = [];
    let forwardOk = 0;
    let forwardRefused = 0;
    let reverseIdentity = 0;
    let reverseFailed = 0;

    for (const testCase of cases) {
      const forward = await toRomaji(testCase.ja);
      if (!forward.ok) {
        forwardRefused++;
        // A koaza-bearing case may legitimately be refused (an incomplete
        // reading), but ONLY with the dedicated reason — never with the
        // koaza silently vanishing behind some other reason.
        if (testCase.koaza) expect(forward.reason).toBe('KOAZA_READING_INCOMPLETE');
        continue;
      }
      forwardOk++;

      // The koaza the input actually had must be the one that comes out —
      // never silently absent, never a different koaza.
      expect(forward.value.parsed.koaza?.ja).toBe(testCase.koaza);
      if (testCase.koaza) {
        expect(forward.value.formatted).toContain(forward.value.parsed.koaza!.romaji!);
      }

      const back = await fromRomaji(forward.value.formatted);
      if (!back.ok) {
        reverseFailed++;
        continue;
      }
      reverseIdentity++;

      const sent = forward.value.parsed;
      const got = back.value.parsed;
      if (
        got.town?.ja !== sent.town?.ja ||
        got.koaza?.ja !== sent.koaza?.ja ||
        got.prefecture?.ja !== sent.prefecture?.ja ||
        got.city?.ja !== sent.city?.ja ||
        got.ward?.ja !== sent.ward?.ja
      ) {
        mismatched.push(`${testCase.ja} -> "${forward.value.formatted}" -> ${back.value.formatted}`);
      }
    }

    console.log('koaza round-trip stats:', {
      total: cases.length,
      forwardOk,
      forwardRefused,
      reverseIdentity,
      reverseFailed,
      mismatched: mismatched.length,
    });

    // The invariant: no silent mismatches, for either the koaza-bearing or
    // the plain cases.
    expect(mismatched).toEqual([]);
  });
});
