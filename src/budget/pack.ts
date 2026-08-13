/**
 * Fitting per-file patches into a character budget.
 *
 * Pure on purpose — the budget arithmetic is the part worth testing, and it must not need an
 * editor to run.
 */

export interface BudgetedFile {
  readonly path: string
  readonly patch: string
}

/** Packs per-file patches into the character budget, reporting what did not fit. */
export function packWithinBudget(
  files: readonly BudgetedFile[],
  budgetChars: number,
): { kept: BudgetedFile[]; omitted: string[] } {
  const kept: BudgetedFile[] = []
  const omitted: string[] = []
  let used = 0

  for (const file of files) {
    const cost = file.patch.length + file.path.length + 8
    if (used + cost > budgetChars && kept.length > 0) {
      omitted.push(file.path)
      continue
    }
    kept.push({ path: file.path, patch: file.patch })
    used += cost
  }
  return { kept, omitted }
}
