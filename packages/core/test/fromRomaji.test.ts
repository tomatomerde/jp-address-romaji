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
