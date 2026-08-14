/**
 * Validation of romaji values coming from the address dataset.
 *
 * Measured against the shipped v2 dataset (638,567 town entries), no populated
 * romaji field is corrupt in the "collapsed to a bare number" sense that the
 * older v1 data suffered from — there, 2.51% of values had degraded to a plain
 * chome number (`一条通十丁目` -> `"10"`). The check below is kept as a cheap
 * guard against that class of defect returning.
 */

/**
 * Is this dataset romaji value usable as a place name?
 *
 * A value with no Latin letters at all is a corrupt row, not a name.
 *
 * Note that a trailing digit is NOT a corruption signal: in v2 the chome lives
 * in its own field and never appears in the town romaji, so a trailing digit
 * belongs to the name itself (`政和第一` -> `"Seiwadai1"`, `四重麦四` ->
 * `"Yoemugi4"`). An earlier version stripped trailing digits before this test
 * and silently truncated exactly those names.
 */
export function isUsableRomajiField(value: string | undefined | null): value is string {
  if (!value) return false;
  const stem = value.trim();
  if (stem.length === 0) return false;
  return /[A-Za-z]/.test(stem);
}

/** Small kana that combine with the preceding character rather than adding a mora. */
const COMBINING_KANA = /[ァィゥェォャュョヮ]/g;

/**
 * Does the kana reading have a plausible length for the kanji it reads?
 *
 * This catches a different corruption from {@link isUsableRomajiField}: rows
 * where the reading fields were shifted from a neighbouring entry, so the
 * kana and romaji agree with each other but describe a different place. A real
 * example from the dataset:
 *
 *   円山     -> "マルヤマニシマチ" / "MARUYAMANISHIMACHI"   (belongs to 円山西町)
 *
 * Cross-checking kana against romaji cannot detect this, because both fields
 * are wrong in the same way. Length can: two kanji reading as eight mora is
 * far outside the normal range for place names.
 *
 * The budget counts hiragana/katakana that are part of the NAME ITSELF, not
 * just kanji. An earlier version counted kanji only, and flagged legitimate
 * mixed-script urban names as corrupt — for example:
 *
 *   南あいの里 (3 kanji + 3 kana) -> ミナミアイノサト (8 mora)
 *   柏インター東 (3 kanji + 4 katakana) -> カシワインターヒガシ (10 mora)
 *
 * counting only the 2-3 kanji made those look as implausible as the genuine
 * corruption. Measured on the national dataset (162,320 entries with 2+
 * kanji), the kanji-only version flagged 368, of which 268 (73%) were false
 * positives of exactly this shape — nearly all of them ordinary chome
 * addresses, the segment this library serves best. Counting kana in the name
 * toward the budget drops that to 102 flagged, of which manual review found
 * roughly 69 to be genuine shifted or corrupted readings (concentrated in
 * 青森県平川市, suggesting that municipality's data has a systematic issue)
 * and the remainder kana readings containing stray digits — also corrupt,
 * just a different kind.
 *
 * Single-kanji, no-kana names are exempt because short names legitimately
 * carry long readings (`幸` -> サイワイ). A false positive costs an explicit
 * NO_ROMAJI_DATA failure; a false negative costs a confidently wrong address.
 * The threshold is set to prefer the former.
 */
export function isPlausibleReading(ja: string, kana: string | undefined): boolean {
  if (!kana) return true; // Nothing to check; absence is handled elsewhere.
  const { ja: stem, kana: reading } = stripAzaPrefix(ja, kana);
  const kanjiCount = (stem.match(/[一-鿿]/g) ?? []).length;
  if (kanjiCount < 2) return true;
  // Hiragana/katakana that are part of the place name, not the reading.
  const nameKanaCount = (stem.match(/[ぁ-ゟ゠-ヿ]/g) ?? []).length;
  const moraCount = reading.replace(COMBINING_KANA, '').length;
  return moraCount <= kanjiCount * 3.5 + nameKanaCount * 1.5;
}

/**
 * Remove a leading `大字` / `字` from a name and its reading together.
 *
 * The v2 dataset spells the prefix out in the kana too — `大字三泊村` reads
 * `オオアザサンドマリムラ` — so stripping it from only one side skews any
 * comparison between them. Doing exactly that made {@link isPlausibleReading}
 * flag 23,193 entries (3.65% of everything with a reading) as corrupt: the
 * kanji count dropped by two while four mora of `オオアザ` stayed in the
 * reading. Those were all ordinary rural addresses, and the library refused
 * every one of them.
 */
