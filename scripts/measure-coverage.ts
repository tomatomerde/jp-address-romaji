/**
 * Generate docs/coverage.md: every measured figure the project publishes.
 *
 * Why this exists: the whole library rests on the dataset actually carrying
 * readings for town names. Where it does not, `toRomaji` must refuse. This
 * script quantifies exactly how often that happens, so the README can state
 * real numbers instead of an assurance.
 *
 * It also carries the two ambiguity families (scripts/lib/ambiguity.ts), so
 * that docs/coverage.md is the single place the README, README.ja, CLAUDE.md
 * and the API docs take their numbers from. Before that, the ambiguity figures
 * lived only in a script's stdout, and the one figure with no script at all —
 * how many municipality names are shared across prefectures — had been quoted
 * as 13 since the first release with nothing behind it.
 *
 * Run it against a generated dataset:
 *
 *   npx tsx packages/data/src/build-data.ts --out ./address-data
 *   npx tsx scripts/measure-coverage.ts --data ./address-data \
 *     --figures-out docs/measurements/figures.json > docs/coverage.md
 *
 * The Markdown on stdout is what a person reads; --figures-out writes the same
 * numbers as JSON, which `scripts/check-quoted-figures.ts` compares the prose
 * against in CI. Both come from one run, so they cannot disagree.
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  measureMunicipalityCollisions,
  measureTownAmbiguity,
  nationalUniqueTownShare,
  pct as ratioPct,
  uniqueTownShare,
} from './lib/ambiguity.js';

interface City {
  county?: string;
  city: string;
  ward?: string;
}
interface Pref {
  pref: string;
  cities: City[];
}
interface Town {
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
  chome_n?: number;
}

interface Bucket {
  total: number;
  withRomaji: number;
  withKana: number;
  usable: number;
  chomeTotal: number;
  chomeUsable: number;
  oazaPrefixed: number;
  oazaPrefixedUsable: number;
}

function emptyBucket(): Bucket {
  return {
    total: 0, withRomaji: 0, withKana: 0, usable: 0,
    chomeTotal: 0, chomeUsable: 0, oazaPrefixed: 0, oazaPrefixedUsable: 0,
  };
}

/** Same rule the library uses: a name that is only digits is corrupt data. */
function isUsable(value: string | undefined): boolean {
  if (!value) return false;
  const stem = value.replace(/[\s-]*\d+$/, '').trim();
  return stem.length > 0 && /[A-Za-z]/.test(stem);
}

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

function pct(numerator: number, denominator: number): string {
  return denominator === 0 ? '—' : `${((numerator / denominator) * 100).toFixed(2)}%`;
}

/**
 * How many shared municipality spellings the generated table lists in full.
 *
 * A cap, not a sample: whatever it hides is stated as a count right below the
 * table, so a reader is never left thinking the list is complete when it isn't.
 */
const COLLISION_ROWS = 100;

/**
 * When the dataset this was measured against was fetched, as `YYYY-MM-DD`.
 *
 * `meta.updated` is stamped by packages/data/src/build-data.ts with the time
 * of the fetch, so it moves on every rebuild even when nothing in the upstream
 * data changed. That is deliberate here: a figure quoted in prose is a record
 * of a measurement, and a record with no date cannot be told apart from a
 * stale one. The cost is that the monthly refresh commits this report every
 * time — which is the point, since the commit is the evidence the numbers were
 * re-measured rather than merely left alone.
 */
