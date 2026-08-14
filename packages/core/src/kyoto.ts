/**
 * Kyoto-style street-name addresses.
 *
 * Central Kyoto is customarily addressed by naming an intersection and a
 * direction before the town:
 *
 *   京都府京都市中京区烏丸通四条上ル笋町
 *   └ prefecture ┘└ city ┘└ward┘└ street phrase ┘└town┘
 *
 * The street phrase is navigational, not administrative. The official address
 * is the town plus its parcel number, and the dataset models only that.
 *
 * Passing such an address to the normalizer unchanged is actively dangerous,
 * because street names contain the same kanji numerals that chome do:
 *
 *   烏丸通四条上ル笋町  ->  town "四丁目"   (!!)
 *
 * It reads the 四 of 四条 as chome 4 and resolves to an unrelated place. So
 * the phrase is separated out first, and the remainder — which is an ordinary
 * town address — is normalized as usual:
 *
 *   烏丸通四条上ル笋町  ->  street "烏丸通四条上ル" + town 笋町 (Takanna-cho)
 *
 * The phrase itself is never romanized: the dataset carries no readings for
 * street names, and guessing one is exactly what this library refuses to do.
 * It is preserved verbatim on the parsed address instead.
 */

/** Directional markers that terminate a Kyoto street phrase. */
const DIRECTION = '上ル|上る|下ル|下る|東入ル|東入る|西入ル|西入る|東入|西入';

/**
 * A street phrase sitting between the ward and the town.
 *
 * Anchored to the preceding `区` so that the prefecture, city and ward are
 * never swallowed, and requires a `通` before the direction so that a `上る`
 * inside an ordinary building name cannot trigger it.
 */
const KYOTO_STREET = new RegExp(`(?<=区)(.*?通.*?(?:${DIRECTION}))`);

/** The street phrase and the address with it removed. */
export interface KyotoSplit {
  /** The street phrase, verbatim. Undefined when the address has none. */
  street?: string;
  /** The address with the street phrase removed, ready for normalization. */
  rest: string;
}

/**
 * Separate a Kyoto street phrase from the rest of the address.
 *
 * Returns the input unchanged when it is not a Kyoto street address.
 */
export function splitKyotoStreet(input: string): KyotoSplit {
  if (!isKyotoAddress(input)) return { rest: input };
  const match = input.match(KYOTO_STREET);
  if (!match?.[1]) return { rest: input };
  return { street: match[1], rest: input.replace(match[1], '') };
}

/** Is this address in Kyoto City, where street-name addressing is used? */
function isKyotoAddress(input: string): boolean {
  return input.includes('京都市');
}

/**
 * Does this look like a Kyoto street-name address?
 *
 * Used to give a precise diagnosis when the town still cannot be resolved
 * after the street phrase is removed.
 */
export function isKyotoStreetAddress(input: string): boolean {
  return splitKyotoStreet(input).street !== undefined;
}
