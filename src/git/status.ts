/**
 * Numeric values of the git extension's `Status` enum.
 *
 * `git.d.ts` declares it as `const enum`, which has no runtime representation — and esbuild cannot
 * inline const-enum members across files. Mirroring the values here is the supported way to branch
 * on status inside a bundled extension.
 *
 * Source: microsoft/vscode `extensions/git/src/api/git.d.ts`.
 */
export const GitStatus = {
  INDEX_MODIFIED: 0,
  INDEX_ADDED: 1,
  INDEX_DELETED: 2,
  INDEX_RENAMED: 3,
  INDEX_COPIED: 4,

  MODIFIED: 5,
  DELETED: 6,
  UNTRACKED: 7,
  IGNORED: 8,
  INTENT_TO_ADD: 9,
  INTENT_TO_RENAME: 10,
  TYPE_CHANGED: 11,

  ADDED_BY_US: 12,
  ADDED_BY_THEM: 13,
  DELETED_BY_US: 14,
  DELETED_BY_THEM: 15,
  BOTH_ADDED: 16,
  BOTH_DELETED: 17,
  BOTH_MODIFIED: 18,
} as const

export type GitStatusValue = (typeof GitStatus)[keyof typeof GitStatus]

/** Staged statuses — these are the ones `git diff --cached` can describe. */
export function isIndexStatus(status: number): boolean {
  return status >= GitStatus.INDEX_MODIFIED && status <= GitStatus.INDEX_COPIED
}

/** A file git cannot diff, because it has no blob on either side yet. */
export function isUntracked(status: number): boolean {
  return status === GitStatus.UNTRACKED || status === GitStatus.INTENT_TO_ADD
}

const NAMES = Object.fromEntries(Object.entries(GitStatus).map(([k, v]) => [v, k])) as Record<
  number,
  string
>

export function statusName(status: number): string {
  return NAMES[status] ?? `UNKNOWN(${status})`
}
