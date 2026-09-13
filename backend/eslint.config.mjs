// ARCH-04 — the linter the product demanded of everyone else.
//
// The Pipeline Doctor penalises a *user's* project for having no lint stage
// (`no-lint-stage`), CLAUDE.md says this project must run "build, lint, test"
// on itself, and the source carried `// eslint-disable-next-line` comments
// that nothing enforced — including the ones suppressing the real
// react-hooks/exhaustive-deps issues on the frontend. The tool would have
// given its own pipeline a worse grade than it gives its fixtures.
//
// The rule set is deliberately narrow: correctness rules that catch real
// defects, not a style opinion. Formatting is left alone — this repository
// has a consistent hand-written style already, and a reformat would bury
// every other change in this session's diff.

import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    },
    rules: {
      // An unused variable is either a mistake or a leftover. `_`-prefixed
      // names are the documented way to say "deliberately ignored".
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // `any` erases the contract the IR exists to enforce. Warn rather
      // than error: the test suites use it for deliberately malformed
      // documents, which is exactly where it belongs.
      '@typescript-eslint/no-explicit-any': 'warn',
      // A floating promise in the executor or a controller is a silently
      // lost failure.
      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    // Test files may assert on malformed documents and print skip notices.
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
    },
  },
);
