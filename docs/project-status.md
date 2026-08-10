# Project status

Where the project currently stands, what is left before the first release, and the things that
have bitten people working on it. Kept current so that anyone picking the project up — a new
contributor, or the maintainer after a gap — can start without reconstructing context.

For how to work on the code, see [`CONTRIBUTING.md`](../CONTRIBUTING.md). For the release
procedure itself, see [`releasing.md`](./releasing.md).

## Current state

**Published.** `jp-address-romaji` and `jp-address-romaji-data` are both on npm at `0.1.0`,
released 2026-08-10, each carrying an npm provenance attestation. `0.1.0-rc.1` was published a few
hours earlier under the `next` dist-tag as a rehearsal — see the CHANGELOG for the three things it
caught.

Done:

- `toRomaji` / `fromRomaji` / `parse` / `toFormat`, with failures returned as typed values rather
  than thrown
- Kyoto street-name addresses: the street phrase is split off before normalization, preserved
  verbatim, and never romanized
- A `postalCodeIndex` hook on `fromRomaji`, so a caller's own postal data can narrow an ambiguity
- The offline guarantee, enforced by a test that replaces `fetch` with a stub that throws
- 95 tests passing; 5 more that run only when a real dataset is present
- CI (lint, typecheck, build, test) and a data-refresh workflow
- Both package READMEs, the CHANGELOG, and a `prepublishOnly` guard that refuses to publish the
  data package without a complete dataset

`main` holds all of the above.

## This repository was recreated on 2026-08-07 — `#N` in the history is not this repository's

Before going public, the history was cleaned of a personal email address on five commits. A force
push cannot do that: GitHub keeps the old commits alive through `refs/pull/*/head`. So the old
repository was deleted and an empty one created, and only the rewritten `main` was pushed. Not a
byte of code changed — every one of the 31 commits has the same tree as before, and `HEAD`'s tree
is still `ed79683`.

The side effect is that **the pull-request numbers quoted in commit messages (`#1` through `#4`,
`#8`) belong to the repository that no longer exists.** This repository starts from zero pull
requests. GitHub autolinks `#N` in commit messages, so those links 404 today — and the moment a
pull request is opened here, the old `#1` will start resolving to an unrelated one. That is the
worse failure: a 404 announces itself, a wrong link does not. Follow the history by commit subject,
not by number. (References inside `.md` files are not autolinked, so prose here is only misleading
to a reader who goes looking.)

## Where work stopped (2026-08-07)

Work on this repository is paused. Nothing is in flight: `main`, the working branch, and their
remotes all point at the same commit, there is no stash and no uncommitted change, and CI on `main`
is green. The project sits between "feature-complete" and "released", and everything still
outstanding needs credentials or repository-admin rights that a working session does not have — so
the pause costs nothing.

Re-verified on 2026-08-07 by running the commands rather than reading them, on Node 22.22.2:
`pnpm lint`, `pnpm typecheck`, `pnpm -r build`, `pnpm test` — all clean, 95 passed and 5 skipped,
matching what "Verified, and not" records below.

**The shared half of `CLAUDE.md` is delivered automatically; do not edit it and do not sync it by
hand.** It sits between `<!-- BEGIN dev-standards common -->` and `<!-- END dev-standards common -->`,
and it arrives from the template repository as an automated pull request whenever that repository
changes. `.github/workflows/check-common-integrity.yml` hashes the block and fails if it was
hand-edited — no secret and no network involved, so it also runs on pull requests from forks.

If a rule in that block is wrong, change it in the template repository; the fix comes back here on
its own. Opening a pull request that edits the block directly will turn the check red and be
reverted by the next sync.

This replaced an older arrangement where the block was copied by hand and a warning-only job
compared it against the private template through a per-repository token. That token is gone —
`DEV_STANDARDS_TOKEN` is no longer used here — and so is the freeze that existed because syncing
by hand was expensive enough that the projects could never catch up.

What is genuinely unfinished is the release path, not the library:

