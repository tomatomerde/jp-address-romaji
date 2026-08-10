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

## Trusted publishing (how the workflow authenticates)

**The workflow carries no npm token.** It publishes through npm *trusted publishing*: GitHub
Actions mints a short-lived OIDC token, npm verifies it against a trusted publisher registered on
the package, and the publish is authorised without any long-lived secret. Provenance attestations
are generated automatically on this path, which is why there is no `--provenance` flag.

Configured on npmjs.com per package (**all four**, on 2026-08-10) under *Settings → Trusted
Publisher*:

| Field | Value |
| --- | --- |
| Publisher | GitHub Actions |
| Organization or user | `tomatomerde` |
| Repository | this repository (both packages point at it) |
| Workflow filename | `release.yml` |
| Environment name | **empty** — the job declares no GitHub Environment, and a mismatch here rejects the publish |
| Allowed actions | `npm publish` and `npm stage publish` |

Three things the workflow must keep, or authentication breaks:

- **`id-token: write`** in `permissions`. Without it there is no OIDC token to exchange.
- **npm >= 11.5.1.** The runner's bundled npm does not meet this, so the
  `Ensure npm supports trusted publishing` step upgrades npm and asserts the version. It fails
  early and legibly instead of as an authentication error after the whole pipeline has run.
- **The workflow filename must stay `release.yml`.** The trusted publisher is registered against
  that exact name; renaming the file silently invalidates it.

### The npm version, measured

That guard step is the only part of the OIDC path a dry run can reach. The dry run of 2026-08-10
(run `31402994984`, on the merge commit that introduced this) measured **npm 10.9.8** from
`setup-node` on Node 22 — below the requirement — and **12.0.2** after the guard's
`npm install -g npm@latest`. Without the guard this pipeline would reach `npm publish` and fail with
an authentication error that says nothing about versions.

This job calls `setup-node` exactly once, so that upgraded npm is what the publish steps get. **A
second `setup-node` would not be harmless**: it swaps the whole toolchain, and the upgrade survives
only while the same Node from the tool cache is reselected. The sibling projects, which re-enter
`setup-node` for a different-runtime smoke test, watch npm drop back to 10.8.2 mid-run and recover
only by coincidence of version. If a `setup-node` is ever added after the guard here, re-read the
npm version at the publish step.

### Not yet verified: no release has gone out through OIDC

`0.1.0` was published with a token on 2026-08-10, and this switch came afterwards. Dry runs never
reach `npm publish`, so nothing short of a real publish can test the token exchange.

**Re-pushing `v0.1.0` will not test it either.** The publish steps skip a version that is already on
the registry — the dry run above printed `jp-address-romaji-data@0.1.0 is already on npm; skipping.`
and the same for `jp-address-romaji`. The first real exercise of OIDC is therefore **the next version
bump**, and it exercises it twice, once per package.

**Keep the `NPM_TOKEN` secret in place until then.** It is unused by this workflow now, but it is the
rollback if the exchange fails. Delete it (from both the repository secrets and npmjs.com) once a
release has gone out without it.

## One-time setup: the npm token (superseded, kept as rollback)

Everything below describes the token path this workflow no longer uses. It is retained because the
token is still the fallback until trusted publishing has been proven by a real release, and because
the failure modes it documents are worth keeping.

The workflow authenticated to npm with a token stored as a GitHub Actions secret. Create it once:

