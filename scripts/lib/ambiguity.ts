/**
 * The ambiguity measurements the README, CLAUDE.md and the API docs quote.
 *
 * Split out of `scripts/measure-ambiguity.ts` so that
 * `scripts/measure-coverage.ts` — which generates `docs/coverage.md`, the one
 * place these figures are published from — can import them instead of
 * re-implementing them. Both entry points therefore measure the same thing,
 * with the matcher's own key functions (`candidateKeys`, `exactKeys`,
 * `isPlausibleReading`), against a real dataset.
 *
 * Nothing here reads `process.argv` or prints: the callers own that.
 */

import fs from 'node:fs';
import path from 'node:path';
import { candidateKeys, exactKeys } from '../../packages/core/src/fromRomaji.js';
import { normalizeRomajiKey } from '../../packages/core/src/data/prefectures.js';
import { kanaToRomaji } from '../../packages/core/src/romaji/hepburn.js';
import { isPlausibleReading } from '../../packages/core/src/romaji/validate.js';

interface MachiAzaRecord {
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
}

interface CityRecord {
  county?: string;
  county_k?: string;
  county_r?: string;
  city: string;
  city_k?: string;
  city_r?: string;
  ward?: string;
  ward_k?: string;
  ward_r?: string;
}

interface PrefectureRecord {
  pref: string;
  cities: CityRecord[];
}

/** One "keys mapping to >= 2 owners" tally. */
export interface Tally {
  /** Keys that more than one distinct owner answers to. */
  ambiguous: number;
  /** Keys in the population. */
  keys: number;
  /** Owners involved in at least one such collision. */
  ownersInvolved: number;
}

export interface TownAmbiguity {
  municipalityFiles: number;
  /** Distinct `oaza_cho` names, counted per municipality, with a usable reading. */
  towns: number;
  /** Every key `fromRomaji` indexes, including the stemmed short forms. */
  allKeys: Tally;
  /** Only the unstemmed spellings — what writing the full town name resolves to. */
  fullFormKeys: Tally;
  /**
   * The same full-form keys pooled across the whole country, so a town counts
   * as colliding when any town in any other municipality shares its spelling.
   *
   * This is the "far less so nationally" half of the sentence the README has
   * always paired with the within-municipality figure: without it, the
   * comparison the prefecture-first resolution order rests on is an assertion.
   */
  nationalFullFormKeys: Tally;
}

/** One municipality name that more than one prefecture answers to. */
export interface MunicipalityCollision {
  /** The romanization, rendered the way a caller would write it. */
  romaji: string;
  /** Every municipality that answers to it, as `都道府県 + 市区町村`. */
  owners: string[];
  /** True when the colliding municipalities are also spelled the same in Japanese. */
  sameJapanese: boolean;
}

