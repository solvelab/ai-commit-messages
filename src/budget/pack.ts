/**
 * Fitting per-file patches into a character budget.
 *
 * Pure on purpose — the budget arithmetic is the part worth testing, and it must not need an
 * editor to run.
 */

import { createMatcher, headerOnly, prioritize, type Matcher } from './exclude.js'

export interface BudgetedFile {
  readonly path: string
  readonly patch: string
}

export interface PackOptions {
  /** Globs whose files contribute a header only. */
  readonly excludeGlobs?: readonly string[]
}

export interface PackResult {
  readonly kept: BudgetedFile[]
  /** Files dropped for lack of budget. */
  readonly omitted: string[]
  /** Files reduced to their header because they are generated. */
  readonly excluded: string[]
  /** Globs that could not be compiled. */
  readonly invalidGlobs: readonly string[]
}

/** Packs per-file patches into the character budget, reporting what did not fit. */
export function packWithinBudget(
  files: readonly BudgetedFile[],
  budgetChars: number,
  options: PackOptions = {},
): PackResult {
  const matcher: Matcher = createMatcher(options.excludeGlobs ?? [])

  // Code first: a lockfile must never push the actual change out of the prompt.
  const ordered = prioritize(files, matcher)

  const kept: BudgetedFile[] = []
  const omitted: string[] = []
  const excluded: string[] = []
  let used = 0

  for (const { file, kind } of ordered) {
    const generated = kind === 'generated'
    // The header is kept on purpose: "update the lockfile" is real information for the message;
    // its twelve thousand changed lines are not.
    const patch = generated ? headerOnly(file.patch, file.path) : file.patch
    if (generated) {
      excluded.push(file.path)
    }

    const cost = patch.length + file.path.length + 8
    if (used + cost > budgetChars && kept.length > 0) {
      omitted.push(file.path)
      continue
    }
    kept.push({ path: file.path, patch })
    used += cost
  }

  return { kept, omitted, excluded, invalidGlobs: matcher.invalid }
}