1. Log in to [npmjs.com](https://www.npmjs.com/) and go to **Access Tokens → Generate New Token**.
   npm has merged classic and granular token creation into a single form; the fields that matter:

   | Field | Value | Why |
   | --- | --- | --- |
   | **Bypass two-factor authentication (2FA)** | **ticked** | Without it npm demands a one-time password on publish, which CI cannot supply |
   | Packages and scopes → Permissions | **Read and write** | Defaults to read-only |
   | Select packages | **All packages** | An unpublished name does not appear in the per-package picker, so the first publish of a new name needs account-wide scope. Narrow it afterwards |
   | IP ranges | **leave empty** | GitHub-hosted runners have no stable egress IP |
   | Organizations → Permissions | No access | Not needed |

   **The 2FA checkbox is the one that bites, and it is invisible until the publish itself.** A token
   created without it is rejected from CI with:

   ```text
   npm error code EOTP
   npm error This operation requires a one-time password from your authenticator.
   ```

   This happened twice on `v0.1.0-rc.1` (2026-08-10). Nothing was published either time — the run
   failed at the publish step with both packages still absent from the registry — but the whole
   pipeline ran first, so each attempt cost several minutes. **Regenerating an existing token does
   not change this setting**; a new token has to be created with the box ticked.
   `scripts/npm-publish.sh` recognises `EOTP` and names the checkbox.

   This is the clearest argument for the release-candidate procedure below: no dry run can validate
   the token, because dry runs never reach `npm publish`. Had this been `0.1.0` rather than an rc,
   the same two failures would sit in the history of the version everyone installs.
2. Copy the token, then set it as a repository secret:

   ```sh
   gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   # paste the token when prompted, or:
   echo "npm_xxxxxxxx" | gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji
   ```

   Equivalently, via the web UI: repo → **Settings → Secrets and variables → Actions → New
   repository secret**, name `NPM_TOKEN`.

3. Nothing else is needed. The workflow's own `permissions:` block already grants it what it needs:
   `contents: write` to create a GitHub Release, and `id-token: write` for provenance (below).

npm provenance no longer needs the `--provenance` flag — trusted publishing mints the attestation
automatically. **`--access public` is still passed, and is not optional.** For a name the registry
does not know yet, npm refuses to mint an attestation unless access is stated explicitly:

```text
npm error code EUSAGE
npm error Can't generate provenance for new or private package, you must set `access` to public.
```

An unscoped package is public by default, so the flag looks redundant, and npm still rejects it:
"default" is not "explicitly public". These two packages survived their first release only because
their `package.json`s happened to carry `publishConfig.access`; the two sibling projects without it
failed on their first real tag push (2026-08-10). `scripts/npm-publish.sh` passes the flag for
every publish.

Provenance was off while the repository was private — npm requires a public source repository for
it — and was enabled when the repository went public on 2026-08-10. Two further things it depends
on, both easy to break without noticing:

- **`repository.url` in each `package.json` must name this repository.** npm compares it against
  the repository the workflow runs in and **fails the publish** if they disagree. Both packages
  point at `git+https://github.com/tomatomerde/jp-address-romaji.git`.
- **The publish command must be `npm`, not `pnpm publish`** — pnpm 9.15.0 has no `--provenance`
  flag. Whether pnpm implements npm's OIDC exchange has not been checked; the workflow does not
  depend on it, because it publishes packed tarballs with `npm publish`. This is a constraint on
  future edits only.

Authentication moved to trusted publishing after `0.1.0` shipped — see the section above. It could
not have been set up earlier: npm refuses to register a trusted publisher for a package that does
not exist yet ([npm/cli#8544](https://github.com/npm/cli/issues/8544)), so the first release had to
go out on a token.

**Exercised on 2026-08-10, on the token path.** Both packages carry attestations for `0.1.0-rc.1`
and `0.1.0`; `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>` lists `publish` and
`provenance` for each. Attestation minting has not been observed on the trusted-publishing path —
it happens inside the branch a dry run skips, so a green dry run says nothing about it either way.

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

### Prereleases and the dist-tag

**A version containing a `-` is published to the `next` dist-tag; everything else goes to
`latest`.** The workflow derives this from the version alone — there is no input to set it, and
both publish steps derive it the same way.

This is not a nicety. `npm publish` with no `--tag` moves `latest` **even for a semver
prerelease** — npm does not special-case them. Publishing `0.1.0-rc.1` without `--tag next` would
make `npm install jp-address-romaji` hand every user the release candidate, and the only repair is
publishing a real version on top; the mistake is public and silent in the meantime. The `Release
plan` step summary prints the dist-tag for exactly this reason — it is the one field whose wrong
value looks like a successful release.

So `v0.1.0-rc.1` publishes both packages at `0.1.0-rc.1` under `next`, installable with
`npm install jp-address-romaji@next` and invisible to everyone else. The scoped shapes work the
same way (`data-v0.2.0-rc.1` → `next`).

One consequence to keep in mind: **CHANGELOG headings are matched on the version as a whole
field**, so `## 0.1.0-rc.1` and `## 0.1.0` are different sections and each release gets only its
own. That matters because the earlier prefix match treated `## 0.1.0` as matching
`## 0.1.0-rc.1 — …` too, which silently folded the rc's notes (and everything after it) into the
real release's notes.

## Cutting a release

1. Decide the version(s). Bump `version` in whichever of `packages/data/package.json` /
   `packages/core/package.json` you're releasing — for a `v*` tag both must match each other and the
   tag; for a `data-v*`/`core-v*` tag only that package's version needs to match the tag (see the
   table above).
2. Replace that package's `## <version> — unreleased` heading in `CHANGELOG.md` with the real date,
   e.g. `## 0.1.0 — 2026-08-05`. The release workflow extracts the GitHub Release body from the
   section whose heading's version field is exactly `<version>`, so this has to happen before
   tagging — the workflow's own CHANGELOG guard step fails the run if the section is missing or
   still says `unreleased`, tag push only (`workflow_dispatch` only warns). Commit both changes.
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

### Release candidates, and what they do and do not protect

`npm publish` is the only step of this pipeline a dry run cannot exercise, and it is the one step
that cannot be undone — npm keeps a published version forever, and unpublishing is limited to the
first 72 hours with zero dependents. The same is true of the provenance attestation and the GitHub
Release, both of which only happen on a real tag push. That is the case for publishing a candidate
first, and 0.1.0 was released that way on 2026-08-10.

**Two things that were assumed about the rc turned out to be false, and both were only visible
after publishing it.** Read these before deciding to spend a version on a candidate:

- **The first version ever published to a name becomes `latest` no matter what `--tag` says.** The
  registry has to point `latest` somewhere, and on a brand-new package there is nothing else to
  point at. `0.1.0-rc.1` went out with `--tag next` — the log even says
  `Publishing … with tag next` — and `latest` still resolved to it. `latest` cannot be deleted, so
  the only repair is publishing the real version. **For the first release of a new name, a
  candidate protects nothing about `npm install <pkg>`; it only buys you a rehearsal.**
- **A prerelease does not satisfy a caret range.** `jp-address-romaji`'s optional peer range on
  `jp-address-romaji-data` was `^0.1.0`, which `0.1.0-rc.1` does not match, so the two rc packages
  could not be installed together at all (`npm error notarget`) and the "install it and convert
  something" check could not run. The range is `^0.1.0-0` from 0.1.0 onwards, which does admit
  prereleases — without that, future candidates are untestable in the same way.

So a candidate is worth cutting when you want to rehearse the publish path, and it did earn its
keep here: it caught the `EOTP` token problem twice and both facts above, on a version that was
superseded hours later. It is not worth cutting if you expect it to keep a new name's `latest`
clean, because it cannot.

The sequence, when you do cut one:

1. Tag `v<version>-rc.N` with both `package.json`s at that version.
2. Read the run: provenance attached (`https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@<version>`
   lists `publish` and `provenance`), the GitHub Release created with the rc's notes and not the
   stable section, and `npm view <pkg> dist-tags` showing what you expect — including `latest`, if
   this is the first publish of the name.
3. Install from the registry in a scratch directory and run a conversion. Everything before this
   was tested from a local tarball. **Check that the packages can actually be installed together**
   before concluding anything from this step succeeding or failing.
4. Then bump both `package.json`s to the stable version, date its heading, and tag it.

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
drifted, or to look at real data from a development environment that cannot reach the dataset host
itself. It runs monthly for that reason.

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