export interface MunicipalityCollisions {
  /** Municipality records in the index (one per city, ward or county-town). */
  municipalities: number;
  /** Collisions on the full reading — the same name, written out. */
  exact: {
    keys: number;
    collidingKeys: number;
    /**
     * Distinct GROUPS of mutually confusable municipalities — the headline
     * figure, and the one the prose means by "names that collide".
     *
     * Not the same as `collidingKeys`: one name is usually indexed under more
     * than one accepted spelling (`Mihama-cho` and the passport-style
     * `Mihama-choh` are the same four towns), and counting spellings would
     * make the number depend on how many long-vowel conventions the matcher
     * accepts rather than on how much ambiguity there is.
     *
     * Nor is it the count of distinct owner sets, which has the same problem
     * one step removed: `Konan-shi` is 江南市/湖南市/香南市 while `Kohnan-shi`
     * is only 江南市/香南市, and those are not two independent collisions —
     * all three municipalities can be confused with one another. So the
     * grouping is by connected component over "shares at least one spelling".
     */
    collidingGroups: number;
    municipalitiesInvolved: number;
    /** Of `collidingGroups`, those whose members are also spelled the same in Japanese. */
    sameJapaneseGroups: number;
    /** Every colliding key, sorted; the caller decides how many to show. */
    collisions: MunicipalityCollision[];
  };
  /** The same count once the administrative suffix may be stemmed away. */
  stemInclusive: {
    keys: number;
    collidingKeys: number;
    municipalitiesInvolved: number;
  };
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

/** Unstemmed spellings only: what a full town name normalizes to. */
function fullFormKeys(kana?: string, romajiField?: string): Set<string> {
  const keys = new Set<string>();
  const add = (v: string | undefined) => {
    if (v) keys.add(normalizeRomajiKey(v));
  };
  add(romajiField);
  if (kana) {
    add(kanaToRomaji(kana, 'none'));
    add(kanaToRomaji(kana, 'macron'));
    add(kanaToRomaji(kana, 'oh'));
  }
  keys.delete('');
  return keys;
}

/**
 * How often a town's romanization matches more than one town in the same
 * municipality — the figure `fromRomaji`'s outside-in resolution is built for.
 *
 * Walks every municipality file, so this is the expensive one: the shipped
 * dataset is about 106 MB across 1,898 files.
 */
export function measureTownAmbiguity(dataDir: string): TownAmbiguity {
  const jaDir = path.join(dataDir, 'ja');
  let municipalityFiles = 0;
  let towns = 0;
  const all: Tally = { ambiguous: 0, keys: 0, ownersInvolved: 0 };
  const full: Tally = { ambiguous: 0, keys: 0, ownersInvolved: 0 };
  // One national pool, keyed the same way but with owners identified across
  // municipality boundaries. Holds every town at once, which is why it is a
  // Map of Sets rather than a running count: "towns involved" cannot be summed
  // per file when the collisions cross files.
  const national = new Map<string, Set<string>>();

  for (const pref of fs.readdirSync(jaDir)) {
    for (const cityFile of fs.readdirSync(path.join(jaDir, pref))) {
      const { data } = readJson<{ data: MachiAzaRecord[] }>(path.join(jaDir, pref, cityFile));
      municipalityFiles++;

      // One unit per distinct oaza_cho name: chome records of the same name are
      // one town. Records the matcher skips (no oaza_cho, implausible reading)
      // are skipped here for the same reason — matchTowns never offers them.
      const townAll = new Map<string, Set<string>>();
      const townFull = new Map<string, Set<string>>();
      for (const r of data) {
        if (!r.oaza_cho) continue;
        if (r.oaza_cho_k && !isPlausibleReading(r.oaza_cho, r.oaza_cho_k)) continue;
        const accAll = townAll.get(r.oaza_cho) ?? new Set<string>();
        for (const k of candidateKeys(r.oaza_cho_k, r.oaza_cho_r)) accAll.add(k);
        townAll.set(r.oaza_cho, accAll);
        const accFull = townFull.get(r.oaza_cho) ?? new Set<string>();
        for (const k of fullFormKeys(r.oaza_cho_k, r.oaza_cho_r)) accFull.add(k);
        townFull.set(r.oaza_cho, accFull);
      }

      // A record with neither a kana reading nor a romaji field produces no
      // keys at all. `matchTowns` can never offer such a town, so counting it
      // in the denominator scored it as "unique" and inflated both uniqueness
      // shares. (Inherited from the first version of this script — the figures
      // it published were wrong by the share of reading-less entries.)
      for (const [ja, keys] of [...townAll]) if (keys.size === 0) {
        townAll.delete(ja);
        townFull.delete(ja);
      }

      for (const [ja, keys] of townFull) {
        const owner = `${pref}/${cityFile}/${ja}`;
        for (const k of keys) {
          const owners = national.get(k) ?? new Set<string>();
          owners.add(owner);
          national.set(k, owners);
        }
      }

      towns += townAll.size;
      for (const [byTown, into] of [
        [townAll, all],
        [townFull, full],
      ] as const) {
        const tallied = tally(byTown);
        into.keys += tallied.keys;
        into.ambiguous += tallied.ambiguous;
        into.ownersInvolved += tallied.ownersInvolved;
      }
    }
  }

  const nationalInvolved = new Set<string>();
  let nationalAmbiguous = 0;
  for (const owners of national.values()) {
    if (owners.size > 1) {
      nationalAmbiguous++;
      for (const o of owners) nationalInvolved.add(o);
    }
  }

  return {
    municipalityFiles,
    towns,
    allKeys: all,
    fullFormKeys: full,
    nationalFullFormKeys: {
      ambiguous: nationalAmbiguous,
      keys: national.size,
      ownersInvolved: nationalInvolved.size,
    },
  };
}

/** Count keys owned by more than one of the given owners. */
function tally(byOwner: Map<string, Set<string>>): Tally {
  const byKey = new Map<string, Set<string>>();
  for (const [owner, keys] of byOwner) {
    for (const k of keys) {
      const owners = byKey.get(k) ?? new Set<string>();
      owners.add(owner);
      byKey.set(k, owners);
    }
  }
  const involved = new Set<string>();
  let ambiguous = 0;
  for (const owners of byKey.values()) {
    if (owners.size > 1) {
      ambiguous++;
      for (const o of owners) involved.add(o);
    }
  }
  return { keys: byKey.size, ambiguous, ownersInvolved: involved.size };
}

/**
 * How a caller can write one municipality, in the shapes `matchMunicipality`
 * accepts — mirroring `matchesMunicipality` in fromRomaji.ts:
 *
 * - a ward record needs both segments (`Chuo-ku, Sapporo-shi`): "Chuo-ku"
 *   alone is refused there, so it is not a spelling of that municipality here;
 * - any other record is matched by its own name alone, and a county-bearing
 *   one may additionally be written with the county (`Izumozaki-machi,
 *   Santo-gun`).
 *
 * Multi-segment forms are joined with a separator that cannot occur in a
 * normalized key, so a two-segment spelling can never be counted as colliding
 * with a one-segment one.
 */
function municipalityQueryForms(
  record: CityRecord,
  keysOf: (kana?: string, romaji?: string, ja?: string) => Set<string>,
): Set<string> {
  const city = keysOf(record.city_k, record.city_r, record.city);
  const forms = new Set<string>();
  if (record.ward) {
    for (const w of keysOf(record.ward_k, record.ward_r, record.ward)) {
      for (const c of city) forms.add(`${w}, ${c}`);
    }
    return forms;
  }
  for (const c of city) forms.add(c);
  if (record.county) {
    for (const c of city) {
      for (const g of keysOf(record.county_k, record.county_r, record.county)) {
        forms.add(`${c}, ${g}`);
      }
    }
  }
  return forms;
}

/** `都道府県 + 市区町村`, the way the collision list names an owner. */
function municipalityLabel(pref: string, record: CityRecord): string {
  return `${pref}${record.county ?? ''}${record.city}${record.ward ?? ''}`;
}

/**
 * The municipality's own Japanese name, for telling a same-name collision from
 * a same-reading one.
 *
 * The county is deliberately NOT included, though {@link municipalityLabel}
 * shows it: 宮城県遠田郡美里町 and 埼玉県児玉郡美里町 are the same name, 美里町,
 * and calling them merely same-sounding because their counties differ would
 * report the wrong thing. The ward IS included, because a ward record is only
 * ever matched as ward-plus-city, so 中央区札幌市 is the name in question.
 */
function municipalityJa(record: CityRecord): string {
  return `${record.city}${record.ward ?? ''}`;
}

/**
 * How many municipality names are shared across prefectures — the reason
 * `fromRomaji` resolves the prefecture before anything else.
 *
 * Only cross-prefecture collisions count. Two municipalities in the same
 * prefecture that romanize alike (檜山郡江差町 and 枝幸郡枝幸町 are both
 * "Esashi-cho") are a real ambiguity, but not one the prefecture-first order
 * could ever have resolved, and `matchMunicipality` already returns them as
 * AMBIGUOUS candidates.
 *
 * Two populations, for the same reason the town figures come in two:
 *
 * - `exact` uses `exactKeys`, the readings a municipality is actually written
 *   with. This is "the same name" in the sense the prose means it: 北海道伊達市
 *   and 福島県伊達市 are both written `Date-shi`.
 * - `stemInclusive` uses `candidateKeys`, which also indexes the form with the
 *   administrative suffix stemmed off. That folds together names that are not
 *   the same name (広島県府中市 and 広島県安芸郡府中町 both reduce to `Fuchu`),
 *   so it is the wider figure, not the headline one.
 *
 * Reads only the prefecture index (`ja.json`), so this is cheap.
 */
export function measureMunicipalityCollisions(dataDir: string): MunicipalityCollisions {
  const index = readJson<{ data: PrefectureRecord[] }>(path.join(dataDir, 'ja.json'));

  // key -> prefecture -> the municipalities in it that answer to that key.
  const byLabelJa = new Map<string, string>();

  const gather = (keysOf: (kana?: string, romaji?: string, ja?: string) => Set<string>) => {
    const byKey = new Map<string, Map<string, { label: string; ja: string }[]>>();
    let municipalities = 0;
    for (const pref of index.data) {
      for (const record of pref.cities) {
        municipalities++;
        const owner = { label: municipalityLabel(pref.pref, record), ja: municipalityJa(record) };
        byLabelJa.set(owner.label, owner.ja);
        for (const form of municipalityQueryForms(record, keysOf)) {
          const byPref = byKey.get(form) ?? new Map<string, { label: string; ja: string }[]>();
          byPref.set(pref.pref, [...(byPref.get(pref.pref) ?? []), owner]);
          byKey.set(form, byPref);
        }
      }
    }
    return { byKey, municipalities };
  };

  const exact = gather(exactKeys);
  const stem = gather(candidateKeys);

  const collisions: MunicipalityCollision[] = [];
  const involvedExact = new Set<string>();
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let root = x;
    for (;;) {
      const next = parent.get(root);
      // `undefined` means the label was never unioned, so it is its own root.
      // Written as a terminating case rather than `?? root` inside the loop
      // condition, which would spin forever on a label that is not there — a
      // hang in the monthly workflow rather than a visible failure.
      if (next === undefined || next === root) return root;
      root = next;
    }
  };
  const union = (a: string, b: string): void => {
    for (const x of [a, b]) if (!parent.has(x)) parent.set(x, x);
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const [key, byPref] of exact.byKey) {
    if (byPref.size < 2) continue;
    const owners = [...byPref.values()].flat();
    const sameJapanese = new Set(owners.map((o) => o.ja)).size === 1;
    const labels = owners.map((o) => o.label).sort();
    for (const label of labels) union(labels[0]!, label);
    for (const o of owners) involvedExact.add(o.label);
    collisions.push({ romaji: key, owners: labels, sameJapanese });
  }
  collisions.sort((a, b) => b.owners.length - a.owners.length || a.romaji.localeCompare(b.romaji));

