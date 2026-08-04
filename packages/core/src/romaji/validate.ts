/**
 * Validation of romaji values coming from the address dataset.
 *
 * The dataset is not uniformly trustworthy. Measured against the national
 * town-level data, 2.51% of populated romaji fields (4,164 entries) are
 * corrupt: the name collapsed to a bare chome number. Examples, all real:
 *
 *   一条通十丁目  -> "10"
 *   大字中野一丁目 -> "1"
 *
 * These cluster in a few municipalities (Asahikawa 2,045, Nakashibetsu 773,
 * Hirosaki 301). Emitting them would produce an address like "10, Asahikawa-shi"
 * that looks plausible and is useless, so we detect and reject them.
 */

/** Strip the trailing chome number the dataset appends (`ASAHIGAOKA 1`). */
export function stripTrailingChomeNumber(value: string): string {
  return value.replace(/[\s-]*\d+$/, '').trim();
}

/**
 * Is this dataset romaji value usable as a place name?
 *
 * Rejects values that carry no alphabetic content once the trailing chome
 * number is removed — which is exactly the corruption described above.
 */
export function isUsableRomajiField(value: string | undefined | null): value is string {
  if (!value) return false;
  const stem = stripTrailingChomeNumber(value);
  if (stem.length === 0) return false;
  // Must contain at least one Latin letter; a name made only of digits,
  // spaces or punctuation is corrupt data, not a name.
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
  const stem = ja.replace(/^大字/, '');
  const kanjiCount = (stem.match(/[一-鿿]/g) ?? []).length;
  if (kanjiCount < 2) return true;
  // Hiragana/katakana that are part of the place name, not the reading.
  const nameKanaCount = (stem.match(/[ぁ-ゟ゠-ヿ]/g) ?? []).length;
  const moraCount = kana.replace(COMBINING_KANA, '').length;
  return moraCount <= kanjiCount * 3.5 + nameKanaCount * 1.5;
}
