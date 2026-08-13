import { describe, expect, it } from 'vitest'

import { packWithinBudget } from '../budget/pack.js'

function file(path: string, size: number) {
  return { path, patch: 'x'.repeat(size) }
}

describe('packWithinBudget', () => {
  it('keeps everything that fits', () => {
    const { kept, omitted } = packWithinBudget([file('a.ts', 100), file('b.ts', 100)], 4000)
    expect(kept.map(f => f.path)).toEqual(['a.ts', 'b.ts'])
    expect(omitted).toEqual([])
  })

  it('omits what does not fit and names it', () => {
    const { kept, omitted } = packWithinBudget([file('a.ts', 500), file('huge.ts', 5000)], 1000)
    expect(kept.map(f => f.path)).toEqual(['a.ts'])
    expect(omitted).toEqual(['huge.ts'])
  })

  it('always keeps the first file, even when it alone blows the budget', () => {
    // Sending a truncated view of one file beats sending nothing at all.
    const { kept, omitted } = packWithinBudget([file('huge.ts', 50_000)], 1000)
    expect(kept.map(f => f.path)).toEqual(['huge.ts'])
    expect(omitted).toEqual([])
  })

  it('keeps later small files after skipping a big one', () => {
    const { kept, omitted } = packWithinBudget(
      [file('a.ts', 100), file('huge.ts', 5000), file('c.ts', 100)],
      1000,
    )
    expect(kept.map(f => f.path)).toEqual(['a.ts', 'c.ts'])
    expect(omitted).toEqual(['huge.ts'])
  })

  it('handles an empty change set', () => {
    expect(packWithinBudget([], 1000)).toEqual({
      kept: [],
      omitted: [],
      excluded: [],
      invalidGlobs: [],
    })
  })
})