  // A component counts as "the same name in Japanese" only when every
  // municipality in it is spelled the same — a component that merges an
  // identical pair with a merely-similar third is not an identical-names case.
  const componentNames = new Map<string, Set<string>>();
  for (const label of involvedExact) {
    const root = find(label);
    const names = componentNames.get(root) ?? new Set<string>();
    names.add(byLabelJa.get(label) ?? label);
    componentNames.set(root, names);
  }
  const components = new Set([...involvedExact].map(find));

  const involvedStem = new Set<string>();
  let stemColliding = 0;
  for (const byPref of stem.byKey.values()) {
    if (byPref.size < 2) continue;
    stemColliding++;
    for (const o of [...byPref.values()].flat()) involvedStem.add(o.label);
  }

  return {
    municipalities: exact.municipalities,
    exact: {
      keys: exact.byKey.size,
      collidingKeys: collisions.length,
      collidingGroups: components.size,
      municipalitiesInvolved: involvedExact.size,
      sameJapaneseGroups: [...components].filter((root) => componentNames.get(root)?.size === 1).length,
      collisions,
    },
    stemInclusive: {
      keys: stem.byKey.size,
      collidingKeys: stemColliding,
      municipalitiesInvolved: involvedStem.size,
    },
  };
}

/** `12.34% (a/b)`, the shared rendering for every ratio these scripts print. */
export function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? '—' : `${((100 * numerator) / denominator).toFixed(2)}%`;
}

/** The share of towns whose full-form key is unique inside their municipality. */
export function uniqueTownShare(town: TownAmbiguity): number {
  return 100 - (100 * town.fullFormKeys.ownersInvolved) / town.towns;
}

/** The same share with no municipality known — every town pooled nationally. */
export function nationalUniqueTownShare(town: TownAmbiguity): number {
  return 100 - (100 * town.nationalFullFormKeys.ownersInvolved) / town.towns;
}
