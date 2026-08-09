# Project status

Where the project currently stands, what is left before the first release, and the things that
have bitten people working on it. Kept current so that anyone picking the project up — a new
contributor, or the maintainer after a gap — can start without reconstructing context.

For how to work on the code, see [`CONTRIBUTING.md`](../CONTRIBUTING.md). For the release
procedure itself, see [`releasing.md`](./releasing.md).

## Current state

**The library is feature-complete for 0.1.0. Neither package is published yet.** Both
`jp-address-romaji` and `jp-address-romaji-data` sit at `0.1.0`, and both names were confirmed
unregistered on npm during development — worth re-checking before publishing, since time passes.

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

- The repository is **still private**, so most of the maintainer runbook below has not been
  executed: no branch protection, no `NPM_TOKEN`. The shared-block check needs no secret at all
  now, so nothing else here is waiting on one.
- `release.yml` has never run on GitHub Actions and nothing has ever been published to npm; see
  "Verified, and not" for exactly how far the local simulation of it goes.
- No dataset has ever been built during development, because the Geolonia host is unreachable from
  a network-restricted environment. The `Refresh address data and coverage` workflow is the way to
  touch real data.

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

Going public also unblocks npm provenance, currently disabled for exactly that reason (noted
inline in `release.yml`).

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

## Releasing 0.1.0

1. **Run the release workflow once via `workflow_dispatch` with `dry_run: true`.** None of it has
   executed for real yet.
2. Replace the `## 0.1.0 — unreleased` heading in `CHANGELOG.md` with the real date. The workflow
   refuses to publish while it still says `unreleased`.
3. `git tag v0.1.0 && git push origin v0.1.0`.

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

**Not verified: `release.yml` has never run on GitHub Actions, and `npm publish` has never been
executed in any form.** No dataset was built during that work, because the Geolonia host is
unreachable from the sandboxed environments it was done in, so every step downstream of a real
dataset build is verified only by construction and by local simulation of its shell logic.

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

- **GitHub Actions runs `shell: bash` with `-eo pipefail`.** `count=$(... | grep -c ...)` aborts
  the step when the count is zero — exactly the case an assertion like that exists to report.
  `|| true` on the assignment is what keeps the error message reachable. This was a real defect in
  `release.yml`, found by running it rather than by reading it.
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
