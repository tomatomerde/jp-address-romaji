/**
 * Regenerate the test fixtures in packages/core/test/fixtures/data.
 *
 * The fixtures are built from the Geolonia **v1** national CSV rather than the
 * v2 data the library ships. That is deliberate: v1 is sparse and contains real
 * defects (missing readings, romaji collapsed to bare numbers, rows carrying a
 * neighbour's reading), so the fixtures keep the refusal paths exercised. v2 is
 * 99.55% covered and would test almost none of them. Real-data behaviour is
 * covered separately by packages/core/test/realdata.test.ts.
 *
 * Needs the v1 CSV (~50 MB) next to this script:
 *
 *   curl -sSL -o latest.csv \
 *     https://raw.githubusercontent.com/geolonia/japanese-addresses/master/data/latest.csv
 *   node scripts/build-fixtures.mjs
 *
 * Only needed when the set of covered municipalities changes; the committed
 * fixtures are otherwise stable.
 */
import fs from 'node:fs';
import path from 'node:path';
import { analyzeKana, renderSyllables } from '../packages/core/src/romaji/hepburn.ts';

function pl(l){const o=[];let c='',q=false;for(let i=0;i<l.length;i++){const ch=l[i];
 if(q){if(ch==='"'){if(l[i+1]==='"'){c+='"';i++;}else q=false;}else c+=ch;}
 else{if(ch==='"')q=true;else if(ch===','){o.push(c);c='';}else c+=ch;}}o.push(c);return o;}

const TARGETS = new Set([
  '東京都|渋谷区',            // Tokyo special ward, chome addresses
  '東京都|新宿区',            // the README example (Nishi-Shinjuku)
  '北海道|札幌市中央区',       // designated city + ward
  '青森県|青森市',            // rural oaza with NO romaji/kana
  '北海道|旭川市',            // corrupt romaji (collapses to bare numbers)
  '新潟県|三島郡出雲崎町',     // county + town
  '京都府|京都市中京区',       // Kyoto street addressing
]);

const lines = fs.readFileSync(path.join(import.meta.dirname, 'latest.csv'), 'utf8').split('\n').filter(l => l.trim());
const h = pl(lines[0]); const ix = {}; h.forEach((x, i) => ix[x] = i);
const G = n => ix[n];

const key = s => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Split combined kana using the romaji token boundary. */
function splitKana(fullKana, firstRomaji) {
  if (!fullKana || !firstRomaji) return [undefined, undefined];
  const target = key(firstRomaji);
  const syl = analyzeKana(fullKana);
  for (let i = 0; i < syl.length; i++) {
    const acc = key(renderSyllables(syl.slice(0, i + 1), 'none'));
    if (acc === target) {
      return [syl.slice(0, i + 1).map(s => s.src).join(''), syl.slice(i + 1).map(s => s.src).join('')];
    }
  }
  return [undefined, undefined];
}

/** Break "三島郡出雲崎町" / "札幌市中央区" into county/city/ward. */
function splitMunicipality(ja, kana, romaji) {
  const out = {};
  let rest = ja, restKana = kana, restRomaji = romaji;

  const gun = rest.match(/^(.+?郡)(.+)$/);
  if (gun) {
    const tokens = (restRomaji || '').split(/\s+/);
    // county romaji is the leading "<NAME> GUN"
    const gi = tokens.findIndex(t => /^gun$/i.test(t));
    const countyR = gi >= 0 ? tokens.slice(0, gi + 1).join(' ') : undefined;
    const [ck, rk] = splitKana(restKana, countyR);
    out.county = gun[1]; out.county_k = ck; out.county_r = countyR;
    rest = gun[2]; restKana = rk;
    restRomaji = gi >= 0 ? tokens.slice(gi + 1).join(' ') : restRomaji;
  }

  const ward = rest.match(/^(.+市)(.+区)$/);
  if (ward) {
    const tokens = (restRomaji || '').split(/\s+/);
    const si = tokens.findIndex(t => /^shi$/i.test(t));
    const cityR = si >= 0 ? tokens.slice(0, si + 1).join(' ') : undefined;
    const wardR = si >= 0 ? tokens.slice(si + 1).join(' ') : undefined;
    const [ck, wk] = splitKana(restKana, cityR);
    out.city = ward[1]; out.city_k = ck; out.city_r = cityR;
    out.ward = ward[2]; out.ward_k = wk; out.ward_r = wardR;
    return out;
  }

  out.city = rest; out.city_k = restKana; out.city_r = restRomaji;
  return out;
}

