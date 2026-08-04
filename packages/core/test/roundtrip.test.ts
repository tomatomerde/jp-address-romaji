/**
 * Round-trip property test.
 *
 * For every town in the fixture dataset we build a Japanese address, romanize
 * it, and convert it back. The invariant under test is not "everything
 * converts" — roughly 15% of rural town names genuinely lack readings and
 * must fail. The invariant is that a conversion never comes back as a
 * *different* address:
 *
 *   ja -> romaji -> ja   must be identity, or an explicit failure.
 *
 * A silent mismatch is the one outcome that would make this library dangerous
 * for shipping labels, so it is asserted to be zero.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { numberToKanji } from '../src/kanjiNumbers.js';
import { FIXTURE_DATA_DIR, useFixtureData } from './helpers.js';

interface Town {
  oaza_cho?: string;
  oaza_cho_r?: string;
  chome_n?: number;
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

/** Every (prefecture, municipality, town) triple in the fixtures. */
function loadCases(): { ja: string; pref: string; city: string; town: string; chome?: number }[] {
  const index = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DATA_DIR, 'ja.json'), 'utf-8'),
  ) as { data: Pref[] };

  const cases: { ja: string; pref: string; city: string; town: string; chome?: number }[] = [];
  for (const pref of index.data) {
    for (const city of pref.cities) {
      const municipality = `${city.county ?? ''}${city.city}${city.ward ?? ''}`;
      const file = path.join(FIXTURE_DATA_DIR, 'ja', pref.pref, `${municipality}.json`);
      if (!fs.existsSync(file)) continue;
      const towns = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { data: Town[] }).data;
      for (const town of towns) {
        if (!town.oaza_cho) continue;
        const chomePart = town.chome_n !== undefined ? `${numberToKanji(town.chome_n)}丁目` : '';
        cases.push({
          ja: `${pref.pref}${municipality}${town.oaza_cho}${chomePart}1-1`,
          pref: pref.pref,
          city: municipality,
          town: town.oaza_cho,
          ...(town.chome_n !== undefined ? { chome: town.chome_n } : {}),
        });
      }
    }
  }
  return cases;
}

describe('round-trip: ja -> romaji -> ja', () => {
  beforeAll(() => useFixtureData());

  it('never silently returns a different address', async () => {
    const cases = loadCases();
    expect(cases.length).toBeGreaterThan(3000);

    const stats = {
      total: cases.length,
      romanized: 0,
      forwardFailed: 0,
      reversed: 0,
      reverseFailed: 0,
      mismatched: [] as string[],
      forwardReasons: {} as Record<string, number>,
      reverseReasons: {} as Record<string, number>,
    };

    for (const testCase of cases) {
      const forward = await toRomaji(testCase.ja);
      if (!forward.ok) {
        stats.forwardFailed++;
        stats.forwardReasons[forward.reason] = (stats.forwardReasons[forward.reason] ?? 0) + 1;
        continue;
      }
      stats.romanized++;

      // A romanized name must never be a bare number or empty.
      expect(forward.value.parsed.town?.romaji).toMatch(/[A-Za-z]/);

      const back = await fromRomaji(forward.value.formatted);
      if (!back.ok) {
        stats.reverseFailed++;
        stats.reverseReasons[back.reason] = (stats.reverseReasons[back.reason] ?? 0) + 1;
        continue;
      }
      stats.reversed++;

      // Compare against what the forward pass actually parsed, not against the
      // synthetic input string. Resolving ambiguous Japanese input is the
      // upstream normalizer's job (it reads `大字原別1-1` as `原別一丁目1`,
      // since chome addresses are conventionally written that way). What this
      // library is responsible for is that the romaji it emits carries the
      // parsed address back without loss or corruption.
      const sent = forward.value.parsed;
      const got = back.value.parsed;
      if (
        got.town?.ja !== sent.town?.ja ||
        got.chome !== sent.chome ||
        got.prefecture?.ja !== sent.prefecture?.ja ||
        got.city?.ja !== sent.city?.ja ||
        got.ward?.ja !== sent.ward?.ja
      ) {
        stats.mismatched.push(
          `${testCase.ja} -> "${forward.value.formatted}" -> ${back.value.formatted}`,
        );
      }
    }

    console.log('round-trip stats:', {
      ...stats,
      mismatched: stats.mismatched.length,
      examples: stats.mismatched.slice(0, 5),
    });

    // The invariant: no silent mismatches.
    expect(stats.mismatched).toEqual([]);
    // Sanity: the fixtures must actually exercise a real volume of conversions.
    expect(stats.romanized).toBeGreaterThan(1000);
  });
});
