import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@vscode/test-cli'

// A folder has to be open for workspace-scoped settings to be writable at all, and the scope
// resolution is exactly what the writeSetting suite exercises.
const workspaceFolder = join(tmpdir(), 'acm-vscode-test-workspace')
mkdirSync(workspaceFolder, { recursive: true })

export default defineConfig({
  files: 'out/test/**/*.test.js',
  workspaceFolder,
  // GPU/sandbox off keeps the host from hanging on headless CI and under WSLg; the data dirs are
  // pinned outside the repo because a DrvFs (/mnt/*) path makes Electron crawl.
  launchArgs: [
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--user-data-dir',
    join(tmpdir(), 'acm-vscode-test-user'),
    '--extensions-dir',
    join(tmpdir(), 'acm-vscode-test-ext'),
  ],
  mocha: {
    timeout: 30000,
  },
})
