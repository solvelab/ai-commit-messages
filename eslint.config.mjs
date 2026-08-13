import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'out/**',
      'node_modules/**',
      'coverage/**',
      // Holds a full downloaded VS Code build — linting it exhausts the heap.
      '.vscode-test/**',
      // Vendored from microsoft/vscode; kept byte-identical so it can be refreshed.
      'src/types/git.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build/config scripts run in plain Node, outside the TypeScript sources.
    files: ['*.js', '*.mjs', '*.mts'],
    languageOptions: {
      globals: { require: 'readonly', module: 'writable', process: 'readonly', console: 'readonly', __dirname: 'readonly' },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: 'error',
      'no-throw-literal': 'error',
    },
  },
)
