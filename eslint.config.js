// ESLint flat config (ESLint 9+ format).
//
// Goal: catch real mistakes (unused variables, undefined references, etc.)
// in a repo that has never been linted before — not reformat the existing
// codebase. Deliberately does NOT enable typed linting (`projectService` /
// `parserOptions.project`): it is slower and more brittle than the plain
// syntactic rules below, and this repo already gets type coverage from
// `tsc --noEmit` in `pnpm -r typecheck`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'packages/data/data/**', '**/coverage/**'],
  },
  {
    // .ts files: typescript-eslint's recommended preset turns off a few
    // eslint:recommended rules (e.g. `no-undef`) that `tsc` already covers,
    // which is correct only where a type checker is actually in the loop.
    // For package src/ that is `pnpm -r typecheck`; for the test files,
    // scripts/, and vitest.config.ts it is `tsconfig.tests.json` (run by the
    // root `pnpm typecheck`) — the package tsconfigs include only src/, so
    // without that file these were linted with `no-undef` off and no `tsc`
    // behind them at all.
    files: ['packages/*/src/**/*.ts', 'packages/*/test/**/*.ts', 'scripts/**/*.ts', 'vitest.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Plain JS scripts (no `tsc` backstop): keep eslint:recommended's
    // `no-undef` etc. active instead of layering typescript-eslint's
    // TS-oriented overrides on top.
    //
    // Match every .mjs anywhere, not `scripts/**/*.mjs`: flat-config patterns
    // are anchored at the config's directory, so that one covered only the
    // root `scripts/` and silently left `packages/data/scripts/` — where the
    // publish guard lives — with no rules at all. `eslint.config.js` is listed
    // explicitly for the same reason: it is the one plain `.js` in the repo.
    files: ['**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
);
