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
- 100 tests passing; 5 more that run only when a real dataset is present
- CI (lint, typecheck, build, test) and a data-refresh workflow
- Both package READMEs, the CHANGELOG, and a `prepublishOnly` guard that refuses to publish the
  data package without a complete dataset

`main` holds all of the above.

## `NPM_TOKEN` has been deleted (2026-08-12)

Trusted publishing was proven by a real release (`v0.1.1`, 2026-08-12), which removed the only
reason to keep the token: it was the rollback if the OIDC exchange failed. Keeping an unused
long-lived publish credential is worse than having none, so it went.

**Done as reported by the maintainer**, who ran `gh secret delete NPM_TOKEN` across the three
repositories and revoked the token itself on npmjs.com. A session cannot read or write the secret
list, so this has not been confirmed against the real thing from here — the same caveat that
applies to the `DEV_STANDARDS_TOKEN` removal recorded below.

Nothing in `release.yml` references `NPM_TOKEN`, in any of the three repositories, so its removal
cannot break a release. What it does close off is falling back to token auth without editing the
workflow — deliberate, since that fallback is the thing being retired. **Publishing now depends
entirely on the trusted publisher registration on npmjs.com** (publisher *GitHub Actions*, this
repository, workflow filename `release.yml`, environment name empty); if that registration is ever
removed or the workflow file renamed, there is no longer a credential to fall back on and releases
stop until it is restored.

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

**`CLAUDE.md` carries project-technical content only (since 2026-08-12).** It used to have a
second half — a shared working-style section synced automatically from a private template
repository, verified by a hash check (`check-common-integrity.yml`). That distribution was
retired: working-style instructions are tooling configuration for the maintainer, not project
documentation, and they now live only in the private repository. The sync marker block, the hash
files under `.claude/`, and the integrity workflow are all gone; there is nothing to keep in sync
any more. (The historical chain before that — a hand-copied block compared through a
per-repository token, `DEV_STANDARDS_TOKEN` — is likewise long gone.)

What is genuinely unfinished is the release path, not the library:

- The repository **went public on 2026-08-10**, which also enabled npm provenance — it had been
  switched off only because npm requires a public source repository. `release.yml` asks for
  `id-token: write`; the `--provenance` flag is gone, because trusted publishing mints the
  attestation on its own.
- **Branch protection is on** (2026-08-10). Direct pushes to `main` are refused; changes go through
  a pull request whose `test` check must pass. `enforce_admins` is on, so that applies to the owner
  too — unblocking yourself is a settings change, not a `--force`. `required_approving_review_count`
  is 0 because a solo maintainer cannot approve their own pull request and 1 would make every one of
  them permanently unmergeable.

  Two settings that were chosen against the obvious default:

  - **`strict: false`** (a branch need not be up to date with `main` to merge). With `strict: true`,
    merging any pull request forces every other open one in the repository to be updated first.
    `ci.yml` also runs on pushes to `main`, so a semantic conflict still turns something red.
  - **Only `test` is required, and it has no `paths:` filter.** The now-removed `integrity`
    check was deliberately never required: it was path-filtered, and a required check that does
    not start leaves a pull request stuck on "Expected — waiting for status" forever. The rule
    survives the check that motivated it — never require a path-filtered workflow.

  The `Refresh address data and coverage` workflow was already built for this: when its push of
  `docs/coverage.md` is refused, it degrades to a warning pointing at the run's artifact.
