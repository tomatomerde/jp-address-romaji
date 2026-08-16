/**
 * Integration tests against a real, fully-built dataset.
 *
 * The rest of the suite runs on the committed fixtures: fast, hermetic, and
 * enough to pin behaviour. But fixtures are a curated subset, and the defects
 * that have actually bitten this library were ones the fixtures did not
 * contain — the `大字` prefix appearing in the kana, and town romaji whose
 * trailing digit is part of the name. Those only showed up when the checks ran
 * over all 638,567 entries.
 *
 * So this file runs only when a real dataset is present, pointed at by
 * `JP_ADDRESS_ROMAJI_DATA_DIR`. Without it every test here is skipped, which
 * keeps `pnpm test` hermetic for contributors who have not built the data.
 *
 *   npx tsx packages/data/src/build-data.ts --out ./address-data
 *   JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test
 */

import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { configureDataSource } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';

const dataDir = process.env['JP_ADDRESS_ROMAJI_DATA_DIR'];
const available = Boolean(dataDir && fs.existsSync(path.join(path.resolve(dataDir), 'ja.json')));

describe.skipIf(!available)('real dataset', () => {
  beforeAll(() => {
    clearDataCache();
    configureDataSource({ dataDir: path.resolve(dataDir!) });
  });

  // Rural addresses were the weak point in the older v1 data (3.62% coverage
  // for 大字-prefixed names). In v2 they are ~99.96% covered, so these must
  // convert rather than fail.
  it.each([
    ['北海道稚内市大字稚内村', 'Wakkanai'],
    ['北海道留萌市大字三泊村', 'Rumoi'],
  ])('romanizes the rural address %s', async (input, expectedCity) => {
    const result = await toRomaji(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toContain(expectedCity);
    // The 大字 prefix must not leak into the romanized town name, and the
    // town must be spelled out rather than reduced to a bare number.
    expect(result.value.parsed.town?.romaji).toMatch(/^[A-Za-zÀ-ÖØ-öø-ſ' ]/);
  });

  it('keeps a trailing digit that is part of the town name', async () => {
    // 政和第一 romanizes as "Seiwadai1"; the digit is the 第一, not a chome.
    const result = await toRomaji('北海道雨竜郡幌加内町字政和第一1');
    if (result.ok) {
      expect(result.value.parsed.town?.romaji?.toLowerCase()).toContain('seiwadai1');
    } else {
      // Acceptable only as an explicit refusal, never as a truncated name.
      expect(['NO_ROMAJI_DATA', 'TOWN_NOT_FOUND', 'CORRUPT_ROMAJI_DATA']).toContain(result.reason);
    }
  });

  it('round-trips ordinary urban addresses', async () => {
    const cases = [
      '東京都新宿区西新宿三丁目5番12号',
      '東京都渋谷区上原1-2-3',
      '北海道札幌市中央区大通西1-1',
      '大阪府大阪市北区梅田1-1-1',
    ];
    for (const input of cases) {
      const forward = await toRomaji(input);
      expect(forward.ok, `${input} should romanize`).toBe(true);
      if (!forward.ok) continue;

      const back = await fromRomaji(forward.value.formatted);
      expect(back.ok, `${forward.value.formatted} should reverse`).toBe(true);
      if (!back.ok) continue;

      expect(back.value.parsed.prefecture?.ja).toBe(forward.value.parsed.prefecture?.ja);
      expect(back.value.parsed.town?.ja).toBe(forward.value.parsed.town?.ja);
      expect(back.value.parsed.chome).toBe(forward.value.parsed.chome);
    }
  });

  // Both halves of the koaza rule are documented in the README by name, and
  // both have been wrong there: 0.1.5 changed the refusing half and left the
  // README showing `Sanchomeoyoko`, an output the shipped dataset cannot
  // produce. Pin the two examples so the prose cannot drift from the code
  // again without a test going red.
  describe('the koaza examples in the README', () => {
    it('romanizes a koaza whose reading covers the whole name', async () => {
      const result = await toRomaji('三重県伊賀市西明寺字天津川1-1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.formatted).toBe('1-1 Azamatsugawa Saimyoji, Iga-shi, Mie, Japan');
      expect(result.value.parsed.koaza).toEqual({
        ja: '字天津川',
        kana: 'アザアマツガワ',
        romaji: 'Azamatsugawa',
      });
    });

    it('refuses when the reading stops short of the whole name', async () => {
      const result = await toRomaji('長野県飯田市本町三丁目大横1-1');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('KOAZA_READING_INCOMPLETE');
    });
  });

  it('still refuses Kyoto street-name addresses', async () => {
    const result = await toRomaji('京都府京都市中京区四条通烏丸東入ル函谷鉾町');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('KYOTO_STREET_ADDRESS');
  });

  describe('long-vowel styles refuse what the default style refuses', () => {
    // Regression: 茨城県東茨城郡大洗町's oaza_cho_k for サンビーチ carries a
    // full-width hyphen (NFKC-folds to ASCII '-') in place of a choonpu. The
    // default style correctly refuses it via kanaToRomaji/isTransliterableKana,
    // but the macron/circumflex/oh styles used to call analyzeKana directly
    // and skip that check, silently emitting "Sambi-Chi" instead of refusing.
    const address = '茨城県東茨城郡大洗町サンビーチ1-1';

    it.each(['none', 'macron', 'circumflex', 'oh'] as const)(
      'refuses under longVowel=%s',
      async (longVowel) => {
        const result = await toRomaji(address, { longVowel });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.reason).toBe('NO_ROMAJI_DATA');
      },
    );
  });

  describe('long-vowel styles keep an embedded digit that is part of the name', () => {
    // 北海道札幌市北区北十条西: the block number lives inside the kana reading
    // itself (キタ１０ジョウニシ). This must keep converting under every
    // style — the digit-tolerance in isTransliterableKana exists specifically
    // so this large, ordinary slice of Sapporo addresses is not refused.
    const address = '北海道札幌市北区北十条西一丁目1-1';

    // The 'none' style is sourced from the dataset's own romaji field
    // (which spells the suffix with a hyphen: "Kita10-Jonishi"); the
    // long-vowel styles are sourced from the kana reading instead (which has
    // no such separator), so the exact spelling differs slightly between
    // them — what matters here is that none of the four refuses.
    it.each([
      ['none', 'Kita10-Jonishi'],
      ['macron', 'Kita10Jōnishi'],
      ['circumflex', 'Kita10Jônishi'],
      ['oh', 'Kita10Johnishi'],
    ] as const)('romanizes under longVowel=%s', async (longVowel, expectedTown) => {
      const result = await toRomaji(address, { longVowel });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.formatted).toContain(expectedTown);
    });
  });
});