function stripAzaPrefix(ja: string, kana: string): { ja: string; kana: string } {
  if (ja.startsWith('大字')) {
    return { ja: ja.slice(2), kana: kana.replace(/^オオアザ/, '') };
  }
  if (ja.startsWith('字')) {
    return { ja: ja.slice(1), kana: kana.replace(/^アザ/, '') };
  }
  return { ja, kana };
}

/**
 * Trailing positional kanji, mapped to the katakana a complete reading must
 * end with when the koaza name ends with that kanji.
 *
 * This is the one class of koaza-reading truncation we have direct evidence
 * of. A sample from the dataset (assumption 6 in
 * scripts/verify-data-assumptions.ts, GitHub Actions run 31782019121):
 *
 *   北海道札幌市白石区南郷通 + koaza "一丁目北"   [kana "１チョウメ"  / romaji —]
 *   北海道札幌市白石区南郷通 + koaza "十二丁目南" [kana "１２チョウメ" / romaji —]
 *
 * In both, `koaza_k` stops at チョウメ ("chome") — the trailing 北/南 simply
 * is not in the reading. This is invisible to {@link isPlausibleReading}: it
 * only bounds a reading from ABOVE (too many mora for the kanji), and 4 kanji
 * against 4 mora (「一丁目北」 / "ｲﾁﾁｮｳﾒ") sits comfortably inside that bound
 * — a truncated reading can still look length-plausible. Transliterating it
 * anyway would spell a real, different place (南郷通 minus its 北/南
 * qualifier) as though it were the queried one — precisely the "different
 * address" failure this fix exists to close, just relocated one field over.
 *
 * The rule only fires on this one specific, evidenced shape: a koaza whose
 * LAST character is one of these seven kanji. It cannot detect other kinds of
 * mid-string or differently-shaped truncation — no dataset evidence of those
 * has been measured yet — so it is deliberately narrow rather than a general
 * "does this reading look complete" heuristic. Extend the table (or the
 * measurement) if a wider evidenced pattern turns up; do not add speculative
 * entries.
 */
const TRAILING_POSITIONAL_KANJI: Record<string, string> = {
  北: 'キタ',
  南: 'ミナミ',
  東: 'ヒガシ',
  西: 'ニシ',
  上: 'カミ',
  下: 'シモ',
  中: 'ナカ',
};

/**
 * Can a koaza's dataset reading be trusted to cover the WHOLE name, not just
 * a truncated prefix of it?
 *
 * This is a stricter, koaza-specific companion to {@link isPlausibleReading}:
 * that function only catches a reading that is too LONG for its kanji (a
 * shifted dataset row); it explicitly cannot catch a reading that is too
 * SHORT (see {@link TRAILING_POSITIONAL_KANJI}'s comment for the measured
 * example). Both checks run here because a koaza can fail either way: a
 * shifted/corrupt row is just as unromanizable as a truncated one.
 *
 * No reading at all is the extreme case of "does not cover the name" and is
 * refused the same way — measured at assumption 6 in
 * scripts/verify-data-assumptions.ts, 100% of NAMED koaza in the shipped v2
 * dataset carry `koaza_k`, so this branch is not expected to fire on real
 * data, but a missing reading must fail closed rather than be silently
 * skipped if that measurement ever changes.
 *
 * Deliberately conservative in the direction CLAUDE.md requires: a false
 * positive here costs an explicit `KOAZA_READING_INCOMPLETE` refusal; a false
 * negative costs a confidently wrong address (part of the koaza silently
 * missing from the output, exactly like the original bug). When the two
 * checks above do not settle it either way, this returns `true` — there is no
 * further evidence to refuse on, and refusing every koaza outright (rather
 * than only the ones with a known failure signature) would defeat the point
 * of romanizing them at all. `scripts/verify-data-assumptions.ts` reports how
 * many named koaza this accepts vs. refuses on the real dataset, so that
 * balance can be checked against real data rather than assumed.
 */
export function isKoazaReadingComplete(ja: string, kana: string | undefined): boolean {
  if (!kana || kana.trim().length === 0) return false;
  if (!isPlausibleReading(ja, kana)) return false;

  const lastChar = ja.normalize('NFKC').slice(-1);
  const expectedTail = TRAILING_POSITIONAL_KANJI[lastChar];
  if (expectedTail && !kana.endsWith(expectedTail)) return false;

  return true;
}
