#!/usr/bin/env node
/**
 * CLI for building or refreshing the offline address dataset.
 *
 *   npx jp-address-romaji-data build --out ./address-data
 *
 * Downloading the dataset contacts Geolonia once. Converting addresses never
 * does — that is the point of keeping the data local.
 */

import { dataDir, isDataPresent } from './index.js';

const [command] = process.argv.slice(2);

switch (command) {
  case 'build':
  case 'fetch-data': {
    // Delegate to the builder, preserving the remaining arguments.
    await import('./build-data.js');
    break;
  }
  case 'where': {
    console.log(dataDir);
    break;
  }
  case 'status': {
    console.log(isDataPresent() ? `Dataset present at ${dataDir}` : 'Dataset not built.');
    process.exitCode = isDataPresent() ? 0 : 1;
    break;
  }
  default: {
    console.log(`jp-address-romaji-data

Usage:
  jp-address-romaji-data build [--out <dir>] [--endpoint <url>] [--concurrency <n>]
                              [--attempts <n>] [--retry-delay <ms>]
      Download and generate the offline dataset. Municipalities that fail the
      concurrent pass are retried afterwards one at a time; only what still
      fails then is fatal.
  jp-address-romaji-data where
      Print the bundled dataset directory.
  jp-address-romaji-data status
      Report whether the dataset has been generated.
`);
    process.exitCode = command ? 1 : 0;
  }
}
