/**
 * End-to-end tests for the dataset builder, run against a local HTTP server.
 *
 * These drive `build-data.ts` as a subprocess — the same entry point the
 * release workflow invokes — rather than importing it, because the module
 * runs `main()` on import and because the exit code is part of the contract:
 * a partial dataset must fail the build.
 *
 * The upstream host is unreachable from the development environment, so the
 * fixture server here is the only way to exercise the download path at all.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';

const repoRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const script = path.join(repoRoot, 'packages/data/src/build-data.ts');
const tsx = path.join(repoRoot, 'node_modules/.bin/tsx');

/** Two prefectures, three municipalities — enough to exercise the job fan-out. */
const PREFECTURES = [
  {
    code: 13,
    pref: '東京都',
    pref_r: 'Tokyo',
    point: [139.69, 35.68],
    cities: [
      { code: 13101, city: '千代田区', city_r: 'Chiyoda', point: [139.75, 35.69] },
      { code: 13102, city: '中央区', city_r: 'Chuo', point: [139.77, 35.67] },
    ],
  },
  {
    code: 26,
    pref: '京都府',
    pref_r: 'Kyoto',
    point: [135.75, 35.02],
    cities: [{ code: 26100, city: '京都市', ward: '北区', ward_r: 'Kita', point: [135.75, 35.05] }],
  },
];

/** Town records carry a `point` upstream; the builder is expected to drop it. */
const TOWNS: Record<string, unknown[]> = {
  '東京都/千代田区': [
    { machiaza_id: '0001', oaza_cho: '丸の内', oaza_cho_k: 'マルノウチ', oaza_cho_r: 'Marunouchi', point: [139.76, 35.68], csv_ranges: {} },
  ],
  '東京都/中央区': [
    { machiaza_id: '0002', oaza_cho: '銀座', oaza_cho_k: 'ギンザ', oaza_cho_r: 'Ginza', chome: '一丁目', chome_n: 1, point: [139.76, 35.67] },
  ],
  '京都府/京都市北区': [
    { machiaza_id: '0003', oaza_cho: '小山', oaza_cho_k: 'コヤマ', oaza_cho_r: 'Koyama', point: [135.75, 35.04] },
  ],
};

interface Server {
  url: string;
  close: () => Promise<void>;
  /** How many requests each municipality path actually received. */
  hits: Map<string, number>;
}

/**
 * @param failures municipality key -> how many of its requests to answer 503.
 *   `Infinity` never recovers.
 */
