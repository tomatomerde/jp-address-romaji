import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configureDataSource } from '../src/normalizer.js';
import { clearDataCache } from '../src/dataAccess.js';

/** Directory holding the fixture dataset, in the same layout as the real one. */
export const FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'data',
);

/** Point the library at the fixture dataset. */
export function useFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: FIXTURE_DATA_DIR });
}

/**
 * A second, separate fixture dataset holding real municipality-name
 * collisions (府中市/府中町, 江差町/枝幸町, 四万十市/四万十町). Kept apart
 * from `FIXTURE_DATA_DIR` because that one is deliberately sparse v1-derived
 * data used to exercise refusal paths, and its coverage is not meant to be
 * "fixed" by adding records to it. See fixtures-municipality-ambiguity/README.md.
 */
export const MUNICIPALITY_AMBIGUITY_FIXTURE_DATA_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures-municipality-ambiguity',
  'data',
);

/** Point the library at the municipality-collision fixture dataset. */
export function useMunicipalityAmbiguityFixtureData(): void {
  clearDataCache();
  configureDataSource({ dataDir: MUNICIPALITY_AMBIGUITY_FIXTURE_DATA_DIR });
}

/**
 * Run `fn` with `fetch` replaced by a stub that throws.
 *
 * Any network access — by our code or by the upstream normalizer — fails the
 * test loudly instead of silently succeeding against a remote API.
 */
export async function withNetworkBlocked<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
    const url = String(args[0]);
    attempts.push(url);
    throw new Error(`Network access attempted: ${url}`);
  }) as typeof fetch;
  try {
    const result = await fn();
    if (attempts.length > 0) {
      throw new Error(`Network was accessed: ${attempts.join(', ')}`);
    }
    return result;
  } finally {
    globalThis.fetch = original;
  }
}
