import { normalizeBaseUrl } from './settings.js'

/**
 * Importing the configuration of `DesislavArashev.ollama-commit`.
 *
 * That extension is abandoned — v0.1.0, published 2025-03-30, never updated. Its 1,711 installs are
 * the concrete audience for this one, and switching must not cost a manual reconfiguration.
 *
 * The four keys and their defaults below were read from the published VSIX 0.1.0
 * (`extension/package.json` inside the package), not guessed.
 */

export const LEGACY_SECTION = 'ollama-commit'

export const LEGACY_DEFAULTS = {
  apiUrl: 'http://localhost:11434/api/generate',
  model: 'qwen2.5-coder:7b',
  maxDiffLength: 4000,
  prompt:
    'Generate a concise, imperative git commit message written in the present tense for the following code changes:\n\n```diff\n{diff}\n```\n\nCommit message:',
} as const

export interface MigrationEntry {
  readonly from: string
  readonly to: string
  readonly value: string | number
  /** Set when the value was rewritten on the way over. */
  readonly note?: string
}

export interface MigrationPlan {
  readonly entries: readonly MigrationEntry[]
  /** Keys that would overwrite a value already customized on this side. */
  readonly conflicts: readonly string[]
}

export interface LegacyValues {
  readonly apiUrl?: unknown
  readonly model?: unknown
  readonly maxDiffLength?: unknown
  readonly prompt?: unknown
}

/** Values already set on our side, so nothing is overwritten silently. */
export interface CurrentValues {
  readonly endpoint?: string
  readonly model?: string
  readonly maxDiffChars?: number
  readonly promptTemplate?: string
}

function isCustomized(value: unknown, fallback: unknown): boolean {
  if (value === undefined || value === null || value === '') {
    return false
  }
  return value !== fallback
}

/**
 * Builds the plan. Nothing is written here — the caller previews it and asks first.
 *
 * Two traps in the mapping, both from reading the shipped VSIX:
 * - `apiUrl` is a **full endpoint** (`…/api/generate`), while every modern client stores a base URL.
 * - `maxDiffLength` counts **characters**, not tokens.
 */
export function planMigration(legacy: LegacyValues, current: CurrentValues = {}): MigrationPlan {
  const entries: MigrationEntry[] = []
  const conflicts: string[] = []

  if (isCustomized(legacy.apiUrl, LEGACY_DEFAULTS.apiUrl) && typeof legacy.apiUrl === 'string') {
    const base = normalizeBaseUrl(legacy.apiUrl)
    if (base) {
      entries.push({
        from: `${LEGACY_SECTION}.apiUrl`,
        to: 'aiCommitMessages.endpoint',
        value: base,
        ...(base === legacy.apiUrl ? {} : { note: 'full endpoint trimmed to the base URL' }),
      })
      if (current.endpoint && current.endpoint !== base) {
        conflicts.push('aiCommitMessages.endpoint')
      }
    }
  }

  if (isCustomized(legacy.model, LEGACY_DEFAULTS.model) && typeof legacy.model === 'string') {
    entries.push({ from: `${LEGACY_SECTION}.model`, to: 'aiCommitMessages.model', value: legacy.model })
    if (current.model && current.model !== legacy.model) {
      conflicts.push('aiCommitMessages.model')
    }
  }

  if (
    isCustomized(legacy.maxDiffLength, LEGACY_DEFAULTS.maxDiffLength) &&
    typeof legacy.maxDiffLength === 'number' &&
    Number.isFinite(legacy.maxDiffLength)
  ) {
    entries.push({
      from: `${LEGACY_SECTION}.maxDiffLength`,
      to: 'aiCommitMessages.maxDiffChars',
      value: legacy.maxDiffLength,
      note: 'characters, not tokens',
    })
    if (current.maxDiffChars && current.maxDiffChars !== legacy.maxDiffLength) {
      conflicts.push('aiCommitMessages.maxDiffChars')
    }
  }

  if (isCustomized(legacy.prompt, LEGACY_DEFAULTS.prompt) && typeof legacy.prompt === 'string') {
    entries.push({
      from: `${LEGACY_SECTION}.prompt`,
      to: 'aiCommitMessages.promptTemplate',
      value: legacy.prompt,
      note: 'used as the rules block; this extension asks the model for JSON and renders the text itself',
    })
    if (current.promptTemplate) {
      conflicts.push('aiCommitMessages.promptTemplate')
    }
  }

  return { entries, conflicts }
}

/** Human-readable preview of the plan. */
export function describePlan(plan: MigrationPlan): string {
  if (plan.entries.length === 0) {
    return 'Nothing to import.'
  }
  const lines = plan.entries.map(entry => {
    const value = typeof entry.value === 'string' ? entry.value : String(entry.value)
    const shown = value.length > 80 ? `${value.slice(0, 77)}…` : value
    return `${entry.from} → ${entry.to}\n    ${shown}${entry.note ? `\n    (${entry.note})` : ''}`
  })
  if (plan.conflicts.length > 0) {
    lines.push(`Overwrites values you already set: ${plan.conflicts.join(', ')}`)
  }
  return lines.join('\n')
}
