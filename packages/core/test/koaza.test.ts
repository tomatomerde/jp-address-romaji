/**
 * Regression tests for a silent data-loss bug present in the published
 * `jp-address-romaji@0.1.2`: `normalizer.ts`'s `normalizeJapanese` only ever
 * read a `koaza` (small-area subdivision) through `recoverKoazaNumber`, which
 * fires only when the koaza is a bare number plus a suffix. A NAMED koaza —
 * real text, like `三丁目大横` — was read nowhere and silently dropped:
 *
 *   toRomaji('長野県飯田市本町三丁目大横1-1', {})
 *     -> ok: true, "1-1 Hommachi, Iida-shi, Nagano, Japan"   (三丁目大横 gone)
 *
 * That is a different, wrong address — exactly what `roundtrip.test.ts`'s
 * header comment says must never happen silently. See docs/project-status.md
 * item 1 and fixtures-koaza/README.md.
 *
 * A second, distinct failure mode is exercised here too: a present `koaza_k`
 * is NOT automatically a full reading of the koaza. Real evidence (assumption
 * 6 in scripts/verify-data-assumptions.ts, GitHub Actions run 31782019121):
 * 北海道札幌市白石区南郷通's koaza `一丁目北`/`十二丁目南` have `koaza_k`
 * readings that stop at `チョウメ` and never reach the trailing 北/南.
 * Romanizing that truncated reading would silently produce a DIFFERENT real
 * place (南郷通 minus its directional qualifier) — the same class of bug,
 * relocated to the reading instead of the koaza field's presence. This must
 * be refused (`KOAZA_READING_INCOMPLETE`), not romanized.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { fromRomaji } from '../src/fromRomaji.js';
import { toFormat } from '../src/formats/index.js';
import { isKoazaReadingComplete } from '../src/romaji/validate.js';
import { useKoazaFixtureData } from './helpers.js';

beforeAll(() => useKoazaFixtureData());

describe('toRomaji: a named koaza with a complete reading is romanized and kept', () => {
  it('the exact reported case: 長野県飯田市本町三丁目大横1-1', async () => {
    const result = await toRomaji('長野県飯田市本町三丁目大横1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.parsed.town?.ja).toBe('本町');
    expect(result.value.parsed.koaza?.ja).toBe('三丁目大横');
    expect(result.value.parsed.koaza?.kana).toBe('サンチョウメオオヨコ');
    expect(result.value.parsed.koaza?.romaji).toBe('Sanchomeoyoko');
    expect(result.value.parsed.blockNumbers).toEqual([1, 1]);

    // The koaza must actually appear in the rendered string, adjacent to the
    // town, and never be mistakable for a block number (it is a separate,
    // alphabetic word, not one of the hyphenated digits).
    expect(result.value.formatted).toBe('1-1 Sanchomeoyoko Hommachi, Iida-shi, Nagano, Japan');
  });

  it('the koaza is also carried into toFormat targets, not just the toRomaji string', async () => {
    const result = await toRomaji('長野県飯田市本町三丁目大横1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const google = toFormat(result.value.parsed, 'google-i18n');
    expect(google.addressLines[0]).toContain(result.value.parsed.koaza!.romaji!);

    const shopify = toFormat(result.value.parsed, 'shopify');
    expect(shopify.address1).toContain(result.value.parsed.koaza!.romaji!);

    const stripe = toFormat(result.value.parsed, 'stripe');
    expect(stripe.line1).toContain(result.value.parsed.koaza!.romaji!);
  });

  it('a koaza ending in a positional kanji with a COMPLETE reading is accepted (control)', async () => {
    const result = await toRomaji('北海道札幌市白石区南郷通三丁目西1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.koaza?.ja).toBe('三丁目西');
    expect(result.value.parsed.koaza?.kana).toBe('３チョウメニシ');
    expect(result.value.parsed.koaza?.romaji).toBe('3Chomenishi');
    expect(result.value.formatted).toBe(
      '1-1 3Chomenishi Nangodori, Shiroishi-ku, Sapporo-shi, Hokkaido, Japan',
    );
  });

  it('a town with no koaza in the input is unaffected (no koaza on the parsed result)', async () => {
    const result = await toRomaji('長野県飯田市本町1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.koaza).toBeUndefined();
    expect(result.value.formatted).toBe('1-1 Hommachi, Iida-shi, Nagano, Japan');
  });
});

describe('toRomaji: a named koaza with an INCOMPLETE reading is refused, never dropped', () => {
  it('一丁目北: koaza_k stops at チョウメ, missing 北 — refuses rather than emitting "1chome"', async () => {
    const result = await toRomaji('北海道札幌市白石区南郷通一丁目北1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('KOAZA_READING_INCOMPLETE');
    // The failure must not silently look like a successful, koaza-less
    // conversion: no `value`/`formatted` exists on a Failure at all, and the
    // partial must not claim a koaza was resolved.
    expect(result.partial?.koaza?.romaji).toBeUndefined();
    expect(result.partial?.town?.ja).toBe('南郷通');
  });

  it('十二丁目南: the same truncation pattern, a different positional kanji', async () => {
    const result = await toRomaji('北海道札幌市白石区南郷通十二丁目南1-1');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('KOAZA_READING_INCOMPLETE');
  });
});

describe('fromRomaji: never silently resolves a koaza-bearing address to the koaza-less town', () => {
  it('round-tripping the forward output never returns a DIFFERENT address (identity or explicit failure only)', async () => {
    const forward = await toRomaji('長野県飯田市本町三丁目大横1-1');
    expect(forward.ok).toBe(true);
    if (!forward.ok) return;
    expect(forward.value.formatted).toBe('1-1 Sanchomeoyoko Hommachi, Iida-shi, Nagano, Japan');

    const back = await fromRomaji(forward.value.formatted);
    // This library does not attempt to reverse-match a koaza (there is no
    // per-koaza town index — see fixtures-koaza/README.md and
    // docs/project-status.md item 1's "reverse direction" note): with only
    // this fixture's two 本町 rows, "Sanchomeoyoko Hommachi" cannot match
    // either one (not the flat row: the extra word "Sanchomeoyoko" is never
    // dropped by the matcher's longest-first, front-anchored search; not the
    // koaza row: there is no dataset index keyed by koaza text at all). The
    // explicit TOWN_NOT_FOUND below is that refusal, confirmed rather than
    // assumed — see the branches below for what must hold if that ever
    // changes.
    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.reason).toBe('TOWN_NOT_FOUND');
    if (back.ok) {
      // If the reverse direction ever resolves this outright, it must
      // resolve to the SAME address, koaza included — never silently to the
      // koaza-less 本町.
      expect(back.value.parsed.town?.ja).toBe('本町');
      expect(back.value.parsed.koaza?.ja).toBe('三丁目大横');
    } else if (back.reason === 'AMBIGUOUS') {
      // A legitimate outcome (same shape as any other ambiguity this library
      // already returns): every candidate must still be an address that
      // actually contains 三丁目大横, not the koaza-less 本町 masquerading as
      // one of the choices.
      expect(back.candidates?.length).toBeGreaterThan(0);
      for (const candidate of back.candidates ?? []) {
        if (candidate.town?.ja === '本町') {
          expect(candidate.koaza?.ja).toBe('三丁目大横');
        }
      }
    }
    // Any other failure reason (e.g. TOWN_NOT_FOUND, since the dataset has no
    // per-koaza town index to search) is the documented, acceptable outcome:
    // an explicit typed failure rather than a silently wrong address.
  });
});

/**
 * The completeness rule is the whole basis for deciding whether a koaza can be
 * romanized, so it needs its own tests independent of any fixture dataset.
 *
 * The regression these pin is over-refusal. The first version of the rule
 * mapped each positional kanji to a SINGLE reading (北 -> キタ, 下 -> シモ,
 * 中 -> ナカ, ...) and refused anything whose kana did not end in exactly that.
 * Every name in the second block below was refused by it, and every one of
 * them is an ordinary place name with a perfectly complete reading — the last
 * kanji simply has more than one reading. Refusing them would have turned a
 * fix for silently-dropped koaza into a large new source of spurious
 * KOAZA_READING_INCOMPLETE failures.
 */
