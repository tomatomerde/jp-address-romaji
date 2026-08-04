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

  it('excludes a corrupt dataset entry from candidates instead of manufacturing ambiguity', async () => {
    // 円山's own kana/romaji are corrupt copies of 円山西町's (see
    // isPlausibleReading). Before that check was applied here too, this
    // input matched BOTH entries and returned AMBIGUOUS for an address that
    // genuinely has only one real match.
    const result = await fromRomaji('1-1 Maruyamanishimachi, Chuo-ku, Sapporo-shi, Hokkaido');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('円山西町');
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
});

describe('fromRomaji: privacy guarantee', () => {
  it('performs a full conversion without any network access', async () => {
    const result = await withNetworkBlocked(() =>
      fromRomaji('1-2-3 Uehara, Shibuya-ku, Tokyo'),
    );
    expect(result.ok).toBe(true);
  });
});
