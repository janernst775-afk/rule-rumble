import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Pure modules: must run unchanged on a Node server (CLAUDE.md, architecture rule 1).
const pureDirs = [
  'src/engine/**/*.ts',
  'src/bots/**/*.ts',
  'src/lobby/**/*.ts',
  'src/lang/**/*.ts',
];

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: pureDirs,
    ignores: ['**/__tests__/**'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react/*', 'zustand', 'zustand/*', 'i18next'],
              message: 'Pure module: no UI imports.',
            },
            {
              group: ['**/ui/**', '**/store/**', '**/audio/**'],
              message: 'Pure module: no UI/store/audio imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...[
          'window',
          'document',
          'localStorage',
          'sessionStorage',
          'navigator',
          'indexedDB',
          'Date',
          'performance',
          'setTimeout',
          'setInterval',
          'fetch',
        ].map((name) => ({
          name,
          message: 'Pure module: no DOM, time or IO access.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG from the game state.' },
      ],
    },
  },
  {
    files: ['*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
