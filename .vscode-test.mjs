import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig } from '@vscode/test-cli'

export default defineConfig({
  files: 'out/test/**/*.test.js',
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
