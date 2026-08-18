/**
 * Print the ambiguity measurements for a dataset, for a human to read.
 *
 * Why this exists: the README quotes ambiguity percentages, and for a while it
 * quoted two conflicting ones (0.95% and 1.23%) whose provenance could not be
 * reconstructed — both predated changes to the matcher. These figures are
 * measured with the exact functions `fromRomaji` runs (`candidateKeys`,
 * `exactKeys`, `isPlausibleReading`), against a real dataset, so the published
 * numbers are reproducible instead of archaeological.
 *
 * Run it against a generated dataset:
 *
 *   npx tsx scripts/measure-ambiguity.ts --data ./address-data
 *
 * This script is the interactive view. The published figures come from
 * `docs/coverage.md`, which `scripts/measure-coverage.ts` generates from the
 * same functions (scripts/lib/ambiguity.ts) — do not copy numbers out of here
 * into prose; regenerate that file instead, and `scripts/check-quoted-figures.ts`
 * will tell you which sentences need updating.
 *
 * Three figures come out, and they answer different questions:
 *
 * - "all keys" includes the stemmed short forms `candidateKeys` indexes
 *   (`Showa` for 昭和町), so it is the ambiguity a typed query can actually
 *   hit — `fromRomaji` returns AMBIGUOUS with candidates for these.
 * - "full-form keys" excludes the stems, so it is the residue that writing
 *   the full town name cannot resolve (夷町 vs 恵比須町, both `Ebisucho`).
 * - the municipality section counts names shared across prefectures, which is
 *   what makes the prefecture-first resolution order load-bearing.
 *
 * Not to be confused with the "assumption 5" percentage printed by
 * `scripts/verify-data-assumptions.ts`: that one is a cheap naive proxy
 * (raw `oaza_cho_r` field only, no kana fallback, no stemming) meant as a
 * quick smoke-test signal, not the figure this script measures.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  measureMunicipalityCollisions,
  measureTownAmbiguity,
  nationalUniqueTownShare,
  pct,
  uniqueTownShare,
} from './lib/ambiguity.js';

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

const town = measureTownAmbiguity(dataDir);
const muni = measureMunicipalityCollisions(dataDir);

const ratio = (a: number, b: number): string => `${pct(a, b)} (${a}/${b})`;

console.log(`municipality files: ${town.municipalityFiles}`);
console.log(`distinct towns (oaza_cho with a plausible reading): ${town.towns}`);
console.log('');
console.log('All keys fromRomaji indexes (full forms + stemmed short forms):');
console.log(`  keys mapping to >=2 distinct towns in one municipality: ${ratio(town.allKeys.ambiguous, town.allKeys.keys)}`);
console.log(`  towns involved in such a collision:                     ${ratio(town.allKeys.ownersInvolved, town.towns)}`);
console.log('');
console.log('Full-form keys only (what writing the full name resolves to):');
console.log(`  keys mapping to >=2 distinct towns in one municipality: ${ratio(town.fullFormKeys.ambiguous, town.fullFormKeys.keys)}`);
console.log(`  towns involved in such a collision:                     ${ratio(town.fullFormKeys.ownersInvolved, town.towns)}`);
console.log(`  => unique within a known municipality:                  ${uniqueTownShare(town).toFixed(2)}%`);
console.log('');
console.log('The same full-form keys pooled nationally (municipality NOT known):');
console.log(`  keys mapping to >=2 distinct towns anywhere:            ${ratio(town.nationalFullFormKeys.ambiguous, town.nationalFullFormKeys.keys)}`);
console.log(`  towns involved in such a collision:                     ${ratio(town.nationalFullFormKeys.ownersInvolved, town.towns)}`);
console.log(`  => unique nationally:                                   ${nationalUniqueTownShare(town).toFixed(2)}%`);
console.log('');
console.log(`Municipality names shared across prefectures (${muni.municipalities} records):`);
console.log(`  sets of municipalities sharing a spelling: ${muni.exact.collidingGroups} (${muni.exact.municipalitiesInvolved} municipalities, ${muni.exact.collidingKeys} spellings of ${muni.exact.keys})`);
console.log(`    of those sets, also the same name in Japanese: ${muni.exact.sameJapaneseGroups}`);
console.log(`  with the suffix stemmed off:    ${ratio(muni.stemInclusive.collidingKeys, muni.stemInclusive.keys)} of spellings, ${muni.stemInclusive.municipalitiesInvolved} municipalities`);
console.log('');
for (const c of muni.exact.collisions) {
  console.log(`  ${c.romaji}  ${c.sameJapanese ? '=' : '~'}  ${c.owners.join(' / ')}`);
}
