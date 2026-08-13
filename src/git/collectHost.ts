import * as vscode from 'vscode'

import type { Repository } from '../types/git.js'
import { MAX_UNTRACKED_FILE_BYTES, type CollectHost, type FileChange } from './collect.js'

function toChanges(
  changes: readonly { uri: vscode.Uri; status: number; originalUri?: vscode.Uri }[],
): FileChange[] {
  return changes.map(change => {
    const original = change.originalUri?.fsPath
    return {
      path: change.uri.fsPath,
      status: change.status,
      // Kept because a pathspec diff drops the old side of a rename entirely.
      ...(original && original !== change.uri.fsPath ? { originalPath: original } : {}),
    }
  })
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
      const uri = vscode.Uri.file(path)
      try {
        // `stat` first: reading a huge untracked file into the extension host only to discard it
        // afterwards is how the window freezes.
        const stat = await vscode.workspace.fs.stat(uri)
        if (stat.size > MAX_UNTRACKED_FILE_BYTES) {
          return { text: '', bytes: stat.size }
        }
        const bytes = await vscode.workspace.fs.readFile(uri)
        return { text: new TextDecoder().decode(bytes), bytes: bytes.byteLength }
      } catch {
        return undefined
      }
    },
  }
}
