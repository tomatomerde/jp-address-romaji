#!/usr/bin/env bash
#
# Assembles the demo site into an output directory (default: demo/_site).
#
# The demo deliberately runs the *published* packages rather than a build of
# the working tree: a visitor who runs `npm install jp-address-romaji` must get
# the behaviour they just saw on the page. Both halves are pinned —
# demo/pinned-version.txt for the library and demo/pinned-data-version.txt for
# the dataset — and both versions are stamped into the page.
#
# The dataset is the part that makes this demo different from its siblings. In
# a browser the library has no filesystem, so the data is fetched from an
# endpoint the page hosts. The full published dataset is ~1,900 municipality
# files, so only the ones listed in demo/municipalities.txt are copied; the
# nationwide index (ja.json) is shipped whole and unmodified, because trimming
# it would make the library answer "no such municipality" about real places.
#
# Run: ./demo/build.sh [outdir]
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/.." && pwd)"
out="${1:-$here/_site}"
version="$(tr -d '[:space:]' < "$here/pinned-version.txt")"
data_version="$(tr -d '[:space:]' < "$here/pinned-data-version.txt")"

# The versions are substituted into the page with sed, so a stray `/` (or a
# leading `v`) would either break the substitution or quietly print a version
# that does not exist. Matched with bash's own `=~` rather than piping into
# `grep -q`: under `set -o pipefail` an early-exiting reader kills the writer
# with SIGPIPE and fails the pipeline precisely when the pattern matches.
for pin in "pinned-version.txt:$version" "pinned-data-version.txt:$data_version"; do
  file="${pin%%:*}"
  value="${pin#*:}"
  if [[ ! "$value" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
    echo "demo/$file must contain a bare semver, got: '$value'" >&2
    exit 1
  fi
done

# A fixed path under demo/, not mktemp -d.
#
# esbuild writes each module's path into the bundle as a comment, so a temp
# directory ends up baked into what gets published: a sibling project's first
# deployed bundle carried 22 lines naming `/tmp/tmp.elSrzUwrDZ/...`. Two things
# follow, and the second is the one that matters. It leaks the build machine's
# scratch path into a public artifact, and it makes the build irreproducible —
# rebuilding produced a bundle that differed from the deployed one in exactly
# those comment lines, so "is the published page running the bytes I think it
# is?" could no longer be answered by comparing hashes. Anchoring the work
# directory inside the repository makes those paths constant.
work="$here/_work"
rm -rf "$work"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/consumer" "$work/tgz" "$work/data"

# ---------------------------------------------------------------- the library

echo "installing jp-address-romaji@$version from the registry"
# Installed rather than bundled straight out of a tarball, because the entry
# point has to be resolved through the package's `exports` map: pointing
# esbuild at dist/index.js by path would silently bundle the *Node* build and
# prove nothing about the `browser` condition being wired up. --omit=peer skips
# the dataset package, which is fetched separately below.
(cd "$work/consumer" && npm init -y > /dev/null && \
  npm install --omit=peer --no-audit --no-fund --silent "jp-address-romaji@$version" > /dev/null)

installed="$work/consumer/node_modules/jp-address-romaji"
packed_version="$(node -p "require('$installed/package.json').version")"
if [ "$packed_version" != "$version" ]; then
  echo "the registry gave version $packed_version, expected $version" >&2
  exit 1
fi

# Stated on the page: the normalizer is a runtime dependency with a caret
# range, so which version got bundled is a fact about this build, not about
# the pin. Reading it here is the only way the page can be right about it.
normalizer_version="$(node -p \
  "require('$work/consumer/node_modules/@geolonia/normalize-japanese-addresses/package.json').version")"

rm -rf "$out"
mkdir -p "$out/vendor" "$out/data"

# A bare specifier, so resolution goes through `exports`.
echo "export * from 'jp-address-romaji';" > "$work/consumer/entry.js"

# Run from the repository root with a repository-relative entry path: esbuild
# writes module comments relative to its working directory, so this is what
# keeps them stable and inside the repository (checked below).
(cd "$root" && npx --no-install esbuild "demo/_work/consumer/entry.js" \
  --bundle --format=esm --platform=browser --log-level=warning \
  --outfile="demo/_site/vendor/jp-address-romaji.js")

bundle="$out/vendor/jp-address-romaji.js"
if [ ! -s "$bundle" ]; then
  echo "esbuild produced no bundle at $bundle" >&2
  exit 1
fi

# Every module comment esbuild emits must name a path inside the repository.
#
# The check is written against what the failure actually looks like, not what
# it sounds like. Reverting to `mktemp -d` does not necessarily produce an
# absolute path in the bundle — esbuild can make it relative — so both shapes
# are rejected. Counted into a variable rather than piped into `grep -q`: under
# `set -o pipefail` an early-exiting reader kills the writer with SIGPIPE and
# fails the pipeline exactly when the pattern matches. The `|| true` is for
# grep's exit status 1 on zero matches, which is the good case.
escaping="$(grep -c -E '^// (\.\./|/)' "$bundle" || true)"
if [ "$escaping" != "0" ]; then
  echo "the bundle names $escaping module path(s) outside the repository:" >&2
  grep -m 3 -E '^// (\.\./|/)' "$bundle" >&2 || true
  echo "the work directory must stay inside the repository, so these stay stable" >&2
  echo "(otherwise the published bundle is irreproducible and leaks the build path)" >&2
  exit 1
fi

# The browser build's defining property: no Node builtin anywhere in the graph.
# esbuild would normally fail to resolve one, but a future flag or a shim could
# turn that into a silent stub, so the built file is searched as well. This is
# the same belt-and-braces check scripts/browser-smoke.mjs makes.
node_builtins="$(grep -c -E '"node:[a-z/]+"|'"'"'node:[a-z/]+'"'"'' "$bundle" || true)"
if [ "$node_builtins" != "0" ]; then
  echo "the bundle references $node_builtins Node builtin(s) — the browser condition is not being resolved:" >&2
  grep -m 3 -o -E '"node:[a-z/]+"' "$bundle" >&2 || true
  exit 1
fi

cp "$installed/LICENSE" "$out/vendor/LICENSE.txt"

# ---------------------------------------------------------------- the dataset

echo "fetching jp-address-romaji-data@$data_version from the registry"
# npm pack does not create its destination directory (npm/cli#4351).
npm pack "jp-address-romaji-data@$data_version" --pack-destination "$work/tgz" > /dev/null
tarball="$work/tgz/jp-address-romaji-data-$data_version.tgz"
if [ ! -f "$tarball" ]; then
  echo "expected $tarball to exist after npm pack; got:" >&2
  ls -la "$work/tgz" >&2
  exit 1
fi
tar -xzf "$tarball" -C "$work/data"
dataset="$work/data/package"

packed_data_version="$(node -p "require('$dataset/package.json').version")"
if [ "$packed_data_version" != "$data_version" ]; then
  echo "the dataset tarball declares $packed_data_version, expected $data_version" >&2
  exit 1
fi

# The index goes out whole. Trimming it to the municipalities below would make
# the library report every other real municipality as non-existent, which is a
# wrong answer rather than a missing one — the exact failure mode this library
# is built to avoid, committed by the page demonstrating it.
cp "$dataset/data/ja.json" "$out/data/ja.json"
cp "$dataset/ATTRIBUTION.md" "$out/vendor/ATTRIBUTION.txt"
cp "$dataset/LICENSE" "$out/vendor/DATA-LICENSE.txt"
# Copied as .txt, not as the .md/extensionless originals: Pages serves those as
# a download, so a visitor checking the attribution would get a file in their
# downloads folder instead of a page.

served_manifest="$work/served.json"
: > "$served_manifest.lines"
count=0
while IFS= read -r line; do
  line="${line%%#*}"
  line="$(printf '%s' "$line" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  pref="${line%%/*}"
  city="${line#*/}"
  if [ "$pref" = "$line" ] || [ -z "$city" ]; then
    echo "demo/municipalities.txt: expected '<prefecture>/<municipality>', got '$line'" >&2
    exit 1
  fi
  src="$dataset/data/ja/$pref/$city.json"
  if [ ! -f "$src" ]; then
    echo "demo/municipalities.txt names $pref/$city, which is not in jp-address-romaji-data@$data_version" >&2
    exit 1
  fi
  mkdir -p "$out/data/ja/$pref"
  cp "$src" "$out/data/ja/$pref/$city.json"
  printf '%s\t%s\t%s\n' "$pref" "$city" "$(wc -c < "$src" | tr -d ' ')" >> "$served_manifest.lines"
  count=$((count + 1))
done < "$here/municipalities.txt"

if [ "$count" -eq 0 ]; then
  echo "demo/municipalities.txt lists no municipalities" >&2
  exit 1
fi

# Facts about the dataset, counted from the dataset rather than remembered.
# The page renders the prefecture count from the library's own table, so this
# one is an assertion rather than a substitution: if the shipped index and the
# library's table ever disagree about how many prefectures there are, the page
# would state a number that does not describe the data next to it.
prefecture_count="$(node -p "JSON.parse(require('fs').readFileSync('$out/data/ja.json','utf8')).data.length")"
if [ "$prefecture_count" != "47" ]; then
  echo "the shipped index lists $prefecture_count prefectures, expected 47 — the dataset is incomplete" >&2
  exit 1
fi
municipality_count="$(node -p \
  "JSON.parse(require('fs').readFileSync('$out/data/ja.json','utf8')).data.reduce((n,p)=>n+p.cities.length,0)")"

# The manifest the page renders. Generated from the files that were actually
# copied, so the list and the byte counts on the page cannot drift from what is
# being served. scripts/verify-demo.mjs re-derives both from _site and compares.
node - "$served_manifest.lines" "$out/served-data.js" <<'NODE'
const fs = require('node:fs');
const [, , linesFile, outFile] = process.argv;
const served = fs
  .readFileSync(linesFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [prefecture, municipality, bytes] = line.split('\t');
    return { prefecture, municipality, bytes: Number(bytes) };
  });
fs.writeFileSync(
  outFile,
  '// Generated by demo/build.sh from demo/municipalities.txt. Do not edit.\n' +
    '// The page states which municipalities it serves and how large each file\n' +
    '// is; both come from here so they cannot disagree with what is deployed.\n' +
    `export const SERVED_MUNICIPALITIES = ${JSON.stringify(served, null, 2)};\n`,
);
NODE

# ------------------------------------------------------------------- the page

# Measured, not remembered: the page states these numbers, so recompute them on
# every build instead of letting hand-written figures drift.
bundle_gzip_kb="$(gzip -9 -c "$bundle" | wc -c | awk '{printf "%.0f", $1/1024}')"
index_gzip_kb="$(gzip -9 -c "$out/data/ja.json" | wc -c | awk '{printf "%.0f", $1/1024}')"
slice_kb="$(cat "$out"/data/ja/*/*.json | wc -c | awk '{printf "%.0f", $1/1024}')"

# Pages would otherwise run the output through Jekyll, which drops files and
# directories beginning with an underscore.
touch "$out/.nojekyll"

for file in index.html app.js style.css; do
  sed -e "s/__CORE_VERSION__/$version/g" \
      -e "s/__DATA_VERSION__/$data_version/g" \
      -e "s/__NORMALIZER_VERSION__/$normalizer_version/g" \
      -e "s/__BUNDLE_GZIP_KB__/$bundle_gzip_kb/g" \
      -e "s/__INDEX_GZIP_KB__/$index_gzip_kb/g" \
      -e "s/__MUNICIPALITY_COUNT__/$municipality_count/g" \
      "$here/$file" > "$out/$file"
done

# A stale pin is the one way this page can quietly start lying, so say so
# loudly at build time rather than discovering it from a bug report.
for pkg in "jp-address-romaji:$version" "jp-address-romaji-data:$data_version"; do
  name="${pkg%%:*}"
  pinned="${pkg#*:}"
  latest="$(npm view "$name" version 2>/dev/null || true)"
  if [ -n "$latest" ] && [ "$latest" != "$pinned" ]; then
    echo "::warning::demo pins $name $pinned but the registry's latest is $latest — bump the pin"
    echo "WARNING: $name pinned $pinned, registry latest $latest" >&2
  fi
done

echo "built $out"
echo "  jp-address-romaji $version (bundle ${bundle_gzip_kb}KB gzipped, normalizer $normalizer_version)"
echo "  jp-address-romaji-data $data_version (index ${index_gzip_kb}KB gzipped, $count of $municipality_count municipalities, ${slice_kb}KB)"
