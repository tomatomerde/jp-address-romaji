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
