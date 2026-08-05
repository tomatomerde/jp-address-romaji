# Releasing

Two packages ship together by default: `jp-address-romaji` (the library) and
`jp-address-romaji-data` (the dataset). The library is useless without a dataset, so the data package
always publishes first when both go out together. The data package can also be released on its own
cycle — see "Tag scheme" below.

**Releasing is driven by the `Release` GitHub Actions workflow
(`.github/workflows/release.yml`), not by running `npm publish` on a laptop.** The workflow builds
the dataset from upstream, verifies it, runs the full test suite against it, packs the selected
package(s), checks the packed types and that the build is actually importable, and only then
publishes. A local publish still works (see the bottom of this document) and is kept as a documented
fallback, but it skips the two things this environment cannot do at all — reach the dataset host, and
prove nothing by hand — so treat it as an emergency path, not the default.

The workflow runs one release at a time (`concurrency: group: release, cancel-in-progress: false`):
a second run queues behind an in-flight one instead of running in parallel or cancelling it — killing
a run mid-`npm publish` is worse than making the next run wait.

## One-time setup (human, not automatable)

The workflow authenticates to npm with a token stored as a GitHub Actions secret. Create it once:

1. Log in to [npmjs.com](https://www.npmjs.com/), then **Access Tokens → Generate New Token →
   Granular Access Token** (or `Automation` token type if you prefer the classic UI). Scope it to
   publish access on `jp-address-romaji` and `jp-address-romaji-data` (or to your account/org if the
   granular picker doesn't yet list unpublished packages — the first publish of a new name needs an
   account-wide token regardless of scoping).
2. Copy the token, then set it as a repository secret:

   ```sh
   gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   # paste the token when prompted, or:
   echo "npm_xxxxxxxx" | gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   ```

   Equivalently, via the web UI: repo → **Settings → Secrets and variables → Actions → New
   repository secret**, name `NPM_TOKEN`.

3. Nothing else is needed. The workflow's own `permissions:` block already grants it what it needs
   to create a GitHub Release (`contents: write`); it does not use OIDC/provenance (see below).

npm provenance (`--provenance`) is **not** used, for two independent reasons, either of which alone
would be enough: `pnpm publish` 9.15.0 has no `--provenance` flag at all, and npm's provenance
feature requires a public source repository, which this one currently is not. If the repository goes
public, switching the publish step to plain `npm publish --provenance` and adding
`permissions: id-token: write` is what re-enables it — noted inline in `release.yml` where the
decision is made.

## Tag scheme

The tag you push decides what publishes. **Both packages together is the default**, but the data
package can also go out on its own release cycle — its coverage changes when upstream data changes
even when nothing in the library itself does.

| Tag | Publishes | Version checked against |
| --- | --- | --- |
| `v1.2.3` | Both packages | `packages/data/package.json` **and** `packages/core/package.json` must both read `1.2.3` |
| `data-v1.2.3` | `jp-address-romaji-data` only | `packages/data/package.json` must read `1.2.3` — core's version is untouched and not checked |
| `core-v1.2.3` | `jp-address-romaji` only | `packages/core/package.json` must read `1.2.3` — data's version is untouched and not checked |

Any tag that doesn't match one of these three shapes fails the workflow immediately (`Determine
release plan` step), rather than silently falling back to some default.

A `data-v*` or `core-v*` release does **not** require the other package's version to match anything
— that's the whole point of a scoped tag. Bumping `packages/data/package.json` to `0.2.0` while
`packages/core/package.json` stays at `0.1.0`, then tagging `data-v0.2.0`, is the normal way to ship a
data-only refresh.

## Cutting a release

1. Decide the version(s). Bump `version` in whichever of `packages/data/package.json` /
   `packages/core/package.json` you're releasing — for a `v*` tag both must match each other and the
   tag; for a `data-v*`/`core-v*` tag only that package's version needs to match the tag (see the
   table above).
2. Replace that package's `## <version> — unreleased` heading in `CHANGELOG.md` with the real date,
   e.g. `## 0.1.0 — 2026-08-05`. The release workflow extracts the GitHub Release body from whichever
   section heading starts with `## <version>`, so this has to happen before tagging — the workflow's
   own CHANGELOG guard step fails the run if the section is missing or still says `unreleased`, tag
   push only (`workflow_dispatch` only warns). Commit both changes.
3. Tag and push:

   ```sh
   git tag v0.1.0            # both packages
   # or: git tag data-v0.2.0 # data package only
   # or: git tag core-v0.3.0 # core package only
   git push origin v0.1.0
   ```

   The tag push triggers the workflow automatically: `dry_run` is forced off, the tag's scope decides
   which package(s) publish (data before core, when both), and a GitHub Release is created from the
   CHANGELOG section, titled to match the scope (e.g. `jp-address-romaji-data data-v0.2.0`).
4. Watch the run (`gh run watch`, or the Actions tab). The step summary carries the release plan
   (trigger, dry_run, and the exact version(s) about to publish), the packed tarball contents, the
   packed-tarball content assertions, and the dataset-assumption report; read them even on green.

If a package name/version is already on the registry when the workflow runs — for instance you're
re-pushing a tag after a partial failure — that package's publish step detects it via `npm view` and
skips rather than erroring, so re-running is safe.

### Manual / dispatch runs

`workflow_dispatch` (Actions tab → **Release** → **Run workflow**) runs the identical pipeline
without needing a tag:

| Input | Values | Default | Use it for |
| --- | --- | --- | --- |
| `packages` | `both` / `data-only` / `core-only` | `both` | Publishing just one package, e.g. a data-only refresh release with no library changes. |
| `dry_run` | boolean | `true` | Proving the pipeline would succeed — dataset build, assumption check, full test suite, pack, type-check, import smoke test all still run; only the final `npm publish` is skipped. |
| `concurrency` | number | `8` | Matches the `Refresh address data and coverage` workflow's knob; lower it if the dataset build gets throttled. |

A dispatch run never creates a GitHub Release, even with `dry_run: false` — only a tag push does
that, so republishing via dispatch to recover from a partial failure doesn't produce a duplicate
release.

Because dispatch has no tag, the version-match guard doesn't run; it publishes whatever version is
currently in each selected package's `package.json`. Bump and commit first if that's not what you
want. The exact version(s) about to publish are always logged and written to the step summary (`Log
target package versions` step) precisely because this path skips the guard — check it before trusting
a dispatch run.

## What the workflow enforces before it will publish anything

(The reasoning for each is written inline in `release.yml`; this is just the checklist.)

- Tagged version equals the `package.json` `version` of every package the tag's scope selects (tag
  pushes only — see the tag scheme table above for which package(s) a given tag checks).
