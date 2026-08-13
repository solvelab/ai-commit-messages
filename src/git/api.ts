import * as vscode from 'vscode'

import type { API as GitAPI, GitExtension } from '../types/git.js'

/**
 * Handle on the built-in git extension's API.
 *
 * `extensionDependencies` guarantees `vscode.git` is activated before us, but the extension may
 * still be disabled by the user — hence the explicit activation and the `undefined` return instead
 * of a throw.
 */
export async function getGitApi(): Promise<GitAPI | undefined> {
  const extension = vscode.extensions.getExtension<GitExtension>('vscode.git')
  if (!extension) {
    return undefined
  }

  if (!extension.isActive) {
    await extension.activate()
  }

  const gitExtension = extension.exports
  if (!gitExtension.enabled) {
    return undefined
  }

  return gitExtension.getAPI(1)
}
