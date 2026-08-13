import { beforeAll, describe, expect, it } from 'vitest';
import { fromRomaji } from '../src/fromRomaji.js';
import { useFixtureData, withNetworkBlocked } from './helpers.js';

beforeAll(() => useFixtureData());

describe('fromRomaji: reconstructs Japanese', () => {
  it('handles the canonical western-order form', async () => {
    const result = await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo 160-0023');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.prefecture?.ja).toBe('東京都');
    expect(result.value.parsed.city?.ja).toBe('新宿区');
    expect(result.value.parsed.town?.ja).toBe('西新宿');
    expect(result.value.parsed.chome).toBe(3);
    expect(result.value.parsed.blockNumbers).toEqual([5, 12]);
    expect(result.value.parsed.postalCode).toBe('160-0023');
    expect(result.value.formatted).toBe('東京都新宿区西新宿三丁目5-12');
  });

  it('accepts a trailing country name', async () => {
    const result = await fromRomaji('1-2-3 Uehara, Shibuya-ku, Tokyo, Japan');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('東京都渋谷区上原一丁目2-3');
  });

  it('accepts macron spellings', async () => {
    const result = await fromRomaji('1-2-3 Uehara, Shibuya-ku, Tōkyō');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.prefecture?.ja).toBe('東京都');
  });

  it('resolves a ward inside a designated city', async () => {
    const result = await fromRomaji('Chuo-ku, Sapporo-shi, Hokkaido');
    // Without a town this resolves only to level 2 and reports so.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.city?.ja).toBe('札幌市');
    expect(result.partial?.ward?.ja).toBe('中央区');
  });

  it('resolves a town inside a county', async () => {
    const result = await fromRomaji('Izumozaki-machi, Santo-gun, Niigata');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial?.county?.ja).toBe('三島郡');
    expect(result.partial?.city?.ja).toBe('出雲崎町');
  });

  it('still resolves the "wrong" but plausible suffix reading for the same 町', async () => {
    // 出雲崎町's own reading is "Izumozaki-machi" (see the fixture's
    // IZUMOZAKI MACHI). "-cho" is a different, but equally legitimate,
    // reading of 町 — the leniency that lets it stem-match here must survive
    // the fix (see suffixCategory.test.ts) that stops a suffix naming the
    // wrong KIND of unit (e.g. "-mura", "-gun") from doing the same.
    const result = await fromRomaji('Izumozaki-cho, Santo-gun, Niigata');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.partial?.county?.ja).toBe('三島郡');
    expect(result.partial?.city?.ja).toBe('出雲崎町');
  });

  it('excludes a corrupt dataset entry from candidates instead of manufacturing ambiguity', async () => {
    // 円山's own kana/romaji are corrupt copies of 円山西町's (see
    // isPlausibleReading). Before that check was applied here too, this
    // input matched BOTH entries and returned AMBIGUOUS for an address that
    // genuinely has only one real town match.
    //
    // The leading number is deliberately not a valid chome (円山西町 only has
    // chome 1 through 10) so this exercises only the corrupt-entry exclusion,
    // not the separate chome-vs-chome-less ambiguity that a real chome number
    // would trigger here (円山西町 genuinely has both a chome-less row and
    // chome rows — see chomeAmbiguity.test.ts).
    const result = await fromRomaji('99-1 Maruyamanishimachi, Chuo-ku, Sapporo-shi, Hokkaido');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('円山西町');
    expect(result.value.parsed.chome).toBeUndefined();
  });

  it('reports AMBIGUOUS for chome vs chome-less even once the corrupt dataset entry is excluded', async () => {
    // 円山西町 genuinely has both a chome-less row and chome rows 1-10 in the
    // real dataset (see chomeAmbiguity.test.ts for the general case). This
    // confirms the corrupt-entry exclusion above and the chome ambiguity
    // handling compose correctly: candidates are exactly the two genuine
    // 円山西町 readings, with no leak of the corrupt 円山 entry.
    const result = await fromRomaji('1-1 Maruyamanishimachi, Chuo-ku, Sapporo-shi, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates?.every((c) => c.town?.ja === '円山西町')).toBe(true);
  });

  it('uses a supplied postal-code index to resolve an ambiguity', async () => {
    const result = await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto 604-8081', {
      postalCodeIndex: (code) => (code === '604-8081' ? ['夷町'] : undefined),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('夷町');
  });

  it('stays ambiguous when the postal code does not narrow it to one', async () => {
    const result = await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto 604-8081', {
      // A code that covers both colliding towns must not be resolved to a guess.
      postalCodeIndex: () => ['夷町', '恵比須町'],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.message).toContain('did not narrow this to one');
  });

  it('reports a genuine ambiguity between two distinct real towns', async () => {
    // 夷町 and 恵比須町, both in Kyoto's Nakagyo ward, both romanize to
    // "Ebisu-cho" — unlike 円山 above, both readings are legitimate.
    const result = await fromRomaji('1-1 Ebisucho, Nakagyo-ku, Kyoto-shi, Kyoto');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('AMBIGUOUS');
    expect(result.candidates?.map((c) => c.town?.ja).sort()).toEqual(['恵比須町', '夷町'].sort());
  });
});

