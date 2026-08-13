import { COMMIT_TYPES, DEFAULT_MAX_BODY_WORDS, TYPE_EMOJI } from './commit.js'

/**
 * Gate on the rendered message.
 *
 * Runs on the text, not on the draft, so it also covers the degraded path where a model returned
 * plain prose and the sanitizer cleaned it up.
 */

export interface ValidationProblem {
  readonly code:
    | 'empty'
    | 'missing-emoji'
    | 'bad-title'
    | 'title-trailing-period'
    | 'missing-blank-line'
    | 'body-bullet'
    | 'body-too-long'
    | 'markdown'
    | 'degenerate'
  readonly message: string
  /** 0-based line the problem was found on, when it is line-specific. */
  readonly line?: number
}

export interface ValidationResult {
  readonly ok: boolean
  readonly problems: readonly ValidationProblem[]
}

const EMOJIS = Object.values(TYPE_EMOJI) as string[]

const TITLE_RE = new RegExp(`^(?:${COMMIT_TYPES.join('|')})(?:\\([^)]+\\))?: \\S`)

/**
 * Replies that describe nothing. Local models produce these when the diff confuses them, and they
 * look plausible enough to commit by accident.
 */
const DEGENERATE = [
  'empty commit',
  'no changes',
  'no changes provided',
  'nothing to commit',
  'not provided',
  'empty diff',
  'sem alterações',
  'sem mudanças',
  'nada a commitar',
]

export interface ValidateOptions {
  readonly maxBodyWords?: number
}

export function validateCommitMessage(
  message: string,
  options: ValidateOptions = {},
): ValidationResult {
  const maxBodyWords = options.maxBodyWords ?? DEFAULT_MAX_BODY_WORDS
  const problems: ValidationProblem[] = []
  const text = message.replace(/\r\n/g, '\n').trim()

  if (!text) {
    return { ok: false, problems: [{ code: 'empty', message: 'The message is empty.' }] }
  }

  const lines = text.split('\n')
  const title = lines[0]

  const emoji = EMOJIS.find(candidate => title.startsWith(candidate))
  if (!emoji) {
    problems.push({
      code: 'missing-emoji',
      message: 'The first character of the title must be one of the mapped emoji.',
      line: 0,
    })
  }

  const titleRest = emoji ? title.slice(emoji.length).trimStart() : title
  if (!TITLE_RE.test(titleRest)) {
    problems.push({
      code: 'bad-title',
      message: `The title must read "<type>(<optional scope>): <description>" with type in ${COMMIT_TYPES.join('|')}.`,
      line: 0,
    })
  }
  if (/[.]$/.test(titleRest)) {
    problems.push({ code: 'title-trailing-period', message: 'The title must not end with a period.', line: 0 })
  }

  if (lines.length > 1 && lines[1].trim() !== '') {
    problems.push({
      code: 'missing-blank-line',
      message: 'A blank line must separate the title from the body.',
      line: 1,
    })
  }

  const body = lines.slice(2)
  body.forEach((line, index) => {
    const lineNumber = index + 2
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }
    if (/^(?:[-*•]|\d+[.)])\s/.test(trimmed)) {
      problems.push({ code: 'body-bullet', message: 'Body lines must not be bulleted.', line: lineNumber })
    }
    if (/^#{1,6}\s|\*\*|```/.test(trimmed)) {
      problems.push({ code: 'markdown', message: 'The message must not contain markdown.', line: lineNumber })
    }
    const words = trimmed.split(/\s+/).length
    if (words > maxBodyWords) {
      problems.push({
        code: 'body-too-long',
        message: `Body lines take at most ${maxBodyWords} words; this one has ${words}.`,
        line: lineNumber,
      })
    }
  })

  if (text.includes('```')) {
    problems.push({ code: 'markdown', message: 'The message must not contain code fences.', line: 0 })
  }

  // Equality against the description, not substring: a correct message *about* empty commits —
  // `fix(git): rejeitar empty commit quando nada está staged` — contains the phrase and is not
  // degenerate. Only a reply that says nothing else is.
  const description = titleRest
    .replace(new RegExp(`^(?:${COMMIT_TYPES.join('|')})(?:\\([^)]+\\))?:\\s*`), '')
    .trim()
    .toLowerCase()
  const whole = text.toLowerCase().trim()
  if (DEGENERATE.some(phrase => description === phrase || whole === phrase)) {
    problems.push({
      code: 'degenerate',
      message: 'The reply claims there are no changes, but a diff was sent.',
    })
  }

  return { ok: problems.length === 0, problems }
}

/** Instruction appended to the single corrective retry. */
export function correctionFor(problems: readonly ValidationProblem[]): string {
  const unique = [...new Set(problems.map(p => p.message))]
  return [
    'The previous reply did not follow the required format.',
    ...unique.map(message => `- ${message}`),
    'Describe the real code changes in the diff. Answer again, correctly.',
  ].join('\n')
}
