import { GitStatus, isIndexStatus, isUntracked, statusName } from './status.js'

/**
 * Reading the change set as a list of per-file patches.
 *
 * Per-file rather than one `git diff --cached` blob because that is what makes a per-file budget
 * possible later: with a single string the only option left is a blind cut.
 *
 * Free of `vscode` imports — the repository arrives through the port below.
 */

/** Where the changes came from. Staged wins; the working tree is the fallback. */
export type ChangeSource = 'index' | 'worktree'

export interface FileChange {
  /** Path used to ask git for this file's patch. */
  readonly path: string
  readonly status: number
}

export interface FilePatch extends FileChange {
  readonly patch: string
  /** Untracked files have no git patch — theirs is synthesized from the file contents. */
  readonly synthesized: boolean
}

export interface SkippedFile extends FileChange {
  readonly reason: string
}

export interface CollectResult {
  readonly source: ChangeSource
  readonly files: readonly FilePatch[]
  readonly skipped: readonly SkippedFile[]
  /** True when the per-file path yielded nothing and the whole-index diff was used instead. */
  readonly usedWholeDiffFallback: boolean
}

/** Everything the collector needs from a git `Repository` plus the filesystem. */
export interface CollectHost {
  readonly indexChanges: readonly FileChange[]
  readonly workingTreeChanges: readonly FileChange[]
  readonly untrackedChanges: readonly FileChange[]
  /** `git diff --cached -- <path>` */
  diffIndexWithHEAD(path: string): Promise<string>
  /** `git diff -- <path>` */
  diffWithHEAD(path: string): Promise<string>
  /** `git diff [--cached]` over the whole tree. */
  diffAll(cached: boolean): Promise<string>
  /** Reads a file so an untracked patch can be synthesized. `undefined` when unreadable. */
  readFile(path: string): Promise<{ text: string; bytes: number } | undefined>
}

/**
 * Ceiling for synthesizing an untracked file's patch. Matches the limit VS Code's own Copilot
 * extension uses for the same job.
 */
export const MAX_UNTRACKED_FILE_BYTES = 1024 * 1024

/** Path used when the whole-tree diff is the only thing available. */
export const WHOLE_DIFF_PSEUDO_PATH = '<staged changes>'

/** Cheap binary sniff: a NUL byte never appears in text git would diff. */
function looksBinary(text: string): boolean {
  return text.includes('\u0000')
}

/**
 * Builds the patch git cannot produce for a file it does not track yet.
 *
 * Shape mirrors what `git diff` emits for a new file, so the model sees something it recognizes.
 */
export function synthesizeUntrackedPatch(path: string, text: string): string {
  const lines = text.split('\n')
  // A trailing newline produces a final empty element that is not a real line.
  const hasTrailingNewline = lines.length > 0 && lines[lines.length - 1] === ''
  const body = hasTrailingNewline ? lines.slice(0, -1) : lines

  const header = [
    `diff --git a/${path} b/${path}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${path}`,
    `@@ -0,0 +1,${body.length} @@`,
  ]
  const added = body.map(line => `+${line}`)
  if (!hasTrailingNewline && body.length > 0) {
    added.push('\\ No newline at end of file')
  }
  return [...header, ...added].join('\n')
}

async function patchFor(
  change: FileChange,
  host: CollectHost,
): Promise<{ patch: string; synthesized: boolean } | { skip: string }> {
  if (isUntracked(change.status)) {
    const file = await host.readFile(change.path)
    if (!file) {
      return { skip: 'unreadable' }
    }
    if (file.bytes > MAX_UNTRACKED_FILE_BYTES) {
      return { skip: `untracked file over ${MAX_UNTRACKED_FILE_BYTES} bytes` }
    }
    if (looksBinary(file.text)) {
      return { skip: 'binary' }
    }
    return { patch: synthesizeUntrackedPatch(change.path, file.text), synthesized: true }
  }

  const patch = isIndexStatus(change.status)
    ? await host.diffIndexWithHEAD(change.path)
    : await host.diffWithHEAD(change.path)

  if (!patch.trim()) {
    // Deletions of an empty file, mode-only changes and binaries all land here.
    return { skip: `empty patch for ${statusName(change.status)}` }
  }
  return { patch, synthesized: false }
}

export async function collectChanges(host: CollectHost): Promise<CollectResult> {
  // Staged wins whenever anything is staged — same precedence the built-in generator uses.
  const staged = host.indexChanges.length > 0
  const source: ChangeSource = staged ? 'index' : 'worktree'
  const changes: readonly FileChange[] = staged
    ? host.indexChanges
    : [...host.workingTreeChanges, ...host.untrackedChanges]

  const files: FilePatch[] = []
  const skipped: SkippedFile[] = []

  for (const change of changes) {
    if (change.status === GitStatus.IGNORED) {
      continue
    }
    let result: Awaited<ReturnType<typeof patchFor>>
    try {
      result = await patchFor(change, host)
    } catch (error) {
      skipped.push({
        ...change,
        reason: error instanceof Error ? error.message : String(error),
      })
      continue
    }

    if ('skip' in result) {
      skipped.push({ ...change, reason: result.skip })
      continue
    }
    files.push({ ...change, patch: result.patch, synthesized: result.synthesized })
  }

  if (files.length > 0) {
    return { source, files, skipped, usedWholeDiffFallback: false }
  }

  // Nothing per-file: fall back to the whole-tree diff as one pseudo-file rather than giving up.
  const whole = await host.diffAll(staged)
  if (whole.trim()) {
    return {
      source,
      files: [
        {
          path: WHOLE_DIFF_PSEUDO_PATH,
          status: staged ? GitStatus.INDEX_MODIFIED : GitStatus.MODIFIED,
          patch: whole,
          synthesized: false,
        },
      ],
      skipped,
      usedWholeDiffFallback: true,
    }
  }

  return { source, files: [], skipped, usedWholeDiffFallback: false }
}
