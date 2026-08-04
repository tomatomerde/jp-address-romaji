/**
 * Adapters to the address shapes used by common commerce and payment APIs.
 *
 * All three place the building name in their second address line, unmodified.
 * None of them get a translated or romanized building name, because we do not
 * produce one.
 */

import type { ParsedAddress } from '../types.js';
import { formatBlockNumbers } from '../romaji/format.js';

/** Target address schema. */
export type FormatTarget = 'google-i18n' | 'shopify' | 'stripe';

/** https://github.com/google/libaddressinput address fields. */
export interface GoogleI18nAddress {
  regionCode: 'JP';
  postalCode?: string;
  /** Prefecture. */
  administrativeArea?: string;
  /** Municipality (and ward, when present). */
  locality?: string;
  /** Sub-locality: the town. */
  sublocality?: string;
  addressLines: string[];
  languageCode: 'ja' | 'en';
}

/** Shopify REST/GraphQL address fields. */
export interface ShopifyAddress {
  address1: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country: 'Japan';
  countryCode: 'JP';
}

/** Stripe address fields. */
export interface StripeAddress {
  line1: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country: 'JP';
}

/** Map a target name to its address type. */
export interface FormatMap {
  'google-i18n': GoogleI18nAddress;
  shopify: ShopifyAddress;
  stripe: StripeAddress;
}

/** The municipality line: city plus ward, in western order. */
function localityOf(parsed: ParsedAddress): string | undefined {
  const parts = [parsed.ward?.romaji, parsed.city?.romaji, parsed.county?.romaji].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** The street line: block numbers plus town. */
function streetOf(parsed: ParsedAddress): string {
  const numbers = formatBlockNumbers(parsed.chome, parsed.blockNumbers);
  const town = parsed.town?.romaji ?? parsed.town?.ja ?? '';
  return [numbers, town].filter(Boolean).join(' ').trim();
}

/**
 * Convert a parsed address into a service-specific address object.
 *
 * The `unparsed` building name is carried through verbatim into the second
 * address line of each format.
 */
export function toFormat<T extends FormatTarget>(
  parsed: ParsedAddress,
  target: T,
): FormatMap[T] {
  const street = streetOf(parsed);
  const locality = localityOf(parsed);
  const region = parsed.prefecture?.romaji ?? parsed.prefecture?.ja;

  switch (target) {
    case 'google-i18n': {
      const value: GoogleI18nAddress = {
        regionCode: 'JP',
        languageCode: 'en',
        addressLines: [street, ...(parsed.unparsed ? [parsed.unparsed] : [])].filter(Boolean),
        ...(parsed.postalCode ? { postalCode: parsed.postalCode } : {}),
        ...(region ? { administrativeArea: region } : {}),
        ...(locality ? { locality } : {}),
        ...(parsed.town?.romaji ? { sublocality: parsed.town.romaji } : {}),
      };
      return value as FormatMap[T];
    }
    case 'shopify': {
      const value: ShopifyAddress = {
        address1: street,
        ...(parsed.unparsed ? { address2: parsed.unparsed } : {}),
        ...(locality ? { city: locality } : {}),
        ...(region ? { province: region } : {}),
        ...(parsed.postalCode ? { zip: parsed.postalCode } : {}),
        country: 'Japan',
        countryCode: 'JP',
      };
      return value as FormatMap[T];
    }
    case 'stripe': {
      const value: StripeAddress = {
        line1: street,
        ...(parsed.unparsed ? { line2: parsed.unparsed } : {}),
        ...(locality ? { city: locality } : {}),
        ...(region ? { state: region } : {}),
        ...(parsed.postalCode ? { postal_code: parsed.postalCode } : {}),
        country: 'JP',
      };
      return value as FormatMap[T];
    }
    default: {
      const exhaustive: never = target;
      throw new Error(`Unknown format target: ${String(exhaustive)}`);
    }
  }
}
