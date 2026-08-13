import * as vscode from 'vscode'

import { collectChanges } from '../git/collect.js'
import { getGitApi } from '../git/api.js'
import { createCollectHost } from '../git/collectHost.js'
import { createResolverHost } from '../git/host.js'
import { resolveRepository } from '../git/resolve.js'
import { getLog } from '../log.js'

/**
 * Entry point of the extension: turns the staged changes into a commit message.
 *
 * The handler MUST return a promise that settles only when the work is done — the SCM action
 * runner keeps the toolbar in its running state for exactly as long as this promise is pending.
 */
export async function generateCommitMessage(arg?: unknown): Promise<void> {
  const log = getLog()

  const git = await getGitApi()
  if (!git) {
    void vscode.window.showErrorMessage(
      'The built-in Git extension is unavailable, so no repository can be read.',
    )
    return
  }

  const { repository, source } = await resolveRepository(arg, createResolverHost(git))
  if (!repository) {
    log.warn('no repository resolved')
    void vscode.window.showErrorMessage('No git repository to generate a commit message for.')
    return
  }
  log.info(`repository resolved from ${source}: ${repository.rootUri.fsPath}`)

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AI Commit Messages: generating…',
      cancellable: true,
    },
    async (_progress, token) => {
      if (token.isCancellationRequested) {
        return
      }

      // The git extension caches state; refresh before reading it.
      await repository.status()
      const changes = await collectChanges(createCollectHost(repository))

      for (const skipped of changes.skipped) {
        log.debug(`skipped ${skipped.path}: ${skipped.reason}`)
      }

      if (changes.files.length === 0) {
        void vscode.window.showErrorMessage(
          'Nothing to describe: no staged or unstaged changes in this repository.',
        )
        return
      }

      if (changes.source === 'worktree') {
        log.info('nothing staged — describing working tree changes instead')
        void vscode.window.showWarningMessage(
          'Nothing is staged, so the working tree changes were used instead.',
        )
      }

      log.info(
        `collected ${changes.files.length} file(s) from ${changes.source}` +
          `${changes.usedWholeDiffFallback ? ' (whole-diff fallback)' : ''}, ` +
          `${changes.skipped.length} skipped`,
      )

      // Sending it to a model lands in #8; formatting in #9.
      void vscode.window.showInformationMessage(
        `AI Commit Messages: ${changes.files.length} file(s) ready, but no model is wired yet — see issue #8.`,
      )
    },
  )
}
