import { defineConfig } from 'vitest/config'

// Unit tests cover the pure modules only — anything that imports `vscode` belongs to the
// integration suite driven by @vscode/test-cli (see .vscode-test.mjs).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/test/**', 'node_modules/**', 'dist/**', 'out/**'],
    environment: 'node',
  },
})
