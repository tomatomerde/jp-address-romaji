import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji, extractPostalCode } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { useFixtureData, withNetworkBlocked } from './helpers.js';

beforeAll(() => useFixtureData());

describe('toRomaji: normalization handled upstream', () => {
  // These four spellings of one address must all converge. The normalization
  // itself is @geolonia/normalize-japanese-addresses' job; this asserts we
  // wired it up correctly rather than reimplementing any of it.
  const equivalent = [
    '東京都渋谷区上原1-2-3',
    '東京都渋谷区上原一丁目2番3号',
    '東京都渋谷区上原１ー２ー３',
    '渋谷区上原1-2-3',
  ];

  it.each(equivalent)('normalizes %s identically', async (input) => {
    const result = await toRomaji(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-2-3 Uehara, Shibuya-ku, Tokyo, Japan');
  });
});

describe('toRomaji: chome folds into the block numbers', () => {
  it('renders 西新宿二丁目8番1号 as 2-8-1', async () => {
    const result = await toRomaji('東京都新宿区西新宿二丁目8番1号');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('2-8-1 Nishishinjuku, Shinjuku-ku, Tokyo, Japan');
    expect(result.value.parsed.chome).toBe(2);
    expect(result.value.parsed.blockNumbers).toEqual([8, 1]);
  });
});

describe('toRomaji: designated cities and counties', () => {
  it('orders ward before city', async () => {
    const result = await toRomaji('北海道札幌市中央区大通西1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain('Chuo-ku, Sapporo-shi, Hokkaido');
  });

  it('reads 町 as machi where the dataset says so', async () => {
    const result = await toRomaji('新潟県三島郡出雲崎町大字米田1');
    if (result.ok) {
      // The reading comes from the dataset, never from a guess.
      expect(result.value.formatted).toContain('Izumozaki-machi');
      expect(result.value.formatted).toContain('Santo-gun');
    } else {
      // Acceptable only as an explicit, typed refusal.
      expect(['NO_ROMAJI_DATA', 'TOWN_NOT_FOUND']).toContain(result.reason);
    }
  });
});

describe('toRomaji: building names are never romanized', () => {
  it('keeps the building name verbatim', async () => {
    const result = await toRomaji('東京都渋谷区鶯谷町2-1 サンプルビル301');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.unparsed).toBe('サンプルビル301');
    expect(result.value.formatted).toContain('サンプルビル301');
  });

  it('can omit the building name from the rendered line', async () => {
    const result = await toRomaji('東京都渋谷区鶯谷町2-1 サンプルビル301', {
      includeUnparsed: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).not.toContain('サンプルビル');
    // Still preserved in the structure, just not rendered.
    expect(result.value.parsed.unparsed).toBe('サンプルビル301');
  });

  it('round-trips through fromRomaji instead of corrupting the town match', async () => {
    // Regression: the building name used to be prepended in front of the
    // street segment with no way for fromRomaji to tell it apart, so
    // "サンプルビル301, 1-2-3 Uehara, ..." was parsed as if "サンプルビル301"
    // were part of the town name and failed with TOWN_NOT_FOUND.
    const forward = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3 サンプルビル301');
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;

    const back = await fromRomaji(forward.value.formatted);
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.parsed.town?.ja).toBe('上原');
    expect(back.value.parsed.chome).toBe(1);
    expect(back.value.parsed.blockNumbers).toEqual([2, 3]);
    expect(back.value.parsed.unparsed).toBe('サンプルビル301');
  });

  it('places the building name after the street for Japanese order, not before', async () => {
    const western = await toRomaji('東京都渋谷区上原1-2-3 サンプルビル301');
    expect(western.ok).toBe(true);
    if (western.ok) expect(western.value.formatted.startsWith('サンプルビル301,')).toBe(true);

    const japanese = await toRomaji('東京都渋谷区上原1-2-3 サンプルビル301', { order: 'japanese' });
    expect(japanese.ok).toBe(true);
    if (!japanese.ok) return;
    expect(japanese.value.formatted).toBe('Tokyo, Shibuya-ku, Uehara 1-2-3, サンプルビル301, Japan');
  });
});

describe('toRomaji: refuses rather than fabricates', () => {
  it('fails with NO_ROMAJI_DATA for a rural oaza lacking readings', async () => {
    // 大字三内 with nothing after it but the block numbers. The `字丸山` this
    // used to carry names a koaza the (deliberately sparse, v1-derived)
    // fixture does not have, and unmatched text between the town and the
    // block numbers is now refused as TOWN_NOT_FOUND before the reading is
    // ever looked at — see townPrefixLeftover.test.ts. Kept here without it so
    // this test still exercises the missing-reading path it is named for.
    const result = await toRomaji('青森県青森市大字三内1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_ROMAJI_DATA');
    // The components that WERE resolved are still reported.
    expect(result.partial?.prefecture?.romaji).toBe('Aomori');
    expect(result.partial?.city?.romaji).toBe('Aomori-shi');
  });

  it('refuses the koaza-bearing spelling of the same address rather than dropping it', async () => {
    // `字丸山` is real text the caller wrote and the fixture cannot match, so
    // it is unmatched ADDRESS text, not a building name. Answering would mean
    // either dropping it or printing it as a building; both name a different
    // place. This is the input the test above used to use.
    const result = await toRomaji('青森県青森市大字三内字丸山1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.message).toContain('字丸山');
  });

  it('rejects corrupt dataset romaji instead of emitting a bare number', async () => {
    // Asahikawa entries whose romaji collapsed to "10" etc. in the source data.
    const result = await toRomaji('北海道旭川市一条通十丁目1');
    if (result.ok) {
      // If it succeeds, it must not be a bare number masquerading as a name.
      expect(result.value.parsed.town?.romaji).not.toMatch(/^\d+$/);
      expect(result.value.formatted).toMatch(/[A-Za-z]{2,}/);
    } else {
      expect(['NO_ROMAJI_DATA', 'CORRUPT_ROMAJI_DATA', 'TOWN_NOT_FOUND']).toContain(result.reason);
    }
  });

  it('reports a Kyoto street address whose town is not in the dataset', async () => {
    // 函谷鉾町 is absent from the fixtures, so this exercises the diagnosis
    // path: the street phrase was understood, the town was not.
    const result = await toRomaji('京都府京都市中京区四条通烏丸東入ル函谷鉾町');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('KYOTO_STREET_ADDRESS');
    expect(result.partial?.kyotoStreet).toBe('四条通烏丸東入ル');
  });

  it('reports an unknown town rather than inventing one', async () => {
    const result = await toRomaji('東京都渋谷区存在しない町1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
  });

  it('fails on empty input', async () => {
    const result = await toRomaji('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('EMPTY_INPUT');
  });
});

describe('toRomaji: Kyoto street-name addresses', () => {
  // The danger these guard against: street names carry the same kanji numerals
  // as chome, so passing `烏丸通四条上ル笋町` to the normalizer unchanged makes
  // it read the 四 of 四条 as chome 4 and resolve to an unrelated place.
  it.each([
    ['京都府京都市中京区烏丸通四条上ル笋町123', '烏丸通四条上ル', '笋町', 123],
    ['京都府京都市中京区寺町通御池上る上本能寺前町488', '寺町通御池上る', '上本能寺前町', 488],
  ])('resolves %s', async (input, street, town, number) => {
    const result = await toRomaji(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe(town);
    expect(result.value.parsed.blockNumbers).toEqual([number]);
    // Never misread as a chome.
    expect(result.value.parsed.chome).toBeUndefined();
    // The street phrase is preserved, but not romanized or rendered.
    expect(result.value.parsed.kyotoStreet).toBe(street);
    expect(result.value.formatted).not.toContain(street);
  });

  it('leaves a plain Kyoto address without a street phrase alone', async () => {
    const result = await toRomaji('京都府京都市中京区笋町123');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.town?.ja).toBe('笋町');
    expect(result.value.parsed.kyotoStreet).toBeUndefined();
  });

  it('does not treat non-Kyoto addresses as street addresses', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.kyotoStreet).toBeUndefined();
  });
});

describe('toRomaji: options', () => {
  it('defaults to passport Hepburn with no long-vowel marks', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain('Tokyo');
    expect(result.value.formatted).not.toMatch(/[ōŌ]/);
  });

  it('supports macrons, sourced from kana', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3', { longVowel: 'macron' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain('Tōkyō');
  });

  it('supports the passport OH convention', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3', { longVowel: 'oh' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain('Tohkyoh');
  });

  it('supports circumflex without breaking title-casing mid-word', async () => {
    // Regression: titleCase()'s word-character class did not include Latin-1
    // Supplement letters (â, ô, ...), so a circumflexed word like "tôkyô" was
    // split into two "words" at the accented vowel and title-cased as
    // "TôKyô" instead of "Tôkyô".
    const result = await toRomaji('東京都渋谷区鶯谷町2-1', { longVowel: 'circumflex' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain('Tôkyô');
    expect(result.value.formatted).not.toContain('TôKyô');
    expect(result.value.formatted).toContain('Uguisudanichô');
  });

  it('supports Japanese order', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3', { order: 'japanese' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('Tokyo, Shibuya-ku, Uehara 1-2-3, Japan');
  });

  it('places the postal code as requested', async () => {
    const suffix = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3');
    expect(suffix.ok).toBe(true);
    if (!suffix.ok) return;
    expect(suffix.value.formatted).toContain('151-0064');
    expect(suffix.value.parsed.postalCode).toBe('151-0064');

    const omitted = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3', { postalCode: 'omit' });
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) return;
    expect(omitted.value.formatted).not.toContain('151-0064');
  });

  it('can drop the country suffix and upper-case the line', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3', {
      includeCountry: false,
      capitalization: 'upper',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-2-3 UEHARA, SHIBUYA-KU, TOKYO');
  });
});

