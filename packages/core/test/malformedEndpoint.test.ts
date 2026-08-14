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
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { configureDataSource, isDataConfigured } from '../src/normalizer.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { toRomaji } from '../src/toRomaji.js';
import { clearDataCache } from '../src/dataAccess.js';
import { useFixtureData } from './helpers.js';

describe('configureDataSource: malformed endpoint', () => {
  beforeEach(() => clearDataCache());
  // Leave the module in a known-good state for any test file sharing this
  // worker process.
  afterEach(() => useFixtureData());

  it('does not throw from fromRomaji — degrades to DATA_NOT_CONFIGURED', async () => {
    configureDataSource({ endpoint: './address-data/ja' });
    const result = await fromRomaji('3-2-1 Nishishinjuku, Shinjuku-ku, Tokyo');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('DATA_NOT_CONFIGURED');
  });

  it('does not throw from toRomaji — degrades to DATA_NOT_CONFIGURED', async () => {
    configureDataSource({ endpoint: './address-data/ja' });
    const result = await toRomaji('東京都新宿区西新宿三丁目2-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('DATA_NOT_CONFIGURED');
  });

  it('leaves isDataConfigured() false after a malformed endpoint', () => {
    configureDataSource({ endpoint: './address-data/ja' });
    expect(isDataConfigured()).toBe(false);
  });

  it('still accepts a legitimate http(s) mirror endpoint (offline guarantee is opt-out, not broken)', () => {
    configureDataSource({ endpoint: 'https://example.com/mirror/ja' });
    expect(isDataConfigured()).toBe(true);
  });
});
