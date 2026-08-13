/**
 * Check the assumptions this library makes about the address dataset.
 *
 * The library's heuristics are tuned to measured properties of the data, so
 * those properties need re-checking whenever the dataset is rebuilt. This
 * script does all of it in one pass, from anywhere with network access.
 *
 * It has already caught two real defects: a plausibility check that flagged
 * 3.65% of entries because the `大字` prefix is spelled out in the kana, and a
 * chome-stripping step that truncated town names whose trailing digit is part
 * of the name (`政和第一` -> `"Seiwadai1"`).
 *
 *   npx tsx packages/data/src/build-data.ts --out ./address-data
 *   npx tsx scripts/verify-data-assumptions.ts --data ./address-data
 *
 * Exits non-zero if any assumption is violated badly enough to need a code
 * change, so it can be wired into CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isPlausibleReading, isUsableRomajiField } from '../packages/core/src/romaji/validate.js';

interface City { county?: string; city: string; ward?: string }
interface Pref { pref: string; cities: City[] }
interface Town {
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
  chome_n?: number;
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

const pct = (n: number, d: number) => (d === 0 ? '—' : `${((n / d) * 100).toFixed(3)}%`);

function main(): void {
  const dataDir = path.resolve(arg('data', './address-data'));
  const indexPath = path.join(dataDir, 'ja.json');
  if (!fs.existsSync(indexPath)) {
    console.error(`No dataset at ${indexPath}. Build one first:`);
    console.error('  npx tsx packages/data/src/build-data.ts --out ./address-data');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as { data: Pref[] };

  let towns = 0;
  let withRomaji = 0;
  let withKana = 0;
  let kanaOnly = 0;
  let romajiOnly = 0;
  let neither = 0;
  let corruptRomaji = 0;
  let flaggedReading = 0;
  let romajiEndsInDigit = 0;
  let missingFiles = 0;

  const flaggedSamples: string[] = [];
  const digitSamples: string[] = [];
  // Distinct towns per municipality that share one romanization.
  let ambiguousKeys = 0;
  let distinctKeys = 0;

  for (const pref of index.data) {
    for (const city of pref.cities) {
      const municipality = `${city.county ?? ''}${city.city}${city.ward ?? ''}`;
      const file = path.join(dataDir, 'ja', pref.pref, `${municipality}.json`);
      if (!fs.existsSync(file)) { missingFiles++; continue; }
      const records = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { data: Town[] }).data;

      const byKey = new Map<string, Set<string>>();

      for (const town of records) {
        if (!town.oaza_cho) continue;
        towns++;
        if (town.oaza_cho_r) withRomaji++;
        if (town.oaza_cho_k) withKana++;
        if (town.oaza_cho_k && !town.oaza_cho_r) kanaOnly++;
        if (town.oaza_cho_r && !town.oaza_cho_k) romajiOnly++;
        if (!town.oaza_cho_k && !town.oaza_cho_r) neither++;

        if (town.oaza_cho_r && !isUsableRomajiField(town.oaza_cho_r)) corruptRomaji++;

        if (town.oaza_cho_k && !isPlausibleReading(town.oaza_cho, town.oaza_cho_k)) {
          flaggedReading++;
          if (flaggedSamples.length < 25) {
            flaggedSamples.push(`${pref.pref}${municipality}${town.oaza_cho} [${town.oaza_cho_k}]`);
          }
        }

        // Confirmed on v2: a trailing digit belongs to the NAME (政和第一 ->
        // "Seiwadai1"), never to a chome, which lives in its own field. Kept
        // as a watch: if this count ever climbs, the assumption has changed.
        if (town.oaza_cho_r && /\d$/.test(town.oaza_cho_r.trim())) {
          romajiEndsInDigit++;
          if (digitSamples.length < 25) {
            digitSamples.push(
              `${pref.pref}${municipality}${town.oaza_cho}` +
              `${town.chome_n !== undefined ? ` (chome ${town.chome_n})` : ''}` +
              ` -> "${town.oaza_cho_r}"`,
            );
          }
        }

        if (town.oaza_cho_r) {
          // Same normalization the library uses: digits are kept, because a
          // trailing digit is part of the name (see assumption 4).
          //
          // NOTE: this key is deliberately naive — it only lowercases the raw
          // `oaza_cho_r` field and strips non-alphanumerics. It does NOT match
          // what `fromRomaji` actually indexes: it skips towns with no romaji
          // field (so it misses the ~10% of towns romanized from kana, see
          // assumption 1), and it does not include the stemmed short-form
          // keys `candidateKeys` generates. So the percentage below is a
          // cheap smoke-test proxy, not the ambiguity rate users experience.
          // For the real, user-facing figures (which is what the README and
          // CLAUDE.md quote), see `scripts/measure-ambiguity.ts`, which
          // reuses `candidateKeys`/`fromRomaji`'s own key logic instead of
          // reimplementing a rough approximation of it.
          const key = town.oaza_cho_r.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (key) {
            if (!byKey.has(key)) byKey.set(key, new Set());
            byKey.get(key)!.add(town.oaza_cho);
          }
        }
      }

      for (const names of byKey.values()) {
        distinctKeys++;
        if (names.size > 1) ambiguousKeys++;
      }
    }
  }

  const usable = towns - neither - corruptRomaji;

  console.log('=== Dataset assumption check ===');
  console.log(`dataset: ${dataDir}`);
  console.log(`town entries: ${towns}${missingFiles > 0 ? `  (⚠ ${missingFiles} municipality files missing)` : ''}`);
  console.log('');
  console.log('-- coverage --');
  console.log(`  with romaji            : ${withRomaji} (${pct(withRomaji, towns)})`);
  console.log(`  with kana              : ${withKana} (${pct(withKana, towns)})`);
  console.log(`  usable (excl. corrupt) : ${usable} (${pct(usable, towns)})`);
  console.log('');
  console.log('-- assumption 1: the kana-derived romanization path is load-bearing --');
  console.log(`  kana but no romaji : ${kanaOnly} (${pct(kanaOnly, towns)})`);
  console.log(`  romaji but no kana : ${romajiOnly} (${pct(romajiOnly, towns)})`);
  console.log(`  neither            : ${neither} (${pct(neither, towns)})`);
  console.log('  -> "kana but no romaji" is the share that ONLY transliteration can convert.');
  console.log('     Measured ~10% on v2, which is why romanizeStem() falls back to kana.');
  console.log('');
  console.log('-- assumption 2: some romaji values are corrupt (collapsed to a number) --');
  console.log(`  rejected by isUsableRomajiField: ${corruptRomaji} (${pct(corruptRomaji, withRomaji)} of populated)`);
  console.log('');
  console.log('-- assumption 3: the reading-plausibility check has few false positives --');
  console.log(`  flagged by isPlausibleReading: ${flaggedReading} (${pct(flaggedReading, withKana)} of entries with kana)`);
  console.log('  REVIEW THESE — each one is an address the library will refuse:');
  flaggedSamples.forEach((s) => console.log(`    ${s}`));
  console.log('');
  console.log('-- assumption 4: town romaji does NOT carry a trailing chome number --');
  console.log(`  oaza_cho_r ending in a digit: ${romajiEndsInDigit} (${pct(romajiEndsInDigit, withRomaji)})`);
  console.log('  These digits are part of the name, not a chome. Nothing may strip them:');
  digitSamples.forEach((s) => console.log(`    ${s}`));
  console.log('');
  console.log('-- assumption 5: romanization is near-unique within a municipality --');
  console.log('  (naive proxy metric — raw oaza_cho_r keys only, no kana fallback, no');
  console.log('   candidateKeys stemming. NOT the user-facing ambiguity rate: that figure');
  console.log('   is measured by `scripts/measure-ambiguity.ts` and is what the README and');
  console.log('   CLAUDE.md quote (1.07% / 0.67%). This is a cheaper smoke-test signal.)');
  console.log(`  distinct romaji-field keys (naive): ${distinctKeys}`);
  console.log(`  ambiguous keys (naive)             : ${ambiguousKeys} (${pct(ambiguousKeys, distinctKeys)})`);
  console.log('');

  // Fail loudly on anything that invalidates a design decision.
  const problems: string[] = [];
  if (missingFiles > 0) problems.push(`${missingFiles} municipality files are missing; the dataset is incomplete.`);
  if (towns === 0) problems.push('No town entries were read.');
  if (flaggedReading / Math.max(withKana, 1) > 0.01) {
    problems.push('The reading-plausibility check flags over 1% of entries; review the samples above for false positives before shipping.');
  }
  // Coverage is 99.55% on the current national dataset. A sharp drop means the
  // upstream data changed shape, not that a few towns were renamed.
  //
  // Only applied to a full dataset: the test fixtures are a deliberately sparse
  // subset (they exist to exercise the refusal paths) and would always trip it.
  const isFullDataset = towns > 100_000;
  if (isFullDataset && usable / towns < 0.95) {
    problems.push(`Usable coverage fell to ${pct(usable, towns)}; it is normally >99%. The dataset shape may have changed.`);
  }
  if (problems.length > 0) {
    console.error('ASSUMPTIONS VIOLATED:');
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log('All assumptions hold.');
}

main();
