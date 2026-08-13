import * as vscode from 'vscode'

import { getGitApi } from '../git/api.js'
import { getLog } from '../log.js'

/**
 * Entry point of the extension: turns the staged changes into a commit message.
 *
 * The handler MUST return a promise that settles only when the work is done — the SCM action
 * runner keeps the toolbar in its running state for exactly as long as this promise is pending.
 *
 * `arg` is whatever the invoking surface hands over: a `vscode.SourceControl` from `scm/title`
 * (or `undefined` when more than one repository is visible), and nothing at all from the command
 * palette or a keybinding. Turning that into a repository is #6.
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

  log.debug(`generate invoked with arg of type ${arg === undefined ? 'undefined' : typeof arg}`)

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
      // Message generation lands in #7 (diff) → #8 (provider) → #9 (format).
      log.info('generation pipeline not wired yet')
      void vscode.window.showInformationMessage(
        'AI Commit Messages is not wired to a model yet — see issue #8.',
      )
    },
  )
}
