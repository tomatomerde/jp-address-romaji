import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { toFormat } from '../src/formats/index.js';
import { parse, detectScript } from '../src/parse.js';
import type { ParsedAddress } from '../src/types.js';
import { useFixtureData } from './helpers.js';

beforeAll(() => useFixtureData());

async function parsedFixture(): Promise<ParsedAddress> {
  const result = await toRomaji('〒151-0064 東京都渋谷区上原1-2-3 サンプルビル301');
  if (!result.ok) throw new Error(`fixture setup failed: ${result.reason}`);
  return result.value.parsed;
}

describe('toFormat', () => {
  it('maps to the Google libaddressinput shape', async () => {
    const value = toFormat(await parsedFixture(), 'google-i18n');
    expect(value.regionCode).toBe('JP');
    expect(value.postalCode).toBe('151-0064');
    expect(value.administrativeArea).toBe('Tokyo');
    expect(value.locality).toBe('Shibuya-ku');
    expect(value.sublocality).toBe('Uehara');
    expect(value.addressLines[0]).toBe('1-2-3 Uehara');
    // The building name is passed through, not translated.
    expect(value.addressLines[1]).toBe('サンプルビル301');
  });

  it('maps to the Shopify shape', async () => {
    const value = toFormat(await parsedFixture(), 'shopify');
    expect(value.address1).toBe('1-2-3 Uehara');
    expect(value.address2).toBe('サンプルビル301');
    expect(value.city).toBe('Shibuya-ku');
    expect(value.province).toBe('Tokyo');
    expect(value.zip).toBe('151-0064');
    expect(value.countryCode).toBe('JP');
  });

  it('maps to the Stripe shape', async () => {
    const value = toFormat(await parsedFixture(), 'stripe');
    expect(value.line1).toBe('1-2-3 Uehara');
    expect(value.line2).toBe('サンプルビル301');
    expect(value.city).toBe('Shibuya-ku');
    expect(value.state).toBe('Tokyo');
    expect(value.postal_code).toBe('151-0064');
    expect(value.country).toBe('JP');
  });

  it('includes the ward for a designated city', async () => {
    const result = await toRomaji('北海道札幌市中央区大通西1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = toFormat(result.value.parsed, 'stripe');
    expect(value.city).toBe('Chuo-ku, Sapporo-shi');
    expect(value.state).toBe('Hokkaido');
  });

  it('omits absent optional fields rather than emitting empty strings', async () => {
    const result = await toRomaji('東京都渋谷区上原1-2-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = toFormat(result.value.parsed, 'shopify');
    expect(value.address2).toBeUndefined();
    expect(value.zip).toBeUndefined();
  });
});

describe('parse', () => {
  it('detects the script', () => {
    expect(detectScript('東京都渋谷区上原1-2-3')).toBe('japanese');
    expect(detectScript('1-2-3 Uehara, Shibuya-ku, Tokyo')).toBe('romaji');
  });

  it('parses Japanese input', async () => {
    const result = await parse('東京都渋谷区上原1-2-3');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.town?.ja).toBe('上原');
    expect(result.value.town?.romaji).toBe('Uehara');
  });

  it('parses romaji input', async () => {
    const result = await parse('1-2-3 Uehara, Shibuya-ku, Tokyo');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.town?.ja).toBe('上原');
    expect(result.value.chome).toBe(1);
  });

  it('propagates failures from either direction', async () => {
    const result = await parse('青森県青森市大字三内1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_ROMAJI_DATA');
  });
});