- The repository **went public on 2026-08-10**, which also enabled npm provenance — it had been
  switched off only because npm requires a public source repository. `release.yml` publishes with
  `--provenance` and asks for `id-token: write`.
- **Branch protection is still not set** (`main` is `protected: false`); it needs repository-admin
  rights. The shared-block check needs no secret, so nothing else is waiting on one.
- `NPM_TOKEN` is set. It must be created with npm's **Bypass two-factor authentication (2FA)**
  checkbox ticked — without it every publish fails with `EOTP`. It expires 90 days from
  2026-08-10; the intent is to remove it before then by moving to npm trusted publishing, which
  cannot be configured until a package exists (npm/cli#8544) and therefore had to wait for 0.1.0.
- The Geolonia host is unreachable from a network-restricted environment, so the dataset cannot be
  built locally. The `Refresh address data and coverage` workflow is the way to touch real data.

  **Verified on 2026-08-09** by dispatching it: the dataset built (12,026,285 bytes, 1,899 files),
  the assumption check passed, and the suite ran green against real data — 6 files, **100 tests
  passed**, including the 5 in `realdata.test.ts` that are skipped everywhere else. The round-trip
  test reported `mismatched: 0` over 4,303 real addresses: nothing came back as a *different*
  address. The 2,213 that did not round-trip were all typed refusals (2,206 `NO_ROMAJI_DATA`,
  1 `CORRUPT_ROMAJI_DATA`, 6 `AMBIGUOUS`), which is the designed behaviour.

## Release tagging

`.github/workflows/release.yml` publishes to npm. It is tag-driven, with `workflow_dispatch`
available for dry runs and for recovering a release that published one package but not the other.

| Tag | Publishes |
| --- | --- |
| `v1.2.3` | both packages, data first |
| `data-v1.2.3` | `jp-address-romaji-data` only |
| `core-v1.2.3` | `jp-address-romaji` only |

Scoped tags exist because the dataset's correctness changes when the upstream data changes, even
when the library itself has not. The version guard checks only the package or packages a tag
selects, so a `data-v*` release does not fail merely because core sits at a different version.

## Maintainer runbook: one-time repository setup

These require repository-admin rights. Order matters: on a free plan, branch protection is only
available on public repositories, so visibility has to change before the protection call will
succeed.

```sh
gh repo edit tomatomerde/jp-address-romaji \
  --visibility public --accept-visibility-change-consequences
gh repo edit tomatomerde/jp-address-romaji --default-branch main

gh api -X PUT repos/tomatomerde/jp-address-romaji/branches/main/protection --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

gh secret set NPM_TOKEN --repo tomatomerde/jp-address-romaji

# DEV_STANDARDS_TOKEN is obsolete — delete it if it is still there.
gh secret delete DEV_STANDARDS_TOKEN --repo tomatomerde/jp-address-romaji
```

`required_approving_review_count` is 0 because a solo maintainer cannot approve their own pull
request, and 1 would make every pull request permanently unmergeable. `enforce_admins: true`
applies to the owner as well — that is the intent, but it means unblocking yourself is a settings
change rather than a `--force`.

The visibility change has already been made, so the first command above is a no-op today; it is
kept because the ordering it encodes still matters if the repository is ever recreated.

`NPM_TOKEN` must be an **Automation** token; the classic token types that require a one-time
password cannot publish from CI. Without it the release workflow fails with an explicit message
naming the secret rather than an opaque npm 401.

`DEV_STANDARDS_TOKEN` is **no longer used** and should be deleted. It existed so a per-repository
job could read the private template; the shared block is now verified against a hash committed
here, which needs neither a secret nor the network. The token it replaced expired on a schedule and
took a project's CI red with it — that failure mode is gone rather than deferred.

One consequence of protecting `main` to be aware of: required status checks reject **direct**
pushes whose commits haven't passed them, and on a free personal plan no actor can be exempted.
The `Refresh address data and coverage` workflow commits `docs/coverage.md` back with exactly such
a push, so once protection is on, that step degrades to a warning pointing at the run's `reports`
artifact — commit the regenerated report via a pull request instead. The build, assumption check,
and artifacts are unaffected.

## Releasing

`0.1.0-rc.1` was published on 2026-08-10 and `0.1.0` followed the same day. Both packages are on
npm. For the procedure and for what a release candidate does and does not protect, see
[`releasing.md`](./releasing.md) — in particular that **the first version published to a name
becomes `latest` regardless of `--tag`**, which is why the rc did not keep `npm install` clean and
0.1.0 had to follow immediately.

For a subsequent release: bump the version(s), date the CHANGELOG heading, push the tag. The
workflow refuses to publish while the heading still says `unreleased`. Run a `dry_run: true`
dispatch first and read it — the first real dry run of this workflow failed (see the SIGPIPE entry
under Traps), so a previous green run is not evidence about the current commit.

## Verified, and not

Verified by running it rather than by reading it:

- `pnpm pack` rewrites `workspace:*` to a real version and strips `prepublishOnly` from the packed
  manifest — so `npm publish <tarball>` runs **no** lifecycle scripts, which is why
  `check:publishable` is an explicit workflow step
- `files` overrides `.gitignore`, so the gitignored `dist/` and `data/` do reach the tarball. This
  was the biggest suspected failure mode and it is not real — the workflow asserts it against the
  packed bytes anyway, because it is a property of today's configuration
- `@arethetypeswrong/cli --profile esm-only` exits 0
- Tag parsing accepts `v0.1.0` / `data-v0.2.0` / `core-v0.3.0` / `v1.2.3-beta.1` and rejects
  `garbage` / `vNext` / `data-vX` / `v-`
- The CHANGELOG guard fails on an `unreleased` heading and passes on a dated one
- The tarball assertion fails when the municipality-file count drops below its threshold
- ESLint catches an unused variable in a `.ts` file and an undefined reference in a `.mjs` file,
  and passes once both are reverted
- `pnpm lint && pnpm typecheck && pnpm -r build && pnpm test` — 95 passed, 5 skipped (last re-run
  2026-08-07, Node 22.22.2). The root `pnpm typecheck` is the one that matters: `pnpm -r typecheck`
  alone skips the test files, `scripts/`, and `vitest.config.ts` — see Traps below

**`release.yml` has now run on GitHub Actions.** Two `workflow_dispatch` dry runs on 2026-08-10,
`packages: both`:

- The **first failed**, at `Assert data tarball contents`, and the failure was in the check rather
  than in the package — see the SIGPIPE entry under Traps. Everything before it passed: the dataset
  built, assumptions held, typecheck, build, `check:publishable`, the full suite against real data,
  and both `pnpm pack`s.
- The **second, after the fix, was green end to end** — including
  `@arethetypeswrong/cli --profile esm-only` on both packed tarballs, the import smoke test, and
  the dry-run publish path. Run
  [31372054290](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31372054290).

That is the first time the packing path has been exercised against a real dataset, which matters
more here than for an ordinary package: the dataset *is* the data package's contents.

**The tag-driven path has now run for real** (`v0.1.0-rc.1` then `v0.1.0`, 2026-08-10). That
covers `npm publish`, the provenance attestation, the GitHub Release, the tag-shape version guard
and the CHANGELOG date guard — everything a `workflow_dispatch` run skips by design.

Verified from outside the workflow afterwards, against the registry rather than the run log:

- `https://registry.npmjs.org/-/npm/v1/attestations/<pkg>@0.1.0-rc.1` lists `publish` and
  `provenance` for both packages
- the GitHub Release body for `v0.1.0-rc.1` was the rc section only, 12 lines, with no bleed from
  the `0.1.0` section — the whole-field CHANGELOG matcher doing its job
- `npm view <pkg> dist-tags` — this is where two assumptions broke; see the CHANGELOG's
  `0.1.0-rc.1` entry and *Release candidates* in `releasing.md`

**Still not verified: the `data-v*` and `core-v*` scoped tag shapes.** Only `v*` has been used. The
scoped paths are exercised by the same `Determine release plan` step, but the combination of a
scoped tag with the version guard checking only one package has never run.

## Known gaps

Each of these was considered and deliberately deferred, not overlooked — so a change that closes
one should say why the trade-off moved rather than just adding the machinery. Contributions
welcome:

- **CI tests only Node 22, while `engines` says `>=18`.** "Runs on Node 18" is currently an
  unverified promise that ships with the package. A build matrix would settle it.
- CI has no `permissions:` block, so `GITHUB_TOKEN` runs with default scope
- CI runs twice on a branch in a pull request (`push: ['**']` and `pull_request` both fire)
- No issue or pull-request templates, no `SECURITY.md`, no `CODEOWNERS`, no dependency-update
  automation

## Traps

`CONTRIBUTING.md` covers the invariants that must not be broken. These are the operational ones
that have actually cost time:

- **`npm publish` moves the `latest` dist-tag even for a semver prerelease.** npm does not
  special-case them, so `0.1.0-rc.1` published without `--tag next` becomes what everyone installs.
  Both publish steps derive the tag from the version (`*-*` → `next`), and the run summary prints
  it, because a wrong dist-tag looks exactly like a successful release until someone installs.
- **CHANGELOG headings are matched on the version as a whole field, not as a line prefix.** The
  prefix form made `## 0.1.0` match `## 0.1.0-rc.1 — …` as well; because both headings matched, the
  "stop at the next heading" rule never fired and the extracted section ran to the end of the file.
  Adding a prerelease section is what exposed it. Verified against a fixture with `0.1.0-rc.1`,
  `0.1.0` and `0.0.9` sections: each version now selects only its own, and a missing version yields
  empty so the guard still fails.
- **GitHub Actions runs `shell: bash` with `-eo pipefail`.** `count=$(... | grep -c ...)` aborts
  the step when the count is zero — exactly the case an assertion like that exists to report.
  `|| true` on the assignment is what keeps the error message reachable. This was a real defect in
  `release.yml`, found by running it rather than by reading it.
- **Never pipe `tar -tzf` into `grep -q` under `pipefail`.** `grep -q` exits at its first match,
  which closes the pipe and kills `tar` with SIGPIPE; `pipefail` then makes that the pipeline's
  status. The data-tarball assertion therefore reported `package/data/ja.json` **missing because it
  was present** — npm sorts `data/ja.json` ahead of `data/ja/...` (`.` is 0x2E, `/` is 0x2F), so it
  matched on line 1 of a ~124 KB listing and `tar` never got to finish. A genuinely absent entry
  failed it too, with the same message, so the check could not pass and could not discriminate.
  Redirect the listing to a file and `grep` that. Found by the first real dry run of `release.yml`
  (2026-08-10) — the code had been read many times and looked correct. This is the sibling of the
  `grep -c` trap above, and it hid in the same file next to a comment explaining the `-c` case.
  Note the size dependence: the core-tarball assertion had the identical shape and never failed,
  because its listing fits in the 64 KB pipe buffer. Both are fixed.
- **`typescript-eslint`'s recommended preset disables `no-undef`.** That is correct where `tsc`
  backs it up and silently fatal where it does not, which is why `eslint.config.js` keeps `.ts`
  and plain-JS files in separate blocks — and why `tsconfig.tests.json` exists: the package
  tsconfigs check only `src/`, so the test files, `scripts/`, and `vitest.config.ts` need their
  own `tsc` run (part of the root `pnpm typecheck`) for that assumption to hold.
- **`pnpm pack` accepts neither `--filter` nor `-r`.** Pack each package with `working-directory`.
- **pnpm's version belongs only in the root `package.json`'s `packageManager` field.** Repeating it
  in `pnpm/action-setup` makes the action refuse to start.
- **`packages/data/data/` is generated and gitignored.** Never commit it. A release that skips
  building it produces a package that installs fine and then fails every conversion with
  `DATA_NOT_CONFIGURED`.