- **The workflow moved to npm trusted publishing on 2026-08-10** and carries no token. Trusted
  publishers are registered for both packages (repository + `release.yml`, no environment). That
  could not have been done before `0.1.0` existed (npm/cli#8544).
- **OIDC is proven, and `NPM_TOKEN` is gone.** `v0.1.1` (run `31558139492`, 2026-08-12) published
  both packages through trusted publishing, each with a provenance statement signed from GitHub
  Actions and no npm credential in the job. That was the first real exercise of the token exchange,
  and it removed the only reason the secret was kept; the maintainer deleted it the same day. See
  *`NPM_TOKEN` has been deleted* below — including what now has no fallback as a result.
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
  "required_status_checks": { "strict": false, "contexts": ["test"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# DEV_STANDARDS_TOKEN is obsolete — delete it if it is still there.
gh secret delete DEV_STANDARDS_TOKEN --repo tomatomerde/jp-address-romaji
```

The reasoning behind each field is above, under the release-path list. The one thing to re-derive
rather than copy if this is ever applied to a different repository: **`contexts` must list only
checks that run on every pull request.** Here that is `test` alone — a path-filtered check
(such as the since-removed `integrity`) would hang any pull request that does not touch its paths.

Both `gh repo edit` calls and the protection call have already been made, so this block is a no-op
today; it is kept because the ordering it encodes still matters if the repository is ever recreated
(on a free plan, branch protection is only available on public repositories).

`NPM_TOKEN` is no longer part of setup — the workflow authenticates through trusted publishing, so
a fresh clone of this repository needs no npm secret at all. What it needs instead is a **trusted
publisher registered on npmjs.com for each package**: publisher *GitHub Actions*, this repository,
workflow filename `release.yml`, environment name left empty. `docs/releasing.md` has the table.

The advice this paragraph used to give — "`NPM_TOKEN` must be an **Automation** token" — was wrong
and is retracted. npm has merged classic and granular token creation into one form; there is no
Automation type to pick. The field that decides whether a token can publish from CI is the **Bypass
two-factor authentication (2FA)** checkbox, and regenerating an existing token does not change it.
That now matters only for a local publish, which authenticates as an account rather than through
CI — the workflow needs no token at all.

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

**A third dry run followed the switch to trusted publishing** (run
[31402994984](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31402994984),
2026-08-10, on the merge commit). Green end to end. What it actually proves is narrow but was the
point of running it: the `Ensure npm supports trusted publishing` guard works on a real runner. It
measured **npm 10.9.8** from `setup-node` — below trusted publishing's 11.5.1 floor — and 12.0.2
after the upgrade. Without that step the pipeline would have reached `npm publish` and failed with
an authentication error that names no version.

**Now verified: the OIDC publish.** That dry run could not settle it — both publish steps printed
`… is already on npm; skipping.`, which is also the answer to "can we just re-push `v0.1.0` to test
it": no. The first real exercise was the next version bump, and it happened —
**`v0.1.1` on 2026-08-12** (run
[31558139492](https://github.com/tomatomerde/jp-address-romaji/actions/runs/31558139492)) published
`jp-address-romaji-data` and then `jp-address-romaji`, each printing `Signed provenance statement
with source and build information from GitHub Actions` and a sigstore transparency-log entry.
`npm 12.0.2` was in place at the publish step.

**The dataset download now survives a transient failure, and that is tested** (2026-08-12). It
previously did not: one failed municipality out of ~1,899 set `process.exitCode = 1` and took the
release with it. Reproduced before fixing, with a local server returning 503 three times for a
single municipality — exit 1, that municipality's file absent. `build-data.ts` now retries the
failures of the concurrent pass serially afterwards, with a longer backoff, and only what survives
that sweep fails the build. `packages/data/test/build-data.test.ts` covers the clean run, the
recovered-in-the-sweep run and the never-recovers run, driving the real script as a subprocess
against a fixture server. Each assertion was checked by breaking the code it guards: disabling the
sweep fails the recovery test, swallowing the survivors fails the exit-code test.

Two things that fell out of writing it, both of which had been latent since the file was written:

- **A non-numeric or zero `--concurrency` produced a silently empty dataset.** It reached the worker
  pool as `NaN`, `Math.min(NaN, n)` sized the pool to zero, no municipality was ever fetched, and
  the build printed "Done. 0 towns across 1899 municipalities" and **exited 0**. Confirmed by
  running the pre-change script both ways. All three numeric options are now rejected unless they
  parse as positive integers, and the build additionally refuses to exit 0 unless it wrote one file
  per municipality.
- **`build-data.ts` had no tests at all** — the script that produces the entire contents of the data
  package. `packages/data/test/` did not exist.

**The scoped tag shapes were exercised locally on 2026-08-11, short of the registry.** The
`Determine release plan`, `Verify tag matches package versions` and CHANGELOG-guard blocks were
extracted from `release.yml` with `yq` and run verbatim against this working tree for seven tags:
`v0.1.0`, `data-v0.1.0` and `core-v0.1.0` select the right scope and pass; `data-v0.2.0` and
`core-v0.1.1` fail on the version guard naming only the package the tag selects; `vgarbage` and
`data-vX` are rejected as unrecognized shapes. What that does **not** cover is the rest of a
`data-v*` run — packing, the tarball assertions, and a publish where only one of the two packages
moves. Those still wait for a real scoped release.

**A second npm-version assertion now runs immediately before publishing**
(`scripts/assert-npm-version.sh`, shared byte-identically with the sibling repositories). This
workflow does not re-run `actions/setup-node` after the upgrade, so it is a guard against that
changing rather than a fix for a live defect — the sibling workflows, which do switch Node for a
smoke test on the oldest supported runtime, are where it earns its keep. The script was checked on
both sides of the 11.5.1 boundary with a stub `npm` (11.5.0 fails, 11.5.1 passes).

## Resolved (2026-08-11): the two ambiguity figures disagreed, and both were stale

The README used to quote 0.95% and 1.23% for the same quantity. Neither could be traced to a
method, and neither reproduces against the shipped dataset with the shipping matcher. Settled by
downloading `jp-address-romaji-data@0.1.0` from the npm registry and measuring with the matcher's
own key functions — `scripts/measure-ambiguity.ts`, added for exactly this, so the numbers are
reproducible instead of archaeological:

- **1.10%** of the romanization keys `fromRomaji` indexes (2,778/252,587, full forms plus stemmed
  short forms) map to ≥2 distinct towns in one municipality; 4,869 towns (3.74%) are involved.
- **0.69%** of full-form keys (1,404/204,671; 2,620 towns) — the residue a full town name cannot
  resolve, which is the figure the KEN_ALL trade-off actually rests on.

A method matrix (dedupe by name/record × plausibility filter on/off × vowel styles × stems) was
run to see whether any variant reproduces the historical 0.95/1.23; none does — the closest are
0.91% and 1.40%, so both old figures belonged to earlier versions of the key logic. The
transcription risk is closed structurally: `candidateKeys`/`stemKey` are exported from
`fromRomaji.ts` and the script imports them rather than copying them.

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