function datasetDate(updated: number | undefined): string {
  if (!updated) return 'an unknown date (`meta.updated` missing from `ja.json`)';
  // build-data.ts writes seconds; tolerate milliseconds in case that changes.
  const ms = updated > 1e11 ? updated : updated * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function main(): void {
  const dataDir = path.resolve(arg('data', './address-data'));
  const indexPath = path.join(dataDir, 'ja.json');
  if (!fs.existsSync(indexPath)) {
    console.error(`No dataset at ${indexPath}. Generate one first:`);
    console.error('  pnpm --filter jp-address-romaji-data build:data -- --out ./address-data');
    process.exit(1);
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as {
    meta?: { updated?: number };
    data: Pref[];
  };
  const byPref = new Map<string, Bucket>();
  const national = emptyBucket();
  let missingFiles = 0;

  for (const pref of index.data) {
    const bucket = byPref.get(pref.pref) ?? emptyBucket();
    byPref.set(pref.pref, bucket);

    for (const city of pref.cities) {
      const municipality = `${city.county ?? ''}${city.city}${city.ward ?? ''}`;
      const file = path.join(dataDir, 'ja', pref.pref, `${municipality}.json`);
      if (!fs.existsSync(file)) {
        missingFiles++;
        continue;
      }
      const towns = (JSON.parse(fs.readFileSync(file, 'utf-8')) as { data: Town[] }).data;

      for (const town of towns) {
        if (!town.oaza_cho) continue;
        const usable = isUsable(town.oaza_cho_r) || Boolean(town.oaza_cho_k);
        for (const b of [bucket, national]) {
          b.total++;
          if (town.oaza_cho_r) b.withRomaji++;
          if (town.oaza_cho_k) b.withKana++;
          if (usable) b.usable++;
          if (town.chome_n !== undefined) {
            b.chomeTotal++;
            if (usable) b.chomeUsable++;
          }
          if (town.oaza_cho.startsWith('大字')) {
            b.oazaPrefixed++;
            if (usable) b.oazaPrefixedUsable++;
          }
        }
      }
    }
  }

  const rows = [...byPref.entries()]
    .filter(([, b]) => b.total > 0)
    .sort((a, b) => a[1].usable / a[1].total - b[1].usable / b[1].total);

  const datasetBuilt = datasetDate(index.meta?.updated);
  const town = measureTownAmbiguity(dataDir);
  const muni = measureMunicipalityCollisions(dataDir);
  const uniqueShare = uniqueTownShare(town).toFixed(2);
  const nationalShare = nationalUniqueTownShare(town).toFixed(2);

  const out: string[] = [];
  out.push('# Romanization coverage');
  out.push('');
  // Deliberately not the absolute path: this file is committed, and embedding
  // a CI runner's working directory makes every regeneration look like a diff.
  out.push('Generated by `scripts/measure-coverage.ts`. Regenerate with:');
  out.push('');
  out.push('```sh');
  out.push('npx tsx packages/data/src/build-data.ts --out ./address-data');
  out.push('npx tsx scripts/measure-coverage.ts --data ./address-data \\');
  out.push('  --figures-out docs/measurements/figures.json > docs/coverage.md');
  out.push('```');
  out.push('');
  out.push('**The published coverage and ambiguity figures come from here.** The README, README.ja,');
  out.push('CLAUDE.md and `fromRomaji`\'s API docs quote these numbers, and');
  out.push('`scripts/check-quoted-figures.ts` fails CI when one of them stops matching. The koaza');
  out.push('and reading-plausibility figures are a separate report (`scripts/verify-data-assumptions.ts`),');
  out.push('which is run but not checked. Do not edit this file by hand — regenerate it.');
  out.push('');
  out.push(`Measured on **${datasetBuilt}**, against the dataset fetched that day`);
  out.push('(`meta.updated` in `ja.json`). The date moves on every refresh, so this report is');
  out.push('committed monthly whether or not a number moved — that commit is the evidence.');
  out.push('');
  out.push('A town is counted as **usable** when the dataset carries either a valid romaji');
  out.push('field or a kana reading. Entries whose romaji collapsed to a bare number are');
  out.push('counted as unusable, matching what the library does at runtime.');
  out.push('');
  out.push('## National');
  out.push('');
  out.push(`| Metric | Count | Share |`);
  out.push(`| --- | ---: | ---: |`);
  out.push(`| Town entries | ${national.total} | 100% |`);
  out.push(`| With a romaji field | ${national.withRomaji} | ${pct(national.withRomaji, national.total)} |`);
  out.push(`| With a kana reading | ${national.withKana} | ${pct(national.withKana, national.total)} |`);
  out.push(`| **Usable** | ${national.usable} | ${pct(national.usable, national.total)} |`);
  out.push(`| Chome entries (urban) | ${national.chomeTotal} | ${pct(national.chomeUsable, national.chomeTotal)} usable |`);
  out.push(`| \`大字\`-prefixed (rural) | ${national.oazaPrefixed} | ${pct(national.oazaPrefixedUsable, national.oazaPrefixed)} usable |`);
  out.push('');
  out.push('## By prefecture');
  out.push('');
  out.push('Sorted by overall coverage, lowest first.');
  out.push('');
  out.push('| Prefecture | Towns | Usable | Chome entries | Chome usable |');
  out.push('| --- | ---: | ---: | ---: | ---: |');
  for (const [pref, b] of rows) {
    out.push(
      `| ${pref} | ${b.total} | ${pct(b.usable, b.total)} | ${b.chomeTotal} | ${pct(b.chomeUsable, b.chomeTotal)} |`,
    );
  }

  out.push('');
  out.push('## Ambiguity');
  out.push('');
  out.push('Measured with the matcher\'s own key functions (`candidateKeys`, `exactKeys`,');
  out.push('`isPlausibleReading`), so these move when the matcher moves. A *town* here is one');
  out.push('distinct `oaza_cho` name within one municipality — chome rows of the same name are');
  out.push('one town, and rows the matcher skips are skipped here too.');
  out.push('');
  out.push('| Metric | Count | Share |');
  out.push('| --- | ---: | ---: |');
  out.push(`| Distinct towns | ${town.towns} | 100% |`);
  out.push(
    `| **Towns whose full-form romanization is unique within their municipality** | ${town.towns - town.fullFormKeys.ownersInvolved} | **${uniqueShare}%** |`,
  );
  out.push(
    `| Towns involved in a full-form collision | ${town.fullFormKeys.ownersInvolved} | ${ratioPct(town.fullFormKeys.ownersInvolved, town.towns)} |`,
  );
  out.push(
    `| **Full-form keys matching 2+ towns in one municipality** | ${town.fullFormKeys.ambiguous} of ${town.fullFormKeys.keys} | **${ratioPct(town.fullFormKeys.ambiguous, town.fullFormKeys.keys)}** |`,
  );
  out.push(
    `| All indexed keys (incl. stemmed short forms) matching 2+ towns | ${town.allKeys.ambiguous} of ${town.allKeys.keys} | ${ratioPct(town.allKeys.ambiguous, town.allKeys.keys)} |`,
  );
  out.push(
    `| Towns involved in a collision on any indexed key | ${town.allKeys.ownersInvolved} | ${ratioPct(town.allKeys.ownersInvolved, town.towns)} |`,
  );
  out.push(
    `| **Towns whose full-form romanization is unique nationally** | ${town.towns - town.nationalFullFormKeys.ownersInvolved} | **${nationalShare}%** |`,
  );
  out.push('');
  out.push('The last row is the same keys pooled across the whole country, with no municipality');
  out.push('known — the gap between it and the first row is the whole reason `fromRomaji`');
  out.push('resolves the prefecture and the municipality before it looks at a town name.');
  out.push('');
  out.push('The two key rows answer different questions. **All indexed keys** includes the');
  out.push('stemmed short forms `candidateKeys` indexes (`Showa` for 昭和町), so it is the');
  out.push('ambiguity a typed query can actually hit; `fromRomaji` returns `AMBIGUOUS` with the');
  out.push('candidates for those. **Full-form keys** excludes the stems, so it is the residue');
  out.push('that writing the full town name cannot resolve (夷町 and 恵比須町, both `Ebisucho`) —');
  out.push('the figure the decision not to bundle a postal dataset rests on.');
  out.push('');
  out.push('## Municipality names shared across prefectures');
  out.push('');
  out.push('Why `fromRomaji` resolves the prefecture before anything else. Counted from the');
  out.push('prefecture index only, in the spellings `matchMunicipality` accepts: a ward needs');
  out.push('both segments (`Chuo-ku, Sapporo-shi`), anything else is matched by its own name,');
  out.push('and a county-bearing town may also be written with its county. Two municipalities');
  out.push('in the **same** prefecture that romanize alike are excluded — real ambiguity, but');
  out.push('not something resolving the prefecture first could ever have fixed.');
  out.push('');
  out.push('| Metric | Count |');
  out.push('| --- | ---: |');
  out.push(`| Municipality records | ${muni.municipalities} |`);
  out.push(`| **Groups of municipalities in 2+ prefectures sharing a romanization** | **${muni.exact.collidingGroups}** |`);
  out.push(`| ...of those groups, also the same name in Japanese | ${muni.exact.sameJapaneseGroups} |`);
  out.push(`| Municipalities involved | ${muni.exact.municipalitiesInvolved} |`);
  out.push(`| Spellings those groups are indexed under | ${muni.exact.collidingKeys} of ${muni.exact.keys} |`);
  out.push(`| Spellings shared once the administrative suffix is stemmed off | ${muni.stemInclusive.collidingKeys} |`);
  out.push(`| Municipalities involved, stem-inclusive | ${muni.stemInclusive.municipalitiesInvolved} |`);
  out.push('');
  out.push('A **group** is a set of municipalities connected by "shares at least one spelling",');
  out.push('not a spelling and not a distinct owner set. One name is usually indexed under more');
  out.push('than one accepted spelling (`Mihama-cho` and the passport-style `Mihama-choh` are the');
  out.push('same four towns), so counting spellings would measure how many long-vowel conventions');
  out.push('the matcher accepts rather than how much ambiguity there is — and counting owner sets');
  out.push('has the same problem once removed (`Konan-shi` is 江南市/湖南市/香南市 while');
  out.push('`Kohnan-shi` is only 江南市/香南市; all three can be confused with one another, so that');
  out.push('is one collision, not two). The stem-inclusive row is wider still, and not the headline');
  out.push('either: stemming folds together names that are not the same name (府中市 and 府中町 both');
  out.push('reduce to `Fuchu`).');
  out.push('');
  out.push('"The same name in Japanese" compares the municipality\'s own name, not its county:');
  out.push('宮城県遠田郡美里町 and 埼玉県児玉郡美里町 are both 美里町. **This is a different quantity');
  out.push('from the group count** — do not read the headline as "N municipalities share a name".');
  out.push('');
  if (muni.exact.collisions.length > 0) {
    out.push('### Every shared spelling');
    out.push('');
    out.push('`=` means the Japanese spelling matches too; `~` means only the reading does.');
    out.push('');
    out.push('| Written as | | Municipalities |');
    out.push('| --- | :-: | --- |');
    for (const c of muni.exact.collisions.slice(0, COLLISION_ROWS)) {
      out.push(`| \`${c.romaji}\` | ${c.sameJapanese ? '=' : '~'} | ${c.owners.join(' / ')} |`);
    }
    const omitted = muni.exact.collisions.length - COLLISION_ROWS;
    if (omitted > 0) {
      out.push('');
      out.push(`> ${omitted} further shared spellings are not listed here (the table is capped at`);
      out.push(`> ${COLLISION_ROWS} rows). Run \`npx tsx scripts/measure-ambiguity.ts --data <dir>\` for all of them.`);
    }
  }

  if (missingFiles > 0) {
    out.push('');
    out.push(`> ⚠️ ${missingFiles} municipality files were missing from the dataset;`);
    out.push('> these numbers are incomplete. Re-run the data build.');
  }

  console.log(out.join('\n'));

  const figuresOut = arg('figures-out', '');
  if (figuresOut) {
    const figures = {
      note:
        'Generated by scripts/measure-coverage.ts alongside docs/coverage.md. ' +
        'scripts/check-quoted-figures.ts compares the prose in README.md, README.ja.md, ' +
        'CLAUDE.md and packages/core/src/fromRomaji.ts against these values. ' +
        'Do not edit by hand: regenerate both files from a dataset.',
      measuredAt: datasetBuilt,
      townEntries: national.total,
      withRomajiPct: pct(national.withRomaji, national.total).replace('%', ''),
      withKanaPct: pct(national.withKana, national.total).replace('%', ''),
      usablePct: pct(national.usable, national.total).replace('%', ''),
      unusablePct: pct(national.total - national.usable, national.total).replace('%', ''),
      chomeEntries: national.chomeTotal,
      chomeUsablePct: pct(national.chomeUsable, national.chomeTotal).replace('%', ''),
      oazaPrefixedEntries: national.oazaPrefixed,
      oazaPrefixedUsablePct: pct(national.oazaPrefixedUsable, national.oazaPrefixed).replace('%', ''),
      towns: town.towns,
      uniqueWithinMunicipalityPct: uniqueShare,
      uniqueNationallyPct: nationalShare,
      fullFormKeys: {
        ambiguous: town.fullFormKeys.ambiguous,
        total: town.fullFormKeys.keys,
        pct: ratioPct(town.fullFormKeys.ambiguous, town.fullFormKeys.keys).replace('%', ''),
        townsInvolved: town.fullFormKeys.ownersInvolved,
      },
      allKeys: {
        ambiguous: town.allKeys.ambiguous,
        total: town.allKeys.keys,
        pct: ratioPct(town.allKeys.ambiguous, town.allKeys.keys).replace('%', ''),
        townsInvolved: town.allKeys.ownersInvolved,
      },
      nationalFullFormKeys: {
        ambiguous: town.nationalFullFormKeys.ambiguous,
        total: town.nationalFullFormKeys.keys,
        pct: ratioPct(town.nationalFullFormKeys.ambiguous, town.nationalFullFormKeys.keys).replace('%', ''),
        townsInvolved: town.nationalFullFormKeys.ownersInvolved,
      },
      municipalityCollisions: {
        municipalities: muni.municipalities,
        shared: muni.exact.collidingGroups,
        sharedSpellings: muni.exact.collidingKeys,
        sameJapanese: muni.exact.sameJapaneseGroups,
        municipalitiesInvolved: muni.exact.municipalitiesInvolved,
        stemInclusive: muni.stemInclusive.collidingKeys,
        stemInclusiveMunicipalitiesInvolved: muni.stemInclusive.municipalitiesInvolved,
        examples: muni.exact.collisions.slice(0, COLLISION_ROWS),
      },
    };
    fs.mkdirSync(path.dirname(path.resolve(figuresOut)), { recursive: true });
    fs.writeFileSync(path.resolve(figuresOut), `${JSON.stringify(figures, null, 2)}\n`);
  }
}

main();
