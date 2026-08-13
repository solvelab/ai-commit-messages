import * as vscode from 'vscode'

import { getGitApi } from '../git/api.js'
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
      // Refresh before reading state — the git extension caches it.
      await repository.status()
      // Message generation lands in #7 (diff) → #8 (provider) → #9 (format).
      log.info('generation pipeline not wired yet')
      void vscode.window.showInformationMessage(
        'AI Commit Messages is not wired to a model yet — see issue #8.',
      )
    },
  )
}
