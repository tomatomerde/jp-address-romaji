/**
 * The municipality-collision count published in docs/coverage.md.
 *
 * This one cannot be checked by running it: the figure it produces is measured
 * against the 106 MB national dataset, which CI does not have and no
 * environment behind an allowlist can fetch (see the `Refresh address data and
 * coverage` workflow). So the counting rules are pinned here on a synthetic
 * index instead — the rules are what a regression would break, and every one of
 * them decides whether the published number is 13 or something else.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { measureMunicipalityCollisions, measureTownAmbiguity } from './ambiguity.js';

interface Town {
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
}

interface City {
  code: number;
  county?: string;
  county_k?: string;
  city: string;
  city_k?: string;
  ward?: string;
  ward_k?: string;
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'jp-address-collisions-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeIndex(prefectures: { pref: string; cities: City[] }[]): string {
  writeFileSync(
    join(dir, 'ja.json'),
    JSON.stringify({
      data: prefectures.map((p, i) => ({ code: i + 1, pref: p.pref, cities: p.cities })),
    }),
  );
  return dir;
}

function writeTowns(pref: string, municipality: string, towns: Town[]): string {
  mkdirSync(join(dir, 'ja', pref), { recursive: true });
  writeFileSync(join(dir, 'ja', pref, `${municipality}.json`), JSON.stringify({ data: towns }));
  return dir;
}

describe('measureTownAmbiguity', () => {
  it('leaves a town with no reading out of the denominator', () => {
    // Neither a kana reading nor a romaji field: candidateKeys returns nothing,
    // so matchTowns can never offer this town. Counting it would score it as
    // "unique within its municipality", which is how the published uniqueness
    // share came to include towns the library refuses outright.
    const result = measureTownAmbiguity(
      writeTowns('東京都', '新宿区', [
        { oaza_cho: '西新宿', oaza_cho_k: 'ニシシンジュク' },
        { oaza_cho: '読みなし町' },
      ]),
    );

    expect(result.towns).toBe(1);
    expect(result.fullFormKeys.ownersInvolved).toBe(0);
    expect(result.nationalFullFormKeys.ownersInvolved).toBe(0);
  });

  it('counts two towns that share a spelling in one municipality', () => {
    const result = measureTownAmbiguity(
      writeTowns('京都府', '中京区', [
        { oaza_cho: '夷町', oaza_cho_k: 'エビスチョウ' },
        { oaza_cho: '恵比須町', oaza_cho_k: 'エビスチョウ' },
      ]),
    );

    expect(result.towns).toBe(2);
    // Two keys, not one: エビスチョウ is indexed as both `Ebisucho` and the
    // passport-style `Ebisuchoh`, and the two towns share each of them.
    expect(result.fullFormKeys.ambiguous).toBe(2);
    expect(result.fullFormKeys.ownersInvolved).toBe(2);
  });
});

describe('measureMunicipalityCollisions', () => {
  it('counts a name two prefectures share', () => {
    const result = measureMunicipalityCollisions(
      writeIndex([
        { pref: '北海道', cities: [{ code: 1, city: '伊達市', city_k: 'ダテシ' }] },
        { pref: '福島県', cities: [{ code: 2, city: '伊達市', city_k: 'ダテシ' }] },
      ]),
    );

    expect(result.municipalities).toBe(2);
    expect(result.exact.collidingKeys).toBe(1);
    expect(result.exact.municipalitiesInvolved).toBe(2);
    expect(result.exact.collidingGroups).toBe(1);
    expect(result.exact.sameJapaneseGroups).toBe(1);
    expect(result.exact.collisions[0]?.owners).toEqual(['北海道伊達市', '福島県伊達市']);
    expect(result.exact.collisions[0]?.sameJapanese).toBe(true);
  });

  it('does not count two municipalities in the SAME prefecture', () => {
    // 檜山郡江差町 and 枝幸郡枝幸町 are both "Esashi-cho", and matchMunicipality
    // already returns them as AMBIGUOUS candidates. Resolving the prefecture
    // first — the thing this figure exists to justify — could never have helped.
    const result = measureMunicipalityCollisions(
      writeIndex([
        {
          pref: '北海道',
          cities: [
            { code: 1, county: '檜山郡', county_k: 'ヒヤマグン', city: '江差町', city_k: 'エサシチョウ' },
            { code: 2, county: '枝幸郡', county_k: 'エサシグン', city: '枝幸町', city_k: 'エサシチョウ' },
          ],
        },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(0);
    expect(result.exact.municipalitiesInvolved).toBe(0);
  });

  it('flags a shared reading whose Japanese spelling differs', () => {
    const result = measureMunicipalityCollisions(
      writeIndex([
        { pref: '青森県', cities: [{ code: 1, city: '三沢市', city_k: 'ミサワシ' }] },
        { pref: '秋田県', cities: [{ code: 2, city: '美沢市', city_k: 'ミサワシ' }] },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(1);
    expect(result.exact.sameJapaneseGroups).toBe(0);
    expect(result.exact.collisions[0]?.sameJapanese).toBe(false);
  });

  it('keeps a ward keyed by both segments, the way matchMunicipality demands them', () => {
    // "Chuo-ku" alone is refused by matchesMunicipality for a ward record, so
    // the ward name on its own is not a spelling of the municipality and must
    // not be counted as a national collision.
    const result = measureMunicipalityCollisions(
      writeIndex([
        {
          pref: '北海道',
          cities: [{ code: 1, city: '札幌市', city_k: 'サッポロシ', ward: '中央区', ward_k: 'チュウオウク' }],
        },
        {
          pref: '大阪府',
          cities: [{ code: 2, city: '大阪市', city_k: 'オオサカシ', ward: '中央区', ward_k: 'チュウオウク' }],
        },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(0);
    expect(result.stemInclusive.collidingKeys).toBe(0);
  });

  it('counts one shared name once, however many spellings index it', () => {
    // チョウ carries its own long vowel, so the passport-style spelling
    // `Hidaka-choh` is indexed beside `Hidaka-cho`. Both are the same two
    // towns: counting spellings would report this as two collisions and make
    // the published figure depend on how many long-vowel conventions the
    // matcher accepts.
    const result = measureMunicipalityCollisions(
      writeIndex([
        {
          pref: '北海道',
          cities: [{ code: 1, county: '沙流郡', county_k: 'サルグン', city: '日高町', city_k: 'ヒダカチョウ' }],
        },
        {
          pref: '和歌山県',
          cities: [{ code: 2, county: '日高郡', county_k: 'ヒダカグン', city: '日高町', city_k: 'ヒダカチョウ' }],
        },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(2);
    expect(result.exact.collidingGroups).toBe(1);
    expect(result.exact.municipalitiesInvolved).toBe(2);
  });

  it('separates the stem-inclusive count from the headline one', () => {
    // 府中市 and 府中町 are different names — they only merge once the
    // administrative suffix is stemmed off, which candidateKeys does and
    // exactKeys does not.
    const result = measureMunicipalityCollisions(
      writeIndex([
        { pref: '東京都', cities: [{ code: 1, city: '府中市', city_k: 'フチュウシ' }] },
        { pref: '広島県', cities: [{ code: 2, city: '府中町', city_k: 'フチュウチョウ' }] },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(0);
    expect(result.stemInclusive.collidingKeys).toBe(1);
    expect(result.stemInclusive.municipalitiesInvolved).toBe(2);
  });

  it('counts a county-town by its own name, as one segment', () => {
    // A county-bearing record matches on the town name alone, so two such towns
    // in different prefectures collide even though their counties differ.
    const result = measureMunicipalityCollisions(
      writeIndex([
        {
          pref: '宮城県',
          cities: [{ code: 1, county: '遠田郡', county_k: 'トオダグン', city: '美里町', city_k: 'ミサトマチ' }],
        },
        {
          pref: '埼玉県',
          cities: [{ code: 2, county: '児玉郡', county_k: 'コダマグン', city: '美里町', city_k: 'ミサトマチ' }],
        },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(1);
    expect(result.exact.collisions[0]?.owners).toEqual(['埼玉県児玉郡美里町', '宮城県遠田郡美里町']);
    // Same name, different counties. The county disambiguates for a reader but
    // is not part of the name, so this is an identical-names collision.
    expect(result.exact.sameJapaneseGroups).toBe(1);
    expect(result.exact.collisions[0]?.sameJapanese).toBe(true);
  });

  it('treats mutually confusable municipalities as one group, not one per spelling', () => {
    // 江南市 (コウナンシ) is written both `Konan-shi` and `Kohnan-shi`; 湖南市
    // (コナンシ) only the former. The owner sets differ, but all three can be
    // confused with one another — one collision, not two.
    const result = measureMunicipalityCollisions(
      writeIndex([
        { pref: '愛知県', cities: [{ code: 1, city: '江南市', city_k: 'コウナンシ' }] },
        { pref: '滋賀県', cities: [{ code: 2, city: '湖南市', city_k: 'コナンシ' }] },
        { pref: '高知県', cities: [{ code: 3, city: '香南市', city_k: 'コウナンシ' }] },
      ]),
    );

    expect(result.exact.collidingKeys).toBe(2);
    expect(result.exact.collidingGroups).toBe(1);
    expect(result.exact.municipalitiesInvolved).toBe(3);
    // The component mixes three different names, so it is not an identical-names case.
    expect(result.exact.sameJapaneseGroups).toBe(0);
  });
});