describe('toRomaji: postal code extraction requires a digit boundary', () => {
  // Regression: the `NNN-NNNN` postal-code pattern had no guard against
  // being adjacent to other digits, so it silently carved a fake postal
  // code out of any nearby run of digits and a hyphen — a phone number, or
  // a 4-digit block number followed by more numbers. Both are ordinary text,
  // not typos, so the old behavior was a silent corruption, not a refusal.

  it('does not carve a postal code out of a phone number, and does not truncate the building name', async () => {
    const result = await toRomaji('東京都新宿区西新宿2-8-1 新宿ビル TEL03-1234-5678');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.postalCode).toBeUndefined();
    expect(result.value.parsed.chome).toBe(2);
    expect(result.value.parsed.blockNumbers).toEqual([8, 1]);
    expect(result.unparsed).toBe('新宿ビル TEL03-1234-5678');
    expect(result.value.formatted).toContain('TEL03-1234-5678');
  });

  it('does not misread a 4-digit block number as a postal code plus chome 1', async () => {
    const result = await toRomaji('東京都新宿区西新宿1123-4567');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.postalCode).toBeUndefined();
    expect(result.value.parsed.chome).toBe(1);
    expect(result.value.parsed.blockNumbers).toEqual([123, 4567]);
  });

  it('extractPostalCode ignores an NNN-NNNN run glued to a preceding digit', () => {
    expect(extractPostalCode('新宿区西新宿1123-4567')).toBeUndefined();
  });

  it('extractPostalCode ignores an NNN-NNNN run inside a longer hyphenated phone number', () => {
    // A digit-only front boundary is not enough on its own: "090-1234" is
    // NNN-NNNN with nothing but another hyphen after it, which a digit-only
    // back boundary would accept. The back boundary must reject an adjacent
    // hyphen too.
    expect(extractPostalCode('TEL:090-1234-5678')).toBeUndefined();
  });

  it('extractPostalCode still finds an isolated, legitimately bounded postal code', () => {
    expect(extractPostalCode('〒151-0064 東京都渋谷区上原1-2-3')).toBe('151-0064');
    expect(extractPostalCode('東京都渋谷区上原1-2-3 160-0023')).toBe('160-0023');
  });
});

describe('toRomaji: privacy guarantee', () => {
  it('performs a full conversion without any network access', async () => {
    const result = await withNetworkBlocked(() => toRomaji('東京都渋谷区上原1-2-3'));
    expect(result.ok).toBe(true);
  });
});
