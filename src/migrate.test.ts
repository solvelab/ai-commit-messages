import { describe, expect, it } from 'vitest'

import { describePlan, LEGACY_DEFAULTS, planMigration } from './migrate.js'

// Exactly what the user has configured today.
const REAL_WORLD = {
  apiUrl: 'http://192.168.15.6:11434/api/generate',
  model: 'qwen2.5-coder:7b',
  maxDiffLength: 4000,
  prompt: 'Você é um gerador de mensagens de commit. Retorne APENAS a mensagem final. Diff: {diff}',
}

describe('planMigration', () => {
  it('trims the full endpoint down to a base URL', () => {
    const plan = planMigration({ apiUrl: REAL_WORLD.apiUrl })
    expect(plan.entries[0]).toMatchObject({
      from: 'ollama-commit.apiUrl',
      to: 'aiCommitMessages.endpoint',
      value: 'http://192.168.15.6:11434',
    })
    expect(plan.entries[0].note).toContain('base URL')
  })

  it.each([
    ['http://host:11434/api/generate', 'http://host:11434'],
    ['http://host:11434/api/chat', 'http://host:11434'],
    ['http://host:11434/', 'http://host:11434'],
    ['http://host:11434', 'http://host:11434'],
  ])('normalizes %s', (apiUrl, expected) => {
    expect(planMigration({ apiUrl }).entries[0]?.value).toBe(expected)
  })

  it('carries the prompt over with the {diff} placeholder intact', () => {
    const plan = planMigration({ prompt: REAL_WORLD.prompt })
    const entry = plan.entries.find(e => e.to === 'aiCommitMessages.promptTemplate')
    expect(entry?.value).toBe(REAL_WORLD.prompt)
    expect(String(entry?.value)).toContain('{diff}')
  })

  it('says out loud that maxDiffLength counts characters', () => {
    const plan = planMigration({ maxDiffLength: 8000 })
    expect(plan.entries[0]).toMatchObject({ to: 'aiCommitMessages.maxDiffChars', value: 8000 })
    expect(plan.entries[0].note).toContain('characters')
  })

  it('ignores values left at the legacy defaults — nothing to import', () => {
    expect(planMigration(LEGACY_DEFAULTS).entries).toHaveLength(0)
  })

  it('ignores an empty configuration', () => {
    expect(planMigration({}).entries).toHaveLength(0)
    expect(planMigration({ apiUrl: '', model: '' }).entries).toHaveLength(0)
  })

  it('imports the whole real-world configuration except values at their defaults', () => {
    const plan = planMigration(REAL_WORLD)
    // model and maxDiffLength match the legacy defaults, so only endpoint and prompt move.
    expect(plan.entries.map(e => e.to)).toEqual([
      'aiCommitMessages.endpoint',
      'aiCommitMessages.promptTemplate',
    ])
  })

  it('flags a value that would overwrite something already customized', () => {
    const plan = planMigration(
      { apiUrl: 'http://192.168.15.6:11434/api/generate' },
      { endpoint: 'http://outro-host:11434' },
    )
    expect(plan.conflicts).toContain('aiCommitMessages.endpoint')
  })

  it('does not flag a conflict when the values already agree', () => {
    const plan = planMigration(
      { apiUrl: 'http://192.168.15.6:11434/api/generate' },
      { endpoint: 'http://192.168.15.6:11434' },
    )
    expect(plan.conflicts).toHaveLength(0)
  })

  it('skips an apiUrl that is not a URL at all', () => {
    expect(planMigration({ apiUrl: 'nem url é' }).entries).toHaveLength(0)
  })

  it('skips a non-numeric maxDiffLength', () => {
    expect(planMigration({ maxDiffLength: 'muitos' }).entries).toHaveLength(0)
  })
})

describe('describePlan', () => {
  it('shows source, destination, value and the reason it changed', () => {
    const text = describePlan(planMigration(REAL_WORLD))
    expect(text).toContain('ollama-commit.apiUrl → aiCommitMessages.endpoint')
    expect(text).toContain('http://192.168.15.6:11434')
    expect(text).toContain('base URL')
  })

  it('truncates a long value so the preview stays readable', () => {
    const text = describePlan(planMigration({ prompt: 'x'.repeat(500) }))
    expect(text).toContain('…')
    expect(text.split('\n').every(line => line.length < 200)).toBe(true)
  })

  it('warns about overwrites', () => {
    const text = describePlan(
      planMigration({ apiUrl: 'http://a:11434/api/generate' }, { endpoint: 'http://b:11434' }),
    )
    expect(text).toContain('Overwrites values you already set')
  })

  it('says so when there is nothing to do', () => {
    expect(describePlan(planMigration({}))).toBe('Nothing to import.')
  })
})
