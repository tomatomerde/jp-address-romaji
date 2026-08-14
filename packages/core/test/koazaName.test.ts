/**
 * Regression tests for a silent data-loss bug present in the published
 * `jp-address-romaji@0.1.2` and `0.1.3`: a town whose `koaza` (small-area)
 * name is not purely numeric (unlike the `地割`/`号` rows koazaNumber.test.ts
 * covers) was silently dropped entirely. `normalizeJapanese` only ever read
 * `machiAza.oaza_cho`; nothing looked at `machiAza.koaza` unless it matched
 * the "just a number" shape. For `長野県飯田市本町三丁目大横1-1`, the koaza
 * `三丁目大横` vanished without a trace and the address came back as
 * `"1-1 Hommachi, Iida-shi, Nagano, Japan"` — indistinguishable from 本町 with
 * no koaza at all. Because 本町 also has ordinary chome rows 1–4,
 * `fromRomaji` resolves that string to a *different* real address (本町一丁目1
 * in <=0.1.3, AMBIGUOUS as of this fix's sibling fromRomaji.ts changes —
 * either way, not the address that was converted). That is exactly the
 * outcome roundtrip.test.ts's header comment says must never happen
 * silently.
 *
 * The fix refuses (`NO_ROMAJI_DATA`) rather than romanize the koaza and fold
 * it into the town name: `fromRomaji.ts` only ever matches a town against its
 * `oaza_cho_k`/`oaza_cho_r` fields, never a koaza, so a combined name could
 * never be parsed back to the same address — trading one silent wrong
 * address for a different, unverifiable one. See fixtures-koaza-name/README.md
 * for the dataset and normalizer.ts / toRomaji.ts for the implementation.
 *
 * Uses a dedicated fixture dataset rather than the general `fixtures/data`,
 * which is deliberately sparse v1-derived data whose coverage CLAUDE.md asks
 * not to be "fixed".
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { useKoazaNameFixtureData } from './helpers.js';

beforeAll(() => useKoazaNameFixtureData());

describe('toRomaji: a named koaza must not be silently dropped', () => {
  it('refuses rather than silently return the town without its koaza (本町三丁目大横)', async () => {
    const result = await toRomaji('長野県飯田市本町三丁目大横1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_ROMAJI_DATA');
    // The message must name both the town and the koaza that would have been
    // dropped, so a caller debugging the refusal can see what happened.
    expect(result.message).toContain('本町');
    expect(result.message).toContain('三丁目大横');
  });

  it('refuses for every koaza row of the town, not just one (本町四丁目大横)', async () => {
    const result = await toRomaji('長野県飯田市本町四丁目大横1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('NO_ROMAJI_DATA');
  });

  it('does not silently return a different real address on round-trip', async () => {
    // This is the actual danger the bug produced: even where the forward
    // conversion happened to succeed with the koaza dropped, feeding that
    // result back through fromRomaji resolved to 本町一丁目 — a real,
    // different chome of the same town, not the koaza address that was
    // converted. Asserting the forward call fails is sufficient to rule that
    // out (there is no `ok: true` value left to round-trip), but this test
    // pins the mechanism: a bare "Hommachi" is genuinely ambiguous in this
    // fixture between four chome rows, so guessing one would have been
    // exactly as wrong as guessing none.
    const forward = await toRomaji('長野県飯田市本町三丁目大横1-1');
    expect(forward.ok).toBe(false);

    const chomeOnly = await fromRomaji('1-1 Hommachi, Iida-shi, Nagano, Japan');
    expect(chomeOnly.ok).toBe(false);
    if (chomeOnly.ok) return;
    expect(chomeOnly.reason).toBe('AMBIGUOUS');
  });

  it('still converts an ordinary chome address for the same town (本町一丁目)', async () => {
    const result = await toRomaji('長野県飯田市本町一丁目1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-1 Hommachi, Iida-shi, Nagano, Japan');
  });

  it('does not affect a plain, koaza-less town in the same city (曙町)', async () => {
    const result = await toRomaji('長野県飯田市曙町1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-1 Akebonocho, Iida-shi, Nagano, Japan');
  });

  // The refusal keys off what the CALLER wrote, not off the row the upstream
  // normalizer happened to resolve to. Those rows carry a koaza for 65.5% of
  // the dataset, so keying off the row refuses ordinary addresses: measured
  // on the real dataset, 10 of 400 koaza-bearing towns written WITHOUT their
  // koaza — 北海道札幌市白石区南郷通1-1 (row koaza `一丁目北`) among them —
  // stopped converting. Widening this guard again should break this test.
  it('does not refuse when the caller named no koaza at all (本町 with a bare number)', async () => {
    const result = await toRomaji('長野県飯田市本町1-1');
    if (!result.ok) {
      // Whatever else may fail here, it must not be the koaza refusal: that
      // fires only when the input itself carried the koaza.
      expect(result.message ?? '').not.toContain('koaza');
    }
  });

  // `字町` shrinks to `町` once its prefix is stripped, and `町` occurs in
  // half the municipality names in Japan. A substring search anywhere in the
  // input matched 宮城県柴田郡川崎町大字小野1-1 on the 町 of 川崎町 and
  // refused it; the koaza has to sit immediately after the town.
  it('does not match a koaza occurring elsewhere in the address', async () => {
    const result = await toRomaji('長野県飯田市本町一丁目1');
    expect(result.ok).toBe(true);
  });
});
