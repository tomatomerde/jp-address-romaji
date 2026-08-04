#!/usr/bin/env node
/**
 * Refuse to publish this package without a generated dataset.
 *
 * `data/` is not committed — it is built from the upstream API at release
 * time. Publishing without it produces a package that installs cleanly and
 * then makes every conversion fail with DATA_NOT_CONFIGURED, which is exactly
 * the kind of silent, confusing breakage this project is built to avoid.
 *
 * Run `npx tsx src/build-data.ts --out ./data` first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(packageRoot, 'data');
const indexFile = path.join(dataDir, 'ja.json');

if (!fs.existsSync(indexFile)) {
  console.error(`No dataset at ${indexFile}.`);
  console.error('Build it before publishing:');
  console.error('  npx tsx src/build-data.ts --out ./data');
  process.exit(1);
}

const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
const prefectures = index?.data?.length ?? 0;
if (prefectures !== 47) {
  console.error(`ja.json lists ${prefectures} prefectures; expected 47. The dataset is incomplete.`);
  process.exit(1);
}

// Count the per-municipality files rather than trusting the index alone: a
// partial download leaves ja.json complete but its town files missing.
let cityFiles = 0;
const jaDir = path.join(dataDir, 'ja');
for (const pref of fs.readdirSync(jaDir, { withFileTypes: true })) {
  if (pref.isDirectory()) {
    cityFiles += fs.readdirSync(path.join(jaDir, pref.name)).filter((f) => f.endsWith('.json')).length;
  }
}
if (cityFiles < 1800) {
  console.error(`Only ${cityFiles} municipality files present; expected ~1,899. The dataset is incomplete.`);
  process.exit(1);
}

console.log(`Dataset OK: 47 prefectures, ${cityFiles} municipalities.`);
