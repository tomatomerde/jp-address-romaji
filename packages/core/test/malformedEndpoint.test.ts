/**
 * Regression test for a review finding: `configureDataSource({ endpoint })`
 * stored a malformed endpoint verbatim and still set `configured = true`,
 * and `dataAccess.ts` constructed `new URL(...)` outside its `try` block.
 * Passing a filesystem path to `endpoint` (the option meant for a URL — a
 * plain directory belongs in `dataDir` instead) made every subsequent
 * conversion, in both directions, throw an uncaught `TypeError: Invalid
 * URL` instead of returning the library's normal typed failure. That
 * violates the project's "failures are values, never exceptions" rule
 * (CLAUDE.md, 差別化点) as directly as a bug can.
 *
 * The fix must not disable the documented advanced use case of pointing
 * `endpoint` at a real `http(s)` mirror — that keeps working unchanged.
 *
 * ## Why this file does not assert `isDataConfigured() === false`
 *
 * It did, at first, and that assertion was wrong in a way worth recording:
 * `isDataConfigured()` deliberately falls back to the bundled
 * `jp-address-romaji-data` package when one is installed with its dataset
 * built (normalizer.ts). That fallback is why the library needs no setup at
 * all in the common case — but it also means "is anything configured?" is
 * not stable across environments. `packages/data/data/` is a gitignored
 * build artifact, so it is absent in a bare checkout and in CI, and present
 * in the release pipeline, which builds the dataset before running this
 * suite. An `expect(...).toBe(false)` therefore passed everywhere except the
 * one place that gates publishing, where it failed the 0.1.4 release dry run.
 *
 * So assert what the fix actually changed, in terms that hold either way:
 * the malformed value must never be stored, and no conversion may throw.
 * Where the outcome legitimately depends on whether a bundled dataset
 * exists, ask the library rather than assuming.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '@geolonia/normalize-japanese-addresses';
import { configureDataSource, isDataConfigured } from '../src/normalizer.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { toRomaji } from '../src/toRomaji.js';
import { clearDataCache } from '../src/dataAccess.js';
import { useFixtureData } from './helpers.js';

/** A filesystem path handed to `endpoint`, which wants a URL. The real misuse. */
const MALFORMED = './address-data/ja';

describe('configureDataSource: malformed endpoint', () => {
  beforeEach(() => clearDataCache());
  // Leave the module in a known-good state for any test file sharing this
  // worker process.
  afterEach(() => useFixtureData());

  it('never stores the malformed value as the endpoint', () => {
    configureDataSource({ endpoint: MALFORMED });
    // This is the fix, stated directly: the bad value is rejected rather than
    // written through to the upstream normalizer, where it would later reach
    // `new URL(...)` and throw. Independent of any bundled dataset.
    expect(config.japaneseAddressesApi).not.toBe(MALFORMED);
  });

  it('does not throw from fromRomaji', async () => {
    configureDataSource({ endpoint: MALFORMED });
    // Pre-fix this rejected with `TypeError: Invalid URL`. Getting a Result
    // back at all — whichever branch it takes — is the invariant.
    const result = await fromRomaji('3-2-1 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(typeof result.ok).toBe('boolean');
    if (!isDataConfigured()) {
      // No bundled dataset to fall back to: the failure must be the typed one.
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('DATA_NOT_CONFIGURED');
    }
  });

  it('does not throw from toRomaji', async () => {
    configureDataSource({ endpoint: MALFORMED });
    const result = await toRomaji('東京都新宿区西新宿三丁目2-1');
    expect(typeof result.ok).toBe('boolean');
    if (!isDataConfigured()) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('DATA_NOT_CONFIGURED');
    }
  });

  it('still accepts a legitimate http(s) mirror endpoint (offline guarantee is opt-out, not broken)', () => {
    const endpoint = 'https://example.com/mirror/ja';
    configureDataSource({ endpoint });
    expect(config.japaneseAddressesApi).toBe(endpoint);
    expect(isDataConfigured()).toBe(true);
  });
});
