/**
 * Measure how often a town romanization is ambiguous within its municipality.
 *
 * Why this exists: the README quotes ambiguity percentages, and for a while it
 * quoted two conflicting ones (0.95% and 1.23%) whose provenance could not be
 * reconstructed — both predated changes to the matcher. This script measures
 * the figure with the exact functions `fromRomaji` runs (`candidateKeys`,
 * `isPlausibleReading`), against a real dataset, so the published numbers are
 * reproducible instead of archaeological.
 *
 * Run it against a generated dataset:
 *
 *   npx tsx scripts/measure-ambiguity.ts --data ./address-data
 *
 * Two figures come out, and they answer different questions:
 *
 * - "all keys" includes the stemmed short forms `candidateKeys` indexes
 *   (`Showa` for 昭和町), so it is the ambiguity a typed query can actually
 *   hit — `fromRomaji` returns AMBIGUOUS with candidates for these.
 * - "full-form keys" excludes the stems, so it is the residue that writing
 *   the full town name cannot resolve (夷町 vs 恵比須町, both `Ebisucho`).
 *
 * Not to be confused with the "assumption 5" percentage printed by
 * `scripts/verify-data-assumptions.ts`: that one is a cheap naive proxy
 * (raw `oaza_cho_r` field only, no kana fallback, no stemming) meant as a
 * quick smoke-test signal, not the figure this script measures. The numbers
 * this script prints are the ones quoted in the README and CLAUDE.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import { candidateKeys } from '../packages/core/src/fromRomaji.js';
import { normalizeRomajiKey } from '../packages/core/src/data/prefectures.js';
import { kanaToRomaji } from '../packages/core/src/romaji/hepburn.js';
import { isPlausibleReading } from '../packages/core/src/romaji/validate.js';

interface MachiAzaRecord {
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
}

const dataFlag = process.argv.indexOf('--data');
const dataDir = dataFlag === -1 ? undefined : process.argv[dataFlag + 1];
if (!dataDir) {
  console.error('usage: npx tsx scripts/measure-ambiguity.ts --data <dir>');
  process.exit(2);
}
const jaDir = path.join(dataDir, 'ja');
if (!fs.existsSync(jaDir)) {
  console.error(`measure-ambiguity: ${jaDir} does not exist — is --data pointing at a built dataset?`);
  process.exit(2);
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

let municipalities = 0;
let towns = 0;
let ambiguousTowns = 0;
let ambiguousTownsFull = 0;
let keys = 0;
let ambiguousKeys = 0;
let fullKeys = 0;
let ambiguousFullKeys = 0;

for (const pref of fs.readdirSync(jaDir)) {
  for (const cityFile of fs.readdirSync(path.join(jaDir, pref))) {
    const { data } = JSON.parse(
      fs.readFileSync(path.join(jaDir, pref, cityFile), 'utf8'),
    ) as { data: MachiAzaRecord[] };
    municipalities++;

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

    const tally = (byTown: Map<string, Set<string>>): { keys: number; amb: number; hit: number } => {
      const byKey = new Map<string, Set<string>>();
      for (const [ja, ks] of byTown) {
        for (const k of ks) {
          const owners = byKey.get(k) ?? new Set<string>();
          owners.add(ja);
          byKey.set(k, owners);
        }
      }
      const hit = new Set<string>();
      let amb = 0;
      for (const owners of byKey.values()) {
        if (owners.size > 1) {
          amb++;
          for (const t of owners) hit.add(t);
        }
      }
      return { keys: byKey.size, amb, hit: hit.size };
    };

    const all = tally(townAll);
    const full = tally(townFull);
    towns += townAll.size;
    keys += all.keys;
    ambiguousKeys += all.amb;
    ambiguousTowns += all.hit;
    fullKeys += full.keys;
    ambiguousFullKeys += full.amb;
    ambiguousTownsFull += full.hit;
  }
}

const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(2)}% (${a}/${b})`;
console.log(`municipality files: ${municipalities}`);
console.log(`distinct towns (oaza_cho with a plausible reading): ${towns}`);
console.log('');
console.log('All keys fromRomaji indexes (full forms + stemmed short forms):');
console.log(`  keys mapping to >=2 distinct towns in one municipality: ${pct(ambiguousKeys, keys)}`);
console.log(`  towns involved in such a collision:                     ${pct(ambiguousTowns, towns)}`);
console.log('');
console.log('Full-form keys only (what writing the full name resolves to):');
console.log(`  keys mapping to >=2 distinct towns in one municipality: ${pct(ambiguousFullKeys, fullKeys)}`);
console.log(`  towns involved in such a collision:                     ${pct(ambiguousTownsFull, towns)}`);
