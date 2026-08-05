# Contributing

Thanks for looking at `jp-address-romaji`. This document is for human contributors; it describes
what the project promises to its users and how to work on it without breaking those promises. (If
you're an AI agent working on this repo, see `CLAUDE.md` instead — it's a different document with
different assumptions.)

## What this project must never do

These aren't style preferences. Each one exists because breaking it produces a wrong address that
looks right, which is worse than a refusal.

- **Never guess a reading.** Every romanization this library emits comes from the dataset — its
  `romaji` field, or its `kana` field transliterated deterministically. If a town has neither, the
  correct behavior is an explicit typed failure (e.g. `NO_ROMAJI_DATA`), not a best-effort spelling.
  Failures are ordinary return values (a discriminated union with `ok: false`), not exceptions —
  callers are expected to handle them, and the type system won't let them ignore the failure branch.
  If you're tempted to add a fallback that "looks close enough," don't — that's exactly the shortcut
  this library exists to refuse.

- **Never reinvent address normalization.** Parsing raw Japanese address text — full-width digits,
  kanji numerals, `丁目/番/号` versus hyphen notation, omitted prefectures, character variants — is
  entirely `@geolonia/normalize-japanese-addresses`'s job. This package only adds the layer above it:
  romanization, word order, reverse lookup, and output formatting. If a PR needs to special-case how
  raw Japanese text is parsed, that's a sign the fix belongs upstream, not here.

- **The offline guarantee is enforced by a test, not just documented.** The upstream normalizer
  defaults to a hosted API; this package always points it at a local directory instead. A test
  replaces `globalThis.fetch` with a stub that throws, so any code path that reaches the network
  during conversion fails CI. Do not add a network fallback, and do not weaken or remove that test —
  it is the only thing standing between "documented as offline" and "actually offline." Addresses are
  personal data; this is the library's core privacy claim.

A few narrower traps worth knowing about before you touch the relevant code (fuller detail and the
bugs that motivated each one are in `CLAUDE.md`'s "Landmines" section, and in code comments at the
sites themselves):

- `point` (geocoordinates) is required on prefecture/city records and must stay absent from town
  records — the upstream indexer throws without it at the higher levels, and town-level points are
  dropped deliberately (this library makes no geocoding claim).
- Don't strip a trailing digit from a town's romaji — in the v2 dataset, chome has its own field, so
  a trailing digit is part of the name itself.
- The Kyoto street-name phrase (`烏丸通四条上ル`) must be split off *before* normalization, and never
  romanized — see `packages/core/src/kyoto.ts`.

## Getting set up

- Node.js 18+, `pnpm` (version pinned in root `package.json`'s `packageManager` field — don't
  override it elsewhere).
- `pnpm install` at the repo root installs everything for both packages (`packages/core` and
  `packages/data`) via the pnpm workspace.

## Checking your work locally

```sh
pnpm lint                                   # ESLint
pnpm -r typecheck                           # tsc --noEmit, both packages
pnpm -r build                               # compile both packages
pnpm test                                   # fixture-based test suite; hermetic, no data download needed
```

`pnpm test` on its own runs entirely against small, committed test fixtures — it needs no real
dataset and no network access. There's a second suite that runs against the real, full-size dataset:

```sh
JP_ADDRESS_ROMAJI_DATA_DIR=./address-data pnpm test
```

That requires a built dataset at `./address-data`. **Building one requires network access to
Geolonia's data host, which is not available from most sandboxed/cloud dev environments** (including
Claude Code cloud sessions). If you need to exercise the real-data suite or check coverage numbers,
use this repository's **`Refresh address data and coverage`** GitHub Actions workflow instead of
trying to build the dataset locally — it runs on a GitHub-hosted runner with normal internet access,
and its logs and step summary show the result. Do not commit `packages/data/data/` — it's generated
output, gitignored, and rebuilt at release time; a PR that adds it will not be merged.

## Adding or changing tests

If you add a test for a bug fix or a new behavior, check that it actually exercises the code path:
temporarily break the code it's supposed to protect (comment out the fix, revert the logic, whatever
makes the bug come back) and confirm the test fails. If it doesn't fail, it isn't testing what you
think it's testing — fix the test, not just the code.

## Branches and pull requests

- `main` is the default branch. **Never push directly to `main`** — all changes go through a
  feature branch and a pull request, even small ones.
- Write commit messages that explain **why**, not just what. The diff already shows what changed;
  it won't show why you chose that approach over another, and that's the part reviewers (including
  future you) actually need.
- CI runs lint, typecheck, build, and the fixture-based test suite on every push and PR. All of them
  need to pass before merge.

## Language policy

Code comments, JSDoc, and error messages are English, regardless of which language a given PR's
description or discussion happens to be in. Test case *descriptions* (the string passed to `it(...)`
or `describe(...)`) may be in Japanese, since they're documentation for a Japan-focused library and
often read more naturally that way.

## Releasing

Contributors don't need to run a release. If you're doing one, see
[`docs/releasing.md`](./docs/releasing.md) — releases are driven by a GitHub Actions workflow, not a
local `npm publish`.