describe('isKoazaReadingComplete', () => {
  it('refuses a reading that stops before the trailing kanji', () => {
    // Both measured in the real dataset (assumption 6, run 31782019121):
    // 南郷通's koaza readings stop at チョウメ, omitting the 北/南 entirely.
    expect(isKoazaReadingComplete('一丁目北', '１チョウメ')).toBe(false);
    expect(isKoazaReadingComplete('十二丁目南', '１２チョウメ')).toBe(false);
    // Absent reading is the extreme case of the same thing.
    expect(isKoazaReadingComplete('三丁目大横', undefined)).toBe(false);
    expect(isKoazaReadingComplete('三丁目大横', '   ')).toBe(false);
  });

  it('accepts ordinary names whose trailing kanji takes a non-positional reading', () => {
    const complete: [string, string][] = [
      ['府中', 'フチュウ'],
      ['山中', 'ヤマナカ'],
      ['坂上', 'サカウエ'],
      ['川上', 'カワカミ'],
      ['城下', 'シロシタ'],
      ['宮下', 'ミヤシタ'],
      ['竹之下', 'タケノシタ'],
      ['大東', 'ダイトウ'],
      ['吾妻東', 'アズマヒガシ'],
      ['大西', 'オオニシ'],
      ['台北', 'ダイホク'],
    ];
    for (const [ja, kana] of complete) {
      expect(isKoazaReadingComplete(ja, kana), `${ja} [${kana}]`).toBe(true);
    }
  });

  it('accepts a positional reading that IS present', () => {
    expect(isKoazaReadingComplete('三丁目西', '３チョウメニシ')).toBe(true);
    expect(isKoazaReadingComplete('一丁目北', '１チョウメキタ')).toBe(true);
  });
});
