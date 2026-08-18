/**
 * Fail when a published figure stops matching the measurement it came from.
 *
 * The numbers this project quotes — romanization coverage, the two town
 * ambiguity families, how many municipality names are shared across
 * prefectures — are measured against the 106 MB national dataset, which CI
 * does not have. So the measurement itself cannot run here. What can run here
 * is the half that actually rots: the sentences.
 *
 * `docs/measurements/figures.json` is written by `scripts/measure-coverage.ts`
 * in the same run that writes `docs/coverage.md`. The monthly
 * `Refresh address data and coverage` workflow regenerates both and commits
 * them. This check then turns that commit red the moment a regenerated number
 * no longer matches what the README, README.ja, CLAUDE.md or `fromRomaji`'s
 * API docs say — which is the failure this exists for. Before it, a figure
 * could only be caught by someone re-reading four files by hand, and one was
 * not: the article and the README disagreed about the same quantity for
 * two releases.
 *
 * Run it:
 *
 *   npx tsx scripts/check-quoted-figures.ts
 *
 * What it does NOT catch, deliberately, so nobody reads more into a green run:
 *
 * - A number invented in prose that no measurement produces. Nothing here
 *   knows a sentence exists until it is listed below.
 * - Anything outside this repository. The Zenn article quotes these same
 *   figures and cannot be reached from CI; it is dated at the point of
 *   measurement instead, so a reader can tell how old the number is.
 * - Prose *around* a figure going stale while the figure itself is right
 *   ("all rejections take the same form" surviving a change in what is
 *   rejected). Only a person re-reading the paragraph catches that.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIGURES = path.join(ROOT, 'docs', 'measurements', 'figures.json');

interface Figures {
  measuredAt: string;
  townEntries: number;
  withRomajiPct: string;
  withKanaPct: string;
  usablePct: string;
  unusablePct: string;
  chomeEntries: number;
  chomeUsablePct: string;
  oazaPrefixedEntries: number;
  oazaPrefixedUsablePct: string;
  towns: number;
  uniqueWithinMunicipalityPct: string;
  uniqueNationallyPct: string;
  fullFormKeys: { ambiguous: number; total: number; pct: string; townsInvolved: number };
  allKeys: { ambiguous: number; total: number; pct: string; townsInvolved: number };
  municipalityCollisions: {
    municipalities: number;
    /** Sets of municipalities that share a spelling, not spellings. */
    shared: number;
    sharedSpellings: number;
    sameJapanese: number;
    municipalitiesInvolved: number;
    stemInclusive: number;
  };
}

/** `211041` -> `211,041`, the way every one of these files writes a count. */
function n(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Strip everything that only affects how a sentence is laid out, from both the
 * file and the expectation, so that re-wrapping a paragraph cannot report a
 * figure as stale when it is not.
 *
 * Every file here is hard-wrapped, one is a TypeScript block comment (` * `
 * continuation markers mid-sentence), and two are Japanese, where a line break
 * inside a sentence introduces no space at all — so "replace a newline with a
 * space" is right for the English files and wrong for the Japanese ones.
 * Removing all whitespace instead is right for both, and it costs nothing:
 * these expectations are long enough that a spurious match is not a real risk.
 *
 * Asterisks go too, so `**bold**` around a figure is a formatting choice
 * rather than something every expectation has to encode.
 */
function flatten(text: string): string {
  return text.replace(/[\s*]+/g, '');
}

/**
 * Substring search that refuses a match glued to another digit.
 *
 * A plain `includes` is not enough here: most expectations start or end with a
 * number, so a document reading "139 groups" satisfies an expectation of
 * "39 groups" and CI reports every figure as current. That is the exact
 * failure this check exists to prevent, so the boundary is part of the match.
 */
function containsFigure(haystack: string, needle: string): boolean {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    const before = i === 0 ? '' : haystack[i - 1]!;
    const after = haystack[i + needle.length] ?? '';
    if (!/[0-9]/.test(before) && !/[0-9]/.test(after)) return true;
  }
  return false;
}

