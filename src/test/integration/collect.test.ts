import { execFileSync } from 'node:child_process'
import * as assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import * as vscode from 'vscode'

import { collectChanges } from '../../git/collect.js'
import { createCollectHost } from '../../git/collectHost.js'
import { getGitApi } from '../../git/api.js'
import type { Repository } from '../../types/git.js'

/**
 * Exercises the collector against a real git repository driven by the real git extension —
 * the part the unit tests deliberately fake.
 */
suite('collect (real repository)', () => {
  let root: string
  let repository: Repository

  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' })

  suiteSetup(async function () {
    this.timeout(60_000)
    root = mkdtempSync(join(tmpdir(), 'acm-fixture-'))

    execFileSync('git', ['-c', 'init.defaultBranch=main', 'init', root], { stdio: 'pipe' })
    git('config', 'user.email', 'fixture@example.com')
    git('config', 'user.name', 'Fixture')
    git('config', 'commit.gpgsign', 'false')

    writeFileSync(join(root, 'kept.txt'), 'one\ntwo\n')
    writeFileSync(join(root, 'renamed-from.txt'), 'stable contents\n')
    git('add', '.')
    git('commit', '-m', 'chore: fixture baseline')

    // A modification, a brand-new file and a rename — all staged.
    writeFileSync(join(root, 'kept.txt'), 'one\ntwo\nthree\n')
    writeFileSync(join(root, 'added.txt'), 'fresh\n')
    git('mv', 'renamed-from.txt', 'renamed-to.txt')
    git('add', '.')

    const api = await getGitApi()
    assert.ok(api, 'git API unavailable')
    const opened = await api.openRepository(vscode.Uri.file(root))
    assert.ok(opened, 'git extension did not open the fixture repository')
    repository = opened
    await repository.status()
  })

  suiteTeardown(() => {
    rmSync(root, { recursive: true, force: true })
  })

  test('reads staged changes, including the file git has no blob for', async () => {
    const result = await collectChanges(createCollectHost(repository))

    assert.equal(result.source, 'index')
    assert.equal(result.usedWholeDiffFallback, false)

    const byName = new Map(result.files.map(f => [f.path.split(/[\\/]/).pop(), f]))
    assert.ok(byName.has('kept.txt'), `missing kept.txt; got ${[...byName.keys()].join(', ')}`)
    assert.ok(byName.has('added.txt'), `missing added.txt; got ${[...byName.keys()].join(', ')}`)

    assert.match(byName.get('kept.txt')!.patch, /\+three/)

    const added = byName.get('added.txt')!
    assert.match(added.patch, /\+fresh/)
  })

  test('does not emit the same file twice after a rename', async () => {
    const result = await collectChanges(createCollectHost(repository))
    const names = result.files.map(f => f.path)
    assert.equal(new Set(names).size, names.length, `duplicated entries in ${names.join(', ')}`)
  })

  test('falls back to the working tree when the index is empty', async function () {
    this.timeout(60_000)
    git('reset')
    await repository.status()

    const result = await collectChanges(createCollectHost(repository))
    assert.equal(result.source, 'worktree')
    assert.ok(result.files.length > 0, 'expected working tree changes to be collected')
  })

  test('reports nothing to describe on a clean repository', async function () {
    this.timeout(60_000)
    git('checkout', '--', '.')
    git('clean', '-fd')
    await repository.status()

    const result = await collectChanges(createCollectHost(repository))
    assert.equal(result.files.length, 0)
    assert.equal(result.usedWholeDiffFallback, false)
  })
})