async function startServer(failures: Map<string, number> = new Map()): Promise<Server> {
  const hits = new Map<string, number>();
  const remaining = new Map(failures);

  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);

    if (pathname === '/api/ja.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: PREFECTURES }));
      return;
    }

    const match = /^\/api\/ja\/(.+)\.json$/.exec(pathname);
    if (match) {
      const key = match[1]!;
      hits.set(key, (hits.get(key) ?? 0) + 1);

      const left = remaining.get(key) ?? 0;
      if (left > 0) {
        remaining.set(key, left - 1);
        res.writeHead(503).end('upstream hiccup');
        return;
      }

      const towns = TOWNS[key];
      if (!towns) {
        res.writeHead(404).end('no such municipality');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: towns }));
      return;
    }

    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/api/ja`,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runBuild(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(tsx, [script, ...args], { cwd: repoRoot });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => (stdout += String(c)));
    child.stderr.on('data', (c) => (stderr += String(c)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

let outDir: string;
let server: Server | undefined;

beforeEach(async () => {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jp-address-build-'));
});

afterEach(async () => {
  await server?.close();
  server = undefined;
  await fs.rm(outDir, { recursive: true, force: true });
});

/** Keep the suite fast: the real defaults back off for seconds. */
const FAST = ['--attempts', '2', '--retry-delay', '10'];

interface OutCity {
  code: number;
  city: string;
  point?: unknown;
}
interface OutPrefecture {
  code: number;
  pref: string;
  point?: unknown;
  cities: OutCity[];
}
interface OutTown {
  machiaza_id: string;
  oaza_cho?: string;
  oaza_cho_r?: string;
  chome_n?: number;
  point?: unknown;
  csv_ranges?: unknown;
}

async function readJson<T>(...segments: string[]): Promise<{ meta: { updated: number }; data: T[] }> {
  const raw = await fs.readFile(path.join(outDir, ...segments), 'utf8');
  return JSON.parse(raw) as { meta: { updated: number }; data: T[] };
}

describe('build-data', () => {
  it('全件取得できたときは終了コード0で、期待どおりのファイルを書く', async () => {
    server = await startServer();
    const result = await runBuild(['--endpoint', server.url, '--out', outDir, ...FAST]);

    expect(result.code).toBe(0);

    const index = await readJson<OutPrefecture>('ja.json');
    expect(index.data).toHaveLength(2);
    // Prefecture and city points must survive: upstream throws without them.
    expect(index.data[0]!.point).toEqual([139.69, 35.68]);
    expect(index.data[0]!.cities[0]!.point).toEqual([139.75, 35.69]);

    const chiyoda = await readJson<OutTown>('ja', '東京都', '千代田区.json');
    expect(chiyoda.data[0]!.oaza_cho_r).toBe('Marunouchi');
    // Town points are dropped for size; csv_ranges is not read by this library.
    expect(chiyoda.data[0]!.point).toBeUndefined();
    expect(chiyoda.data[0]!.csv_ranges).toBeUndefined();

    // county/ward are part of the path name, not just the record.
    await expect(readJson<OutTown>('ja', '京都府', '京都市北区.json')).resolves.toBeTruthy();
  });

  it('一度きりの失敗で全体を落とさない: 最初のパスを使い切っても、掃き取りで回収して終了コード0', async () => {
    // 2 attempts in pass 1, so 2 failures exhaust it. The sweep must recover.
    server = await startServer(new Map([['東京都/千代田区', 2]]));
    const result = await runBuild(['--endpoint', server.url, '--out', outDir, ...FAST]);

    expect(result.code).toBe(0);
    const chiyoda = await readJson<OutTown>('ja', '東京都', '千代田区.json');
    expect(chiyoda.data[0]!.oaza_cho_r).toBe('Marunouchi');
    // 2 failed + at least one sweep attempt that succeeded.
    expect(server.hits.get('東京都/千代田区')).toBeGreaterThan(2);
    expect(result.stdout + result.stderr).toMatch(/retr/i);
  });

  // Before validation existed, `--concurrency abc` reached mapLimit as NaN and
  // `--concurrency 0` as zero. Both start no workers at all: the build printed
  // "Done. 0 towns", wrote no municipality files, and exited 0 — a silently
  // empty dataset reported as a success.
  it.each(['abc', '0'])('数値にならない --concurrency %s は、黙って空を作らず落とす', async (value) => {
    server = await startServer();
    const result = await runBuild([
      '--endpoint', server.url, '--out', outDir, '--concurrency', value,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--concurrency must be a positive integer');
    // A usage error should not read like a crash.
    expect(result.stderr).not.toContain('at main');
    await expect(readJson<OutTown>('ja', '東京都', '千代田区.json')).rejects.toThrow();
  });

  // Both of the next two used to exit 0 against the wrong settings. A build
  // that looks like it worked is worse than one that stops.
  it('打ち間違えたフラグは既定値に落ちず、名前を挙げて終了コード1で落とす', async () => {
    server = await startServer();
    const result = await runBuild([
      '--endpoint', server.url, '--out', outDir, '--conurrency', '8', ...FAST,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('unknown flag --conurrency');
    // A usage error should not read like a crash.
    expect(result.stderr).not.toContain('at main');
    await expect(readJson<OutTown>('ja', '東京都', '千代田区.json')).rejects.toThrow();
  });

  it('値を渡し忘れたフラグは、次のフラグを値として吸わない', async () => {
    server = await startServer();
    const result = await runBuild([
      '--endpoint', server.url, '--out', '--concurrency', '5', ...FAST,
    ]);

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('--out needs a value');
    // The old parser resolved `--concurrency` as the output directory and
    // wrote the entire dataset into it.
    await expect(fs.stat(path.join(repoRoot, '--concurrency'))).rejects.toThrow();
  });

  it('--flag=value 形式も受ける', async () => {
    server = await startServer();
    const result = await runBuild([
      `--endpoint=${server.url}`, `--out=${outDir}`, '--attempts=2', '--retry-delay=10',
    ]);

    expect(result.code).toBe(0);
    await expect(readJson<OutTown>('ja', '東京都', '千代田区.json')).resolves.toBeTruthy();
  });

  it('掃き取りでも回復しないものは、名前を挙げて終了コード1で落とす', async () => {
    server = await startServer(new Map([['東京都/中央区', Number.POSITIVE_INFINITY]]));
    const result = await runBuild(['--endpoint', server.url, '--out', outDir, ...FAST]);

    expect(result.code).toBe(1);
    // The failure has to be identifiable, not just counted.
    expect(result.stderr).toContain('東京都中央区');
    // The rest of the dataset is still written; only the build verdict fails.
    await expect(readJson<OutTown>('ja', '東京都', '千代田区.json')).resolves.toBeTruthy();
  });
});