interface Expectation {
  /** Repo-relative path of the file that quotes the figure. */
  file: string;
  /** What the sentence is about, for the error message. */
  what: string;
  /** The exact text the file must contain, built from the measurement. */
  text: (f: Figures) => string;
}

/**
 * Every place a measured figure is written out, and how it is written there.
 *
 * These are exact substrings, not patterns: the point is that changing the
 * measurement forces someone to look at the sentence, and a pattern loose
 * enough to survive a rewrite is loose enough to survive a wrong number.
 * When a line here fails because the prose was legitimately rephrased, edit
 * the expectation and the prose together — never only one of them.
 */
const EXPECTATIONS: Expectation[] = [
  // --- README.md (English), coverage ---
  {
    file: 'README.md',
    what: 'the size of the dataset the coverage table is measured over',
    text: (f) => `Measured over all ${n(f.townEntries)} town-level records`,
  },
  {
    file: 'README.md',
    what: 'the coverage table (chome, 大字-prefixed, national)',
    text: (f) =>
      `| **Chome-bearing (urban, 住居表示)** | ${n(f.chomeEntries)} | **${f.chomeUsablePct}%** |` +
      `| **\`大字\`-prefixed (rural)** | ${n(f.oazaPrefixedEntries)} | **${f.oazaPrefixedUsablePct}%** |` +
      `| National | ${n(f.townEntries)} | **${f.usablePct}%** |`,
  },
  {
    file: 'README.md',
    what: 'the share of entries with no usable reading',
    text: (f) => `${f.unusablePct}% of entries nationally`,
  },

  // --- README.ja.md, coverage ---
  {
    file: 'README.ja.md',
    what: 'the size of the dataset the coverage table is measured over',
    text: (f) => `同梱データセット全 ${n(f.townEntries)} 行での実測`,
  },
  {
    file: 'README.ja.md',
    what: 'the coverage table (chome, 大字-prefixed, national)',
    text: (f) =>
      `| **丁目あり（都市部・住居表示）** | ${n(f.chomeEntries)} | **${f.chomeUsablePct}%** |` +
      `| **\`大字\` 始まり（農村部）** | ${n(f.oazaPrefixedEntries)} | **${f.oazaPrefixedUsablePct}%** |` +
      `| 全国 | ${n(f.townEntries)} | **${f.usablePct}%** |`,
  },
  {
    file: 'README.ja.md',
    what: 'the share of entries with no usable reading',
    text: (f) => `読みが得られない全国 ${f.unusablePct}% については`,
  },

  // --- CLAUDE.md, coverage ---
  {
    file: 'CLAUDE.md',
    what: 'the size and shape of the shipped dataset',
    text: (f) =>
      `町エントリ ${n(f.townEntries)} 件、市区町村 ${n(f.municipalityCollisions.municipalities)}`,
  },
  {
    file: 'CLAUDE.md',
    what: 'national and chome coverage',
    text: (f) => `カバレッジは全国 ${f.usablePct}%、丁目を持つ都市部住所では ${f.chomeUsablePct}%`,
  },
  {
    file: 'CLAUDE.md',
    what: 'how often romaji is missing but kana is not',
    text: (f) => `romaji フィールドを持つのは ${f.withRomajiPct}%、かなは ${f.withKanaPct}%`,
  },

  // --- README.md (English), ambiguity ---
  {
    file: 'README.md',
    what: 'town uniqueness, within a municipality and nationally',
    text: (f) =>
      `unique within a known municipality ${f.uniqueWithinMunicipalityPct}% of the time but ` +
      `only ${f.uniqueNationallyPct}% of the time nationally`,
  },
  {
    file: 'README.md',
    what: 'municipality names shared across prefectures',
    text: (f) =>
      `${f.municipalityCollisions.shared} groups of municipalities in different prefectures share ` +
      `a romanization, ${f.municipalityCollisions.municipalitiesInvolved} municipalities in all`,
  },
  {
    file: 'README.md',
    what: 'how many of those collisions are the same name in Japanese',
    text: (f) =>
      `${f.municipalityCollisions.sameJapanese} of those groups are literally the same name in Japanese`,
  },
  {
    file: 'README.md',
    what: 'full-form key ambiguity (the KEN_ALL trade-off)',
    text: (f) =>
      `${f.fullFormKeys.pct}% of full-form romanization keys (${n(f.fullFormKeys.ambiguous)} of ` +
      `${n(f.fullFormKeys.total)}, involving ${n(f.fullFormKeys.townsInvolved)} towns nationally)`,
  },
  {
    file: 'README.md',
    what: 'ambiguity across all indexed keys',
    text: (f) =>
      `${f.allKeys.pct}% of the romanization keys \`fromRomaji\` indexes ` +
      `(${n(f.allKeys.ambiguous)} of ${n(f.allKeys.total)})`,
  },

  // --- README.ja.md ---
  {
    file: 'README.ja.md',
    what: 'town uniqueness, within a municipality and nationally',
    text: (f) =>
      `${f.uniqueWithinMunicipalityPct}% は市区町村が判明していれば一意ですが、全国文脈では ` +
      `${f.uniqueNationallyPct}% まで落ちます`,
  },
  {
    file: 'README.ja.md',
    what: 'municipality names shared across prefectures',
    text: (f) =>
      `都道府県をまたいでローマ字表記を共有する市区町村の組が ${f.municipalityCollisions.shared}、` +
      `関わる市区町村は ${f.municipalityCollisions.municipalitiesInvolved}`,
  },
  {
    file: 'README.ja.md',
    what: 'how many of those collisions are the same name in Japanese',
    text: (f) => `そのうち ${f.municipalityCollisions.sameJapanese} 組は日本語表記まで同じ名前で`,
  },
  {
    file: 'README.ja.md',
    what: 'full-form key ambiguity (the KEN_ALL trade-off)',
    text: (f) =>
      `全形キーの ${f.fullFormKeys.pct}% （${n(f.fullFormKeys.total)} 中 ` +
      `${n(f.fullFormKeys.ambiguous)}、関与する町字は全国 ${n(f.fullFormKeys.townsInvolved)}）`,
  },
  {
    file: 'README.ja.md',
    what: 'ambiguity across all indexed keys',
    text: (f) =>
      `ローマ字キーの ${f.allKeys.pct}% （${n(f.allKeys.total)} 中 ${n(f.allKeys.ambiguous)}）`,
  },

  // --- CLAUDE.md ---
  {
    file: 'CLAUDE.md',
    what: 'full-form key ambiguity (the KEN_ALL trade-off)',
    text: (f) => `完全形キー曖昧性 ${f.fullFormKeys.pct}%`,
  },
  {
    file: 'CLAUDE.md',
    what: 'town uniqueness, within a municipality and nationally',
    text: (f) =>
      `完全形キーで一意なのは、市区町村が判明していれば ${f.uniqueWithinMunicipalityPct}%、` +
      `全国文脈では ${f.uniqueNationallyPct}%`,
  },
  {
    file: 'CLAUDE.md',
    what: 'municipality names shared across prefectures',
    text: (f) =>
      `ローマ字表記を共有する市区町村の組は ${f.municipalityCollisions.shared}` +
      `（${f.municipalityCollisions.municipalitiesInvolved} 市区町村、` +
      `${f.municipalityCollisions.sharedSpellings} 綴り）で、` +
      `**そのうち日本語表記まで同じ名前なのは ${f.municipalityCollisions.sameJapanese} 組**`,
  },

  // --- the two README files npm renders, and the demo page ---
  //
  // These are the most-read copies of these figures and the easiest to forget:
  // neither is next to the code that changed, and the demo is a separate
  // deploy. Being listed here is the only thing that makes them go red.
  {
    file: 'packages/core/README.md',
    what: 'national and chome coverage',
    text: (f) =>
      `Coverage over the ${n(f.townEntries)} town entries of the shipped dataset is ` +
      `**${f.usablePct}%**, and ${f.chomeUsablePct}% for chome-bearing urban addresses`,
  },
  {
    file: 'packages/data/README.md',
    what: 'the size of the dataset',
    text: (f) =>
      `${n(f.townEntries)} town (machi-aza) entries across ` +
      `${n(f.municipalityCollisions.municipalities)} municipalities`,
  },
  {
    file: 'demo/index.html',
    what: 'how often romaji is missing but kana is not',
    text: (f) =>
      `同梱データでローマ字フィールドを持つのは ${f.withRomajiPct}%、かなを持つのは ${f.withKanaPct}%`,
  },

  // --- the API docs the figures justify ---
  {
    file: 'packages/core/src/fromRomaji.ts',
    what: 'town uniqueness, within a municipality and nationally',
    text: (f) =>
      `unique within a known municipality ${f.uniqueWithinMunicipalityPct}% of the time but only ` +
      `${f.uniqueNationallyPct}% of the time nationally`,
  },
  {
    file: 'packages/core/src/fromRomaji.ts',
    what: 'municipality names shared across prefectures',
    text: (f) =>
      `${f.municipalityCollisions.shared} groups of municipalities in different prefectures share a ` +
      `romanization, ${f.municipalityCollisions.municipalitiesInvolved} municipalities in all`,
  },
  {
    file: 'packages/core/src/fromRomaji.ts',
    what: 'full-form key ambiguity, with the all-keys figure beside it',
    text: (f) =>
      `${f.fullFormKeys.pct}% of full-form romanization keys match more than one distinct town ` +
      `in the same municipality (${f.allKeys.pct}% once the indexed short forms are included)`,
  },
];

