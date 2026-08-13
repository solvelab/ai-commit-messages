import * as vscode from 'vscode'

import type { API as GitAPI, Repository } from '../types/git.js'
import type { ResolverHost } from './resolve.js'

/** Adapts the git extension API and the editor to the port the cascade expects. */
export function createResolverHost(api: GitAPI): ResolverHost<Repository> {
  return {
    get repositories() {
      return api.repositories
    },
    getRepository: uri => api.getRepository(uri as vscode.Uri),
    openRepository: uri => api.openRepository(uri as vscode.Uri),
    activeDocumentUri: () => vscode.window.activeTextEditor?.document.uri,
    pick: async candidates => {
      const items = candidates.map(repository => ({
        label: vscode.workspace.asRelativePath(repository.rootUri, false),
        description: repository.rootUri.fsPath,
        repository,
      }))
      const choice = await vscode.window.showQuickPick(items, {
        title: 'Generate commit message for which repository?',
        placeHolder: 'Several repositories are open',
      })
      return choice?.repository
    },
  }
}