const KAN = ['〇','一','二','三','四','五','六','七','八','九','十'];
function kanjiNum(k) {
  if (k.includes('十')) { const [a,b] = k.split('十'); return (a ? KAN.indexOf(a) : 1) * 10 + (b ? KAN.indexOf(b) : 0); }
  return KAN.indexOf(k);
}

const prefMap = new Map();
const cityTowns = new Map();

for (let i = 1; i < lines.length; i++) {
  const f = pl(lines[i]); if (f.length < h.length) continue;
  const pref = f[G('都道府県名')], city = f[G('市区町村名')];
  if (!TARGETS.has(`${pref}|${city}`)) continue;

  if (!prefMap.has(pref)) {
    prefMap.set(pref, {
      code: Number(f[G('都道府県コード')]) * 1000 + 1,
      pref, pref_k: f[G('都道府県名カナ')], pref_r: f[G('都道府県名ローマ字')],
      // Upstream indexes point[] without a null check for pref/city.
      point: [Number(f[G('経度')]), Number(f[G('緯度')])],
      cities: new Map(),
    });
  }
  const p = prefMap.get(pref);
  if (!p.cities.has(city)) {
    p.cities.set(city, {
      code: Number(f[G('市区町村コード')]) * 10 + 1,
      ...splitMunicipality(city, f[G('市区町村名カナ')], f[G('市区町村名ローマ字')]),
      point: [Number(f[G('経度')]), Number(f[G('緯度')])],
    });
  }

  const ck = `${pref}|${city}`;
  if (!cityTowns.has(ck)) cityTowns.set(ck, new Map());
  const towns = cityTowns.get(ck);

  const oaza = (f[G('大字町丁目名')] || '').trim();
  const oazaK = (f[G('大字町丁目名カナ')] || '').trim();
  const oazaR = (f[G('大字町丁目名ローマ字')] || '').trim();

  const m = oaza.match(/^(.*?)([一二三四五六七八九十]+)丁目$/);
  const entry = m
    ? { oaza_cho: m[1], oaza_cho_k: oazaK.replace(/\s*\d+$/, ''), oaza_cho_r: oazaR.replace(/\s*\d+$/, ''), chome: `${m[2]}丁目`, chome_n: kanjiNum(m[2]) }
    : { oaza_cho: oaza, oaza_cho_k: oazaK, oaza_cho_r: oazaR };

  for (const k of ['oaza_cho_k', 'oaza_cho_r']) if (!entry[k]) delete entry[k];
  const tk = entry.oaza_cho + '|' + (entry.chome || '');
  if (!towns.has(tk)) towns.set(tk, { machiaza_id: String(towns.size + 1).padStart(7, '0'), ...entry });
}

const ROOT = path.join(import.meta.dirname, '..', 'packages/core/test/fixtures/data');
fs.rmSync(ROOT, { recursive: true, force: true });
fs.mkdirSync(path.join(ROOT, 'ja'), { recursive: true });

const meta = { updated: 1735000000 };
const prefData = [...prefMap.values()].map(p => ({ ...p, cities: [...p.cities.values()] }));
fs.writeFileSync(path.join(ROOT, 'ja.json'), JSON.stringify({ meta, data: prefData }, null, 0));

for (const [ck, towns] of cityTowns) {
  const [pref, city] = ck.split('|');
  const dir = path.join(ROOT, 'ja', pref);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${city}.json`), JSON.stringify({ meta, data: [...towns.values()] }, null, 0));
  console.log(`${ck}: ${towns.size} towns`);
}

// Report what the fixtures actually contain, so the tests assert real behaviour.
for (const p of prefData) for (const c of p.cities) {
  console.log('CITY', p.pref, JSON.stringify(c));
}
const size = fs.readdirSync(path.join(ROOT, 'ja'), { recursive: true });
console.log('files:', size.length);
