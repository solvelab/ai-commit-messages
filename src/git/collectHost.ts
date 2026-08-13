import * as vscode from 'vscode'

import type { Repository } from '../types/git.js'
import type { CollectHost, FileChange } from './collect.js'

function toChanges(changes: readonly { uri: vscode.Uri; status: number }[]): FileChange[] {
  return changes.map(change => ({ path: change.uri.fsPath, status: change.status }))
}

/** Adapts a git `Repository` plus the workspace filesystem to the collector's port. */
export function createCollectHost(repository: Repository): CollectHost {
  return {
    get indexChanges() {
      return toChanges(repository.state.indexChanges)
    },
    get workingTreeChanges() {
      return toChanges(repository.state.workingTreeChanges)
    },
    get untrackedChanges() {
      return toChanges(repository.state.untrackedChanges)
    },
    diffIndexWithHEAD: path => repository.diffIndexWithHEAD(path),
    diffWithHEAD: path => repository.diffWithHEAD(path),
    diffAll: cached => repository.diff(cached),
    readFile: async path => {
      try {
        const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(path))
        return { text: new TextDecoder().decode(bytes), bytes: bytes.byteLength }
      } catch {
        return undefined
      }
    },
  }
}
