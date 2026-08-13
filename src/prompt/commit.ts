/**
 * The commit message contract.
 *
 * The model returns **structure**; this module renders the **text**. That inversion is what makes
 * the format deterministic instead of dependent on the model obeying prose instructions — and it
 * is why the emoji never comes from the model.
 */

/** Commit types, and the emoji each one renders with. */
export const TYPE_EMOJI = {
  feat: '✨',
  fix: '🐛',
  docs: '📚',
  style: '🎨',
  refactor: '♻️',
  perf: '⚡',
  test: '🧪',
  build: '📦',
  ci: '🔧',
  chore: '🧹',
} as const

export type CommitType = keyof typeof TYPE_EMOJI

export const COMMIT_TYPES = Object.keys(TYPE_EMOJI) as CommitType[]

export interface CommitDraft {
  readonly type: CommitType
  readonly scope?: string
  readonly subject: string
  /** One short imperative action per entry. Rendered one per line. */
  readonly body: readonly string[]
}

/** Default ceiling for a body line, in words. */
export const DEFAULT_MAX_BODY_WORDS = 10

/** JSON Schema handed to backends that can enforce a reply shape. */
export function commitSchema(maxBodyWords = DEFAULT_MAX_BODY_WORDS): object {
  return {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: COMMIT_TYPES,
        description: 'The conventional commit type.',
      },
      scope: {
        type: 'string',
        description: 'Optional scope: the module or area touched. Omit when unclear.',
      },
      subject: {
        type: 'string',
        description: 'Imperative summary, no trailing period, no emoji.',
      },
      body: {
        type: 'array',
        items: {
          type: 'string',
          // Characters, not words — the closest constraint JSON Schema can express. Roughly the
          // width of `maxBodyWords` Portuguese words, and a useful nudge for the model.
          maxLength: maxBodyWords * 9,
        },
        description: `One action per entry, imperative, at most ${maxBodyWords} words, no bullet characters.`,
      },
    },
    required: ['type', 'subject', 'body'],
  }
}

function isCommitType(value: unknown): value is CommitType {
  return typeof value === 'string' && (COMMIT_TYPES as string[]).includes(value)
}

/** Strips anything that would break the rendered format. */
function cleanLine(line: string): string {
  return line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '') // bullet or numbering
    .replace(/[.;]+\s*$/, '') // trailing punctuation
    .replace(/`+/g, '')
    .trim()
}

/**
 * Parses whatever the model returned into a draft.
 *
 * Tolerant on purpose: a model told to answer with JSON may still wrap it, lowercase the type
 * differently, or return the body as a single newline-separated string.
 */
export function parseDraft(value: unknown): CommitDraft | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }
  const raw = value as Record<string, unknown>

  const type = typeof raw.type === 'string' ? raw.type.trim().toLowerCase() : undefined
  if (!isCommitType(type)) {
    return undefined
  }

  const subject = typeof raw.subject === 'string' ? cleanLine(raw.subject) : ''
  if (!subject) {
    return undefined
  }

  const bodySource = Array.isArray(raw.body)
    ? raw.body
    : typeof raw.body === 'string'
      ? raw.body.split('\n')
      : []

  const body = bodySource
    .map(entry => (typeof entry === 'string' ? cleanLine(entry) : ''))
    .filter(entry => entry.length > 0)

  const scopeRaw = typeof raw.scope === 'string' ? raw.scope.trim().replace(/[()]/g, '') : ''
  const scope = scopeRaw && scopeRaw.toLowerCase() !== 'none' ? scopeRaw : undefined

  return { type, ...(scope ? { scope } : {}), subject, body }
}

/**
 * Renders the final message.
 *
 * Shape: `<emoji> <type>(<scope>): <subject>`, a blank line, then one action per line.
 */
export function renderCommit(draft: CommitDraft): string {
  const scope = draft.scope ? `(${draft.scope})` : ''
  const title = `${TYPE_EMOJI[draft.type]} ${draft.type}${scope}: ${draft.subject}`
  if (draft.body.length === 0) {
    return title
  }
  return `${title}\n\n${draft.body.join('\n')}`
}

/** Body entries that blow the word budget, separated from the ones that fit. */
export function splitByWordBudget(
  body: readonly string[],
  maxWords: number,
): { kept: string[]; dropped: string[] } {
  const kept: string[] = []
  const dropped: string[] = []
  for (const entry of body) {
    if (entry.trim().split(/\s+/).length > maxWords) {
      dropped.push(entry)
    } else {
      kept.push(entry)
    }
  }
  return { kept, dropped }
}
