/**
 * Regression tests for a silent wrong-answer bug present in the published
 * `jp-address-romaji@0.1.7`: when the upstream normalizer matched only a
 * PREFIX of the town the caller wrote, the characters it did not consume were
 * carried into the block-number side of the result and rendered as if they
 * were a building name. The address that came back named a DIFFERENT, real
 * town, with no flag on the result:
 *
 *   toRomaji('東京都新宿区中井1番1号', {})
 *     -> ok: true, "井1-1, Nakacho, Shinjuku-ku, Tokyo, Japan"
 *
 * `中井` is in the dataset (`Nakai`, chome 1 and 2), and the same address
 * written `中井1-1` or `中井一丁目1番1号` resolves to it correctly. The
 * `N番M号` spelling is what breaks: the normalizer registers `中` as an alias
 * of `中町` (it allows a trailing `町` to be omitted) and tries that alias
 * before the "chome written without 丁目" pattern that would have matched
 * `中井1`, so `中町`/`Nakacho` wins and `井` is left over.
 *
 * The leftover is the part this package owns. `splitBlockNumbers` hands
 * anything that is not a leading run of digits to `unparsed`, which `render`
 * prints verbatim as a building name — so text the normalizer failed to
 * attribute to the ADDRESS was silently reclassified as not being part of the
 * address at all. Both halves of the answer were wrong and neither was
 * flagged, which is the one thing this library exists not to do (README's
 * "refuses rather than guesses", CLAUDE.md's 「読みを推測しない」).
 *
 * The fix refuses instead: text sitting between the town and the block
 * numbers means the town was not fully resolved, so the conversion fails with
 * `TOWN_NOT_FOUND` rather than answering with a different address. It is the
 * same call `KOAZA_READING_INCOMPLETE` makes — never drop or reclassify part
 * of the address and return `ok`.
 *
 * See fixtures-town-prefix-leftover/README.md for the records and for the
 * evidence that every one of them is real.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { toRomaji } from '../src/toRomaji.js';
import { useTownPrefixLeftoverFixtureData } from './helpers.js';

beforeAll(() => useTownPrefixLeftoverFixtureData());

describe('toRomaji: a town that only prefix-matched must not be answered', () => {
  it('refuses 東京都新宿区中井1番1号 instead of answering with 中町', async () => {
    const result = await toRomaji('東京都新宿区中井1番1号');

    // The bug, stated as the thing that must not happen: a successful result
    // naming a town the caller did not write.
    if (result.ok) {
      expect(result.value.parsed.town?.ja).not.toBe('中町');
      expect(result.value.formatted).not.toContain('Nakacho');
      expect(result.value.formatted).not.toContain('井');
    }

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    // The leftover is named, so the caller can see WHY it was refused.
    expect(result.message).toContain('井');
    // Whatever was resolved is still reported for diagnostics.
    expect(result.partial?.city?.ja).toBe('新宿区');
  });

  it('refuses 北海道札幌市中央区宮の森一条1番1号 instead of answering with 宮の森', async () => {
    // The same shape reached a different way: 宮の森 is a literal prefix of
    // 宮の森一条, no `町`-omission alias involved. Both must refuse, or the
    // fix only covers the one municipality it was written against.
    const result = await toRomaji('北海道札幌市中央区宮の森一条1番1号');

    if (result.ok) {
      expect(result.value.formatted).not.toContain('一条1-1');
    }

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('TOWN_NOT_FOUND');
    expect(result.message).toContain('一条');
  });

  it('names the town it did resolve, so the message is actionable', async () => {
    const result = await toRomaji('東京都新宿区中井1番1号');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The partial carries the municipality; the message carries the leftover
    // and the town the normalizer settled on. Without the latter the caller
    // cannot tell a prefix match from an unknown town.
    expect(result.message).toContain('中町');
  });
});

describe('toRomaji: the same shape still succeeds when nothing is left over', () => {
  it('東京都新宿区中町1番1号 -> 1-1 Nakacho', async () => {
    // The town the buggy match landed on, spelled the way its own row spells
    // it. Nothing is left over, so this must still convert — a fix that
    // refuses this too would be refusing the `N番M号` notation itself.
    const result = await toRomaji('東京都新宿区中町1番1号');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-1 Nakacho, Shinjuku-ku, Tokyo, Japan');
  });

  it('東京都新宿区中井一丁目1番1号 -> 1-1-1 Nakai', async () => {
    const result = await toRomaji('東京都新宿区中井一丁目1番1号');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-1-1 Nakai, Shinjuku-ku, Tokyo, Japan');
  });

  it('東京都新宿区中井1-1 -> 1-1 Nakai', async () => {
    // Hyphen notation takes a different path through the upstream patterns and
    // was never broken. Pinned so a fix cannot "solve" the refusal by making
    // this one refuse as well.
    const result = await toRomaji('東京都新宿区中井1-1');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe('1-1 Nakai, Shinjuku-ku, Tokyo, Japan');
  });

  it('北海道札幌市中央区宮の森一条一丁目1番1号 -> 1-1 Miyanomori 1-Jo', async () => {
    const result = await toRomaji('北海道札幌市中央区宮の森一条一丁目1番1号');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.formatted).toBe(
      '1-1-1 Miyanomori 1-Jo, Chuo-ku, Sapporo-shi, Hokkaido, Japan',
    );
  });

  it('keeps a building name that follows the block numbers', async () => {
    // The `unparsed` slot is not being closed off — only the case where it
    // would swallow text that sits BEFORE the block numbers.
    const result = await toRomaji('東京都新宿区中町1番1号 サンプルビル301');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.parsed.unparsed).toBe('サンプルビル301');
    expect(result.value.parsed.blockNumbers).toEqual([1, 1]);
  });
});
