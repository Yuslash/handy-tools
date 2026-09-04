import js from '@eslint/js'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

/*
  Flat config (ESLint 10).

  Only the typescript-eslint *parser* is used, not its rule set: the plugin's
  peer range excludes TypeScript 7, and type checking is `tsc --noEmit`'s job
  anyway. The parser handles TS syntax fine regardless of compiler version.
*/
export default [
  { ignores: ['dist', 'dist-electron', 'release', 'node_modules', 'python_backend', 'scripts'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react-hooks/refs': 'off',
      // TypeScript resolves these; the base rule reports false positives on types.
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    // A provider and its hook belong in one file; that co-location is the point,
    // and the fast-refresh cost is limited to these few modules.
    files: ['src/state/*.tsx', 'src/components/TimeRange.tsx', 'src/components/Rail.tsx', 'src/components/CubicBezierEditor.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
]