- The CHANGELOG has a section for the version being released, and it doesn't still say `unreleased`
  (tag pushes only; blocking there, a warning under `workflow_dispatch`'s dry run).
- `scripts/verify-data-assumptions.ts` passes — blocking, unlike the refresh workflow's report-only
  run.
- The full test suite passes with `JP_ADDRESS_ROMAJI_DATA_DIR` pointed at the just-built dataset, so
  `realdata.test.ts` actually runs instead of being skipped.
- `packages/data/scripts/check-publishable.mjs` passes as its own step — `npm publish <tarball>`
  does not run `prepublishOnly` (verified: lifecycle scripts only fire for a directory-based
  publish), so nothing else in a tarball-publish pipeline would otherwise catch a missing dataset.
- The packed **tarball itself** — not the working directory — contains what it's supposed to:
  `package/data/ja.json` plus at least 1,800 municipality files under `package/data/ja/` for the data
  package, `package/dist/index.js` and `package/dist/index.d.ts` for core. `files` in package.json
  currently overrides `.gitignore` correctly, but that's a property of today's config, not something
  this pipeline should just trust going forward — see the `Assert data/core tarball contents` steps.
- `@arethetypeswrong/cli --profile esm-only` is clean against each packed tarball.
- The built `dist/index.js` of each package actually `import()`s successfully.
- `NPM_TOKEN` is set, checked immediately before a real (non-dry-run) publish would need it — a dry
  run never writes `.npmrc` at all, so a missing token can't surface as a confusing `npm view` 401
  during a dry run.

## Refreshing the data between releases

The `Refresh address data and coverage` workflow does an equivalent dataset build on a GitHub
runner and uploads the dataset as an artifact, but never publishes anything — it's a report, and its
own assumption check is non-blocking. Use it to check on a schedule whether the upstream data has
drifted, or to look at real data from an environment (like a Claude Code cloud session) that can't
reach the dataset host itself. It runs monthly for that reason.

## Local publish (fallback, not the default)

Only use this if the workflow is unavailable and a release can't wait. It requires `npm login` on
the machine running it, and — because it publishes from a directory rather than a pre-packed tarball
— it exercises `prepublishOnly` directly rather than as a separate explicit step the way the workflow
does. It does **not** run `scripts/verify-data-assumptions.ts`, the full test suite against real
data, or the packed-tarball type/import checks the workflow adds; run those yourself first.

```sh
npx tsx packages/data/src/build-data.ts --out ./packages/data/data
npx tsx scripts/verify-data-assumptions.ts --data ./packages/data/data   # read the output
JP_ADDRESS_ROMAJI_DATA_DIR=./packages/data/data pnpm test
npx tsx scripts/measure-coverage.ts --data ./packages/data/data > docs/coverage.md   # commit if changed

pnpm -r build
pnpm --filter jp-address-romaji-data publish
pnpm --filter jp-address-romaji publish
```

`prepublishOnly` rebuilds each package, and the data package additionally verifies that all 47
prefectures and ~1,899 municipality files are present before `pnpm publish` (directory-based,
unlike the workflow's tarball publish) is allowed to proceed.
