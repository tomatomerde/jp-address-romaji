/**
 * Generate the offline address dataset.
 *
 * Output layout mirrors the upstream Geolonia v2 API exactly, so the same
 * directory serves both @geolonia/normalize-japanese-addresses (via a
 * `file://` endpoint) and this package's reverse lookups:
 *
 *   data/ja.json                     prefectures + municipalities
 *   data/ja/<pref>/<city>.json       towns of one municipality
 *
 * Two size decisions, both deliberate:
 *
 *  - Coordinates (`point`) are dropped from town records. This library makes
 *    no geocoding accuracy claim, so representative points would add tens of
 *    megabytes for data we never read.
 *
 *    They are NOT dropped from prefecture and city records: upstream's
 *    `prefectureToResultPoint`/`cityToResultPoint` index into `point` without
 *    a null check and throw if it is missing. Only `machiAzaToResultPoint`
 *    guards it. Those two levels are ~1,950 records, so keeping them costs
 *    nothing. Do not "optimize" them away.
 *  - Street-level data (residential display / parcel numbers, level 8) is not
 *    fetched. Block numbers are digits and need no lookup; only town-level
 *    (level 3) names carry readings we cannot derive.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ENDPOINT = 'https://japanese-addresses-v2.geoloniamaps.com/api/ja';

interface SourceCity {
  code: number;
  county?: string; county_k?: string; county_r?: string;
  city: string; city_k?: string; city_r?: string;
  ward?: string; ward_k?: string; ward_r?: string;
}

interface SourcePrefecture {
  code: number;
  pref: string; pref_k?: string; pref_r?: string;
  cities: SourceCity[];
}

interface SourceMachiAza {
  machiaza_id: string;
  oaza_cho?: string; oaza_cho_k?: string; oaza_cho_r?: string;
  chome?: string; chome_n?: number;
  koaza?: string; koaza_k?: string; koaza_r?: string;
  rsdt?: true;
  point?: unknown;
  csv_ranges?: unknown;
}

interface Options {
  endpoint: string;
  outDir: string;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback;
  };
  return {
    endpoint: get('endpoint', DEFAULT_ENDPOINT).replace(/\/$/, ''),
    outDir: path.resolve(get('out', path.join(process.cwd(), 'data'))),
    concurrency: Number.parseInt(get('concurrency', '8'), 10),
  };
}

async function fetchJson<T>(url: string, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      // Back off before retrying a transient network failure.
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
  throw lastError;
}

/** Municipality name as it appears in the dataset path. */
function cityPathName(city: SourceCity): string {
  return `${city.county ?? ''}${city.city}${city.ward ?? ''}`;
}

/** Keep only the fields this library reads. */
function slimMachiAza(entry: SourceMachiAza): SourceMachiAza {
  const out: SourceMachiAza = { machiaza_id: entry.machiaza_id };
  if (entry.oaza_cho) out.oaza_cho = entry.oaza_cho;
  if (entry.oaza_cho_k) out.oaza_cho_k = entry.oaza_cho_k;
  if (entry.oaza_cho_r) out.oaza_cho_r = entry.oaza_cho_r;
  if (entry.chome) out.chome = entry.chome;
  if (entry.chome_n !== undefined) out.chome_n = entry.chome_n;
  if (entry.koaza) out.koaza = entry.koaza;
  if (entry.koaza_k) out.koaza_k = entry.koaza_k;
  if (entry.koaza_r) out.koaza_r = entry.koaza_r;
  return out;
}

/** Run tasks with a bounded number in flight. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]!, index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Source:      ${options.endpoint}`);
  console.log(`Destination: ${options.outDir}`);

  const meta = { updated: Math.floor(Date.now() / 1000) };

  console.log('Fetching prefecture index...');
  const prefApi = await fetchJson<{ data: SourcePrefecture[] }>(`${options.endpoint}.json`);
  const prefectures = prefApi.data;

  await fs.mkdir(options.outDir, { recursive: true });
  await fs.writeFile(
    path.join(options.outDir, 'ja.json'),
    JSON.stringify({ meta, data: prefectures }),
  );

  const jobs = prefectures.flatMap((pref) =>
    pref.cities.map((city) => ({ pref: pref.pref, city })),
  );
  console.log(`Fetching ${jobs.length} municipalities...`);

  let done = 0;
  let failed = 0;
  let townCount = 0;

  await mapLimit(jobs, options.concurrency, async ({ pref, city }) => {
    const name = cityPathName(city);
    const url = `${options.endpoint}/${encodeURIComponent(pref)}/${encodeURIComponent(name)}.json`;
    try {
      const api = await fetchJson<{ data: SourceMachiAza[] }>(url);
      const slim = api.data.map(slimMachiAza);
      townCount += slim.length;
      const dir = path.join(options.outDir, 'ja', pref);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify({ meta, data: slim }));
    } catch (error) {
      failed++;
      console.warn(`  ! ${pref}${name}: ${(error as Error).message}`);
    }
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${jobs.length}`);
  });

  console.log(`\nDone. ${townCount} towns across ${jobs.length - failed} municipalities.`);
  if (failed > 0) {
    // Never let a partial dataset masquerade as a complete one.
    console.error(`${failed} municipalities failed to download; the dataset is incomplete.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