describe('fromRomaji: postal code extraction requires a digit boundary', () => {
  // Same regression as toRomaji's splitPostalCode (see toRomaji.test.ts):
  // tokenize()'s NNN-NNNN pattern had no boundary against an adjacent digit,
  // so "1123-4567 Nishishinjuku, ..." was silently read as postal code
  // 123-4567 plus chome 1, instead of the 4-digit block number 1123-4567 it
  // actually is. The fix makes the address correctly fail to resolve — chome
  // 1123 does not exist — rather than resolving to a wrong, plausible-looking
  // town.
  it('does not carve a postal code out of a 4-digit block number, and refuses instead of guessing', async () => {
    const result = await fromRomaji('1123-4567 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.partial?.postalCode).toBeUndefined();
    expect(result.message).toContain('1123');
  });
});

describe('fromRomaji: building names', () => {
  // Regression: only Japanese-script building names were separated out, so a
  // romaji one — the common case for a western-order address typed by hand —
  // was fed into the town lookup and produced TOWN_NOT_FOUND.
  const expected = { town: '西新宿', chome: 3, blocks: [5, 12] };

  it.each([
    ['building after the street', '3-5-12 Nishishinjuku, Sunshine Building 5F, Shinjuku-ku, Tokyo', 'Sunshine Building 5F'],
    ['building before the street', 'Sunshine Building 5F, 3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo', 'Sunshine Building 5F'],
    ['building with no separating comma', '3-5-12 Nishishinjuku Sunshine Bldg 5F, Shinjuku-ku, Tokyo', 'Sunshine Bldg 5F'],
    ['Japanese building name', '3-5-12 Nishishinjuku, サンプルビル301, Shinjuku-ku, Tokyo', 'サンプルビル301'],
  ])('separates a %s', async (_label, input, building) => {
    const result = await fromRomaji(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe(expected.town);
    expect(result.value.parsed.chome).toBe(expected.chome);
    expect(result.value.parsed.blockNumbers).toEqual(expected.blocks);
    expect(result.value.parsed.unparsed).toBe(building);
  });

  it('still fails when the town itself is unknown, building name or not', async () => {
    const result = await fromRomaji('1-1 Nonexistentplace, Some Building, Shibuya-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
  });

  it('leaves unparsed undefined when there is no building name', async () => {
    const result = await fromRomaji('3-5-12 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.unparsed).toBeUndefined();
  });
});

describe('fromRomaji: town matching does not accept an arbitrary suffix', () => {
  it('rejects a town name with a nonsensical administrative suffix', async () => {
    // Regression: matchTowns() used to strip a municipality-style suffix
    // (shi/ku/gun/machi/mura/...) from the QUERY town name before matching,
    // which let "Uguisudanimura" and "Uguisudanigun" both match 鶯谷町 as if
    // "mura"/"gun" were valid alternate readings of its actual "-cho" suffix.
    for (const suffix of ['mura', 'gun']) {
      const result = await fromRomaji(`2-1 Uguisudani${suffix}, Shibuya-ku, Tokyo`);
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason).toBe('TOWN_NOT_FOUND');
    }
  });

  it('still accepts the real suffix, and the suffix-less stem', async () => {
    const withSuffix = await fromRomaji('2-1 Uguisudanicho, Shibuya-ku, Tokyo');
    expect(withSuffix.ok).toBe(true);
    if (withSuffix.ok) expect(withSuffix.value.parsed.town?.ja).toBe('鶯谷町');

    const stemOnly = await fromRomaji('2-1 Uguisudani, Shibuya-ku, Tokyo');
    expect(stemOnly.ok).toBe(true);
    if (stemOnly.ok) expect(stemOnly.value.parsed.town?.ja).toBe('鶯谷町');
  });
});

describe('fromRomaji: designated-city ward cannot be inferred from one segment', () => {
  it('refuses a bare city name for a city whose records are all per-ward', async () => {
    // 札幌市 has no ward-less record in the dataset — every row is one
    // specific ward. Without the "a single segment can't match a
    // ward-bearing record" guard, "Sapporo-shi" alone matches 中央区's row
    // via its city field (which really is "Sapporo-shi"), silently
    // attributing a ward the caller never wrote.
    const result = await fromRomaji('Sapporo-shi, Hokkaido');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CITY_NOT_FOUND');
  });
});

describe('fromRomaji: refuses rather than guesses', () => {
  it('reports an unknown prefecture', async () => {
    const result = await fromRomaji('1-2-3 Somewhere, Nowhere-ku, Atlantis');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('PREFECTURE_NOT_FOUND');
  });

  it('reports an unknown municipality', async () => {
    const result = await fromRomaji('1-2-3 Somewhere, Nowhere-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('CITY_NOT_FOUND');
  });

  it('reports an unknown town', async () => {
    const result = await fromRomaji('1-2-3 Nonexistentplace, Shibuya-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
  });

  it('fails on empty input', async () => {
    const result = await fromRomaji('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY_INPUT');
  });

  it('rejects a chome that does not exist for a town that has no chome-less entry', async () => {
    // 西新宿 (fixture data) only has chome 1 through 8, and no plain
    // (chome-less) entry. Without the "no such chome" guard, "99-1" would
    // silently be accepted against some arbitrary chome record, with the
    // chome dropped and 99 folded into blockNumbers instead — a fabricated
    // address rather than a refusal.
    const result = await fromRomaji('99-1 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.message).toContain('no chome 99');
  });
});

describe('fromRomaji: privacy guarantee', () => {
  it('performs a full conversion without any network access', async () => {
    const result = await withNetworkBlocked(() =>
      fromRomaji('1-2-3 Uehara, Shibuya-ku, Tokyo'),
    );
    expect(result.ok).toBe(true);
  });
});
