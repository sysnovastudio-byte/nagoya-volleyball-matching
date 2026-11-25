import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // HTMLを直接挿入しない（docs/08の3章）
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'HTMLを直接挿入しないでください（docs/08の3章）。',
        },
      ],
      // 開発専用のダミーデータを、通常のコードから直接読み込まない
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/dev/*'],
              message:
                '開発専用のデータは repository.ts からだけ、開発時に動的に読み込みます。',
            },
          ],
        },
      ],
    },
  },
  {
    // 開発専用のデータ自身とテストは、直接読み込んでよい
    files: ['src/**/dev/**', 'src/**/*.test.{ts,tsx}'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  prettier,
]);
