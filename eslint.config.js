// @ts-check
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'tests/fixtures/'] },

  // TypeScript sources, scripts and tests, with type information.
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      eqeqeq: 'error',
      // The action reports through the job summary, its outputs and the workflow log's annotations, not stray logs.
      'no-console': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // Template literals in messages interpolate numbers and booleans on purpose.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
      // `as string` is used where the types allow null but the code rules it out; `!` is banned by strict.
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',
    },
  },

  // Scripts report to the terminal.
  { files: ['scripts/**/*.ts'], rules: { 'no-console': 'off' } },

  // Plain JavaScript: config files.
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { eqeqeq: 'error', 'prefer-const': 'error' },
  },
);
