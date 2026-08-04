/**
 * Direct reads of the address dataset, used by the reverse (romaji -> Japanese)
 * direction.
 *
 * The forward direction goes through @geolonia/normalize-japanese-addresses,
 * which owns parsing and matching of Japanese text. The reverse direction has
 * no upstream equivalent, so we look up the same JSON files the upstream
 * library reads. Reusing its data layout means there is exactly one dataset to
 * install, and no second index to keep in sync.
 */

import { config } from '@geolonia/normalize-japanese-addresses';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

/** Shape of the prefecture/city index (`ja.json`). */
export interface CityRecord {
  code: number;
  county?: string;
  county_k?: string;
  county_r?: string;
  city: string;
  city_k?: string;
  city_r?: string;
  ward?: string;
  ward_k?: string;
  ward_r?: string;
}

export interface PrefectureRecord {
  code: number;
  pref: string;
  pref_k?: string;
  pref_r?: string;
  cities: CityRecord[];
}

/** Shape of a town record (`ja/<pref>/<city>.json`). */
export interface MachiAzaRecord {
  machiaza_id: string;
  oaza_cho?: string;
  oaza_cho_k?: string;
  oaza_cho_r?: string;
  chome?: string;
  chome_n?: number;
  koaza?: string;
  koaza_k?: string;
  koaza_r?: string;
}

const cache = new Map<string, unknown>();

/** Read one dataset file relative to the configured endpoint. */
async function readDataFile<T>(suffix: string): Promise<T | undefined> {
  const endpoint = config.japaneseAddressesApi;
  if (!endpoint) return undefined;

  const key = endpoint + suffix;
  if (cache.has(key)) return cache.get(key) as T;

  const url = new URL(`${endpoint}${suffix}`);
  let parsed: T;
  try {
    if (url.protocol === 'file:') {
      const text = await fs.readFile(fileURLToPath(url), 'utf-8');
      parsed = JSON.parse(text) as T;
    } else {
      // Only reached when the caller explicitly configured a remote endpoint.
      const response = await fetch(url);
      if (!response.ok) return undefined;
      parsed = (await response.json()) as T;
    }
  } catch {
    return undefined;
  }

  cache.set(key, parsed);
  return parsed;
}

/** Clear the in-process dataset cache (used by tests). */
export function clearDataCache(): void {
  cache.clear();
}

/** All prefectures with their municipalities. */
export async function loadPrefectures(): Promise<PrefectureRecord[] | undefined> {
  const api = await readDataFile<{ data: PrefectureRecord[] }>('.json');
  return api?.data;
}

/** All towns of one municipality. */
export async function loadMachiAza(
  pref: string,
  city: string,
): Promise<MachiAzaRecord[] | undefined> {
  const suffix = `/${encodeURIComponent(pref)}/${encodeURIComponent(city)}.json`;
  const api = await readDataFile<{ data: MachiAzaRecord[] }>(suffix);
  return api?.data;
}

/** Full municipality name as it appears in the dataset path (county+city+ward). */
export function cityPathName(record: CityRecord): string {
  return `${record.county ?? ''}${record.city}${record.ward ?? ''}`;
}