function main(): void {
  if (!fs.existsSync(FIGURES)) {
    console.error(
      `::error::${path.relative(ROOT, FIGURES)} is missing. Generate it with the ` +
        '`Refresh address data and coverage` workflow, which runs ' +
        'scripts/measure-coverage.ts against a built dataset.',
    );
    process.exit(1);
  }
  const figures = JSON.parse(fs.readFileSync(FIGURES, 'utf8')) as Figures;

  const contents = new Map<string, string>();
  let failures = 0;

  for (const expectation of EXPECTATIONS) {
    const full = path.join(ROOT, expectation.file);
    if (!contents.has(expectation.file)) {
      if (!fs.existsSync(full)) {
        console.error(`::error::${expectation.file} does not exist, but this check expects to find figures in it.`);
        failures++;
        continue;
      }
      contents.set(expectation.file, flatten(fs.readFileSync(full, 'utf8')));
    }
    const text = expectation.text(figures);
    if (containsFigure(contents.get(expectation.file) ?? '', flatten(text))) continue;

    failures++;
    console.error(
      `::error file=${expectation.file}::${expectation.file} no longer states the measured figure ` +
        `for ${expectation.what}. docs/measurements/figures.json says it should read:\n` +
        `${text}\n` +
        'Update the sentence — and re-read the paragraph around it, since a changed number ' +
        'can also falsify the claim it supports.',
    );
  }

  if (failures > 0) {
    console.error(
      `\n${failures} quoted figure(s) are out of date. The measurement is the source: ` +
        'docs/coverage.md and docs/measurements/figures.json are generated, the prose is not.',
    );
    process.exit(1);
  }
  console.log(`All ${EXPECTATIONS.length} quoted figures match docs/measurements/figures.json ` +
    `(measured ${figures.measuredAt}).`);
}

main();
