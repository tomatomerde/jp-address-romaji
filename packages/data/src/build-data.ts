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

/**
 * The sweep waits this many times longer between attempts than the first pass.
 * A first-pass failure is most often congestion of our own making — several
 * requests are in flight — so the retry that matters is the slow, lonely one.
 */
const SWEEP_BACKOFF_FACTOR = 4;

/** A bad command line, as opposed to a crash. Reported without a stack trace. */
class UsageError extends Error {}

interface Options {
  endpoint: string;
  outDir: string;
  concurrency: number;
  attempts: number;
  retryDelay: number;
}

/** Every flag this script accepts. Anything else is a typo, not a feature. */
const KNOWN_FLAGS = ['endpoint', 'out', 'concurrency', 'attempts', 'retry-delay'] as const;

function parseArgs(argv: string[]): Options {
  /**
   * Walk argv once instead of searching it per flag. `indexOf` could not see
   * two ways of running against the wrong settings while looking healthy:
   * `--conurrency 8` (a typo) silently fell back to the default, and a flag
   * left without a value swallowed the next token, so `--out --concurrency 5`
   * built the dataset into a directory literally named `--concurrency`. Both
   * exit 0 with a plausible-looking run, which is the failure mode this
   * project refuses everywhere else: guessing instead of saying no.
   */
  const given = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) {
      throw new UsageError(
        `unexpected argument ${JSON.stringify(token)}; every value must follow its --flag`,
      );
    }

    const eq = token.indexOf('=');
    const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
    if (!(KNOWN_FLAGS as readonly string[]).includes(name)) {
      const known = KNOWN_FLAGS.map((flag) => `--${flag}`).join(', ');
      throw new UsageError(`unknown flag --${name}; this script accepts ${known}`);
    }

    let value: string;
    if (eq === -1) {
      const next = argv[i + 1];
      // A value that starts with `--` is a flag the caller forgot to pair, not
      // a directory name. Refusing it is what stops the swallowing above.
      if (next === undefined || next.startsWith('--')) {
        throw new UsageError(`--${name} needs a value`);
      }
      value = next;
      i += 1;
    } else {
      value = token.slice(eq + 1);
      if (value === '') {
        throw new UsageError(`--${name} needs a value`);
      }
    }

    if (given.has(name)) {
      throw new UsageError(`--${name} given more than once`);
    }
    given.set(name, value);
  }

  const get = (name: string, fallback: string): string => given.get(name) ?? fallback;
  /**
   * Reject junk rather than letting NaN through. `--concurrency nonsense` used
   * to reach mapLimit as NaN, which starts zero workers, downloads nothing, and
   * still exits 0 — a complete-looking dataset with no towns in it.
   */
  const positiveInt = (name: string, fallback: string): number => {
    const raw = get(name, fallback);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      throw new UsageError(`--${name} must be a positive integer, got ${JSON.stringify(raw)}`);
    }
    return value;
  };
  return {
    endpoint: get('endpoint', DEFAULT_ENDPOINT).replace(/\/$/, ''),
    outDir: path.resolve(get('out', path.join(process.cwd(), 'data'))),
    concurrency: positiveInt('concurrency', '8'),
    attempts: positiveInt('attempts', '3'),
    retryDelay: positiveInt('retry-delay', '500'),
  };
}

async function fetchJson<T>(url: string, attempts: number, baseDelay: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      // Back off before retrying a transient network failure. No point sleeping
      // after the last attempt — nothing follows it.
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelay * 2 ** i));
    }
  }
  throw lastError;
}

/** One municipality to download. */
interface Job {
  pref: string;
  city: SourceCity;
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
  const prefApi = await fetchJson<{ data: SourcePrefecture[] }>(
    `${options.endpoint}.json`,
    options.attempts,
    options.retryDelay,
  );
  const prefectures = prefApi.data;

  await fs.mkdir(options.outDir, { recursive: true });
  await fs.writeFile(
    path.join(options.outDir, 'ja.json'),
    JSON.stringify({ meta, data: prefectures }),
  );

  const jobs: Job[] = prefectures.flatMap((pref) =>
    pref.cities.map((city) => ({ pref: pref.pref, city })),
  );
  console.log(`Fetching ${jobs.length} municipalities...`);

  let done = 0;
  let written = 0;
  let townCount = 0;

  /** Download one municipality and write its file. Throws on failure. */
  const fetchCity = async (job: Job, baseDelay: number): Promise<void> => {
    const { pref, city } = job;
    const name = cityPathName(city);
    const url = `${options.endpoint}/${encodeURIComponent(pref)}/${encodeURIComponent(name)}.json`;
    const api = await fetchJson<{ data: SourceMachiAza[] }>(url, options.attempts, baseDelay);
    const slim = api.data.map(slimMachiAza);
    const dir = path.join(options.outDir, 'ja', pref);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify({ meta, data: slim }));
    townCount += slim.length;
    written++;
  };

  // Pass 1: the bulk download, several requests in flight.
  const failures: { job: Job; error: unknown }[] = [];
  await mapLimit(jobs, options.concurrency, async (job) => {
    try {
      await fetchCity(job, options.retryDelay);
    } catch (error) {
      failures.push({ job, error });
    }
    done++;
    if (done % 200 === 0) console.log(`  ${done}/${jobs.length}`);
  });

  // Pass 2: sweep up what pass 1 dropped, one at a time and backing off harder.
  //
  // Losing the whole release to one municipality out of ~1,900 is the failure
  // mode this guards: the first pass exhausts its attempts inside a few seconds
  // while seven other requests compete with it, which is exactly when a
  // transient error is most likely and least meaningful. Retrying alone, later,
  // costs seconds and turns a coin-flip release into a reproducible one.
  const unrecovered: { job: Job; error: unknown }[] = [];
  if (failures.length > 0) {
    console.log(`\n${failures.length} municipalities failed the first pass; retrying serially...`);
    for (const { job } of failures) {
      try {
        await fetchCity(job, options.retryDelay * SWEEP_BACKOFF_FACTOR);
        console.log(`  recovered ${job.pref}${cityPathName(job.city)}`);
      } catch (error) {
        unrecovered.push({ job, error });
      }
    }
  }

  console.log(`\nDone. ${townCount} towns across ${written} municipalities.`);

  // Never let a partial dataset masquerade as a complete one.
  if (unrecovered.length > 0) {
    for (const { job, error } of unrecovered) {
      console.error(`  ! ${job.pref}${cityPathName(job.city)}: ${(error as Error).message}`);
    }
    console.error(
      `${unrecovered.length} municipalities failed to download; the dataset is incomplete.`,
    );
    process.exitCode = 1;
    return;
  }

  // Belt and braces: the counters above are only as honest as the loops that
  // maintain them, and an empty dataset must never report success.
  if (written !== jobs.length) {
    console.error(
      `Expected ${jobs.length} municipality files, wrote ${written}; the dataset is incomplete.`,
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof UsageError ? `Error: ${error.message}` : error);
  process.exit(1);
});
