/**
 * Detection of Kyoto-style street-name addresses.
 *
 * Central Kyoto is addressed by naming the intersection and a direction
 * rather than by machi-aza alone, e.g.
 *
 *   京都府京都市中京区四条通烏丸東入ル函谷鉾町
 *
 * The `通` / `上ル` / `下ル` / `東入` / `西入` portion is an interstitial
 * navigation phrase, not an administrative unit, and the address dataset does
 * not model it. Rather than silently dropping it — which would produce a
 * confidently wrong address — this version detects the pattern and refuses.
 *
 * Documented as unsupported in the README.
 */

/** Directional phrases used in Kyoto street addressing. */
const KYOTO_DIRECTION = /(上ル|上る|下ル|下る|東入ル|東入る|西入ル|西入る|東入|西入)/;

/** `〜通` used as a street name, followed by a directional phrase. */
const KYOTO_STREET = /通[^\s]{0,8}?(上ル|上る|下ル|下る|東入|西入)/;

/**
 * Does this look like a Kyoto street-name address?
 *
 * Only applied to addresses that mention Kyoto, so that a `上る` appearing
 * inside an ordinary building name elsewhere does not trigger a refusal.
 */
export function isKyotoStreetAddress(input: string): boolean {
  const mentionsKyoto = input.includes('京都市') || input.includes('京都府');
  if (!mentionsKyoto) return false;
  return KYOTO_STREET.test(input) || KYOTO_DIRECTION.test(input);
}
