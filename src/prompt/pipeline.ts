import {
  commitSchema,
  DEFAULT_MAX_BODY_WORDS,
  parseDraft,
  renderCommit,
  splitByWordBudget,
  type CommitDraft,
} from './commit.js'
import { buildSystemPrompt, buildUserPrompt, type DiffFile, type PromptLanguage } from './template.js'
import { correctionFor, validateCommitMessage, type ValidationProblem } from './validate.js'
import { isTruncated, type CommitProvider, type GenerateResult } from '../providers/types.js'

/**
 * Diff in, commit message out.
 *
 * Kept free of `vscode` so the whole path can be exercised against a real model from a script, and
 * against a fake provider from the test suite.
 */

export interface PipelineOptions {
  readonly model: string
  readonly language?: PromptLanguage
  readonly maxBodyWords?: number
  readonly systemTemplate?: string
  readonly temperature?: number
  /**
   * Tokens the reply may use. Required on purpose: a default living here would be a second number
   * governing the same thing the diff budget already sizes itself against.
   */
  readonly maxTokens: number
  readonly contextTokens?: number
  readonly suppressThinking?: boolean
  readonly repository?: string
  readonly branch?: string
  readonly omitted?: readonly string[]
  /** Cleans a plain-text reply before it is parsed. Supplied by the sanitizer. */
  readonly sanitize?: (raw: string) => string
}

export interface PipelineOutcome {
  readonly message: string
  readonly draft: CommitDraft
  /** True when the first reply failed validation and a corrective retry was needed. */
  readonly retried: boolean
  /** Body entries dropped for blowing the word budget after the retry. Never truncated. */
  readonly droppedBodyEntries: readonly string[]
  readonly degradedToText: boolean
  readonly problems: readonly ValidationProblem[]
  /** Why the model stopped, when the backend said. Logged, never acted on when the reply is good. */
  readonly finishReason?: string
}

/**
 * Shown when the backend says it stopped at the limit.
 *
 * It names the setting because the previous message — "the model did not return a usable commit
 * message" — sent people looking at the model for a ceiling this extension had set.
 */
export const TRUNCATED_MESSAGE =
  'The reply was cut off by the token limit. Raise aiCommitMessages.maxOutputTokens.'

export class PipelineError extends Error {
  constructor(
    message: string,
    readonly raw: string,
    readonly problems: readonly ValidationProblem[] = [],
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

/** Pulls the JSON object out of a reply that may carry prose or a fence around it. */
export function extractJson(raw: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(raw)
  // A fence is a hint, not a guarantee: if its contents do not parse, the raw text still might.
  for (const candidate of fenced ? [fenced[1], raw] : [raw]) {
    const found = scanForObject(candidate)
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

/**
 * Scans for the first balanced object that parses.
 *
 * Restarts at the next `{` when a candidate fails, instead of giving up: a reply with a code
 * snippet before the JSON (`adds { timeout: 30 } to the config`) used to force a retry.
 */
function scanForObject(candidate: string): unknown {
  let start = candidate.indexOf('{')
  while (start !== -1) {
    const parsed = parseFrom(candidate, start)
    if (parsed !== undefined) {
      return parsed
    }
    start = candidate.indexOf('{', start + 1)
  }
  return undefined
}

function parseFrom(candidate: string, start: number): unknown {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < candidate.length; i += 1) {
    const char = candidate[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) {
      continue
    }
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

/**
 * Parse first, heuristics second.
 *
 * The sanitizer works on prose, and the payload is JSON. Running it first meant a reply whose
 * *content* mentions `<think>` — a commit about suppressing the reasoning trace, for instance —
 * had legitimate text stripped, or was rejected outright as a truncated stream. Trying the parse
 * on the raw text first makes the heuristics what they were meant to be: a fallback for when the
 * model answered with prose instead of JSON.
 */
function toDraft(result: GenerateResult, sanitize?: (raw: string) => string): CommitDraft | undefined {
  const direct = parseDraft(extractJson(result.text))
  if (direct) {
    return direct
  }
  const text = sanitize ? sanitize(result.text) : result.text
  return parseDraft(extractJson(text))
}

export async function generateMessage(
  provider: CommitProvider,
  files: readonly DiffFile[],
  options: PipelineOptions,
  signal?: AbortSignal,
): Promise<PipelineOutcome> {
  const maxBodyWords = options.maxBodyWords
  const system = buildSystemPrompt({
    ...(options.language ? { language: options.language } : {}),
    ...(maxBodyWords ? { maxBodyWords } : {}),
    ...(options.systemTemplate ? { template: options.systemTemplate } : {}),
  })
  const user = buildUserPrompt(files, {
    ...(options.repository ? { repository: options.repository } : {}),
    ...(options.branch ? { branch: options.branch } : {}),
    ...(options.omitted ? { omitted: options.omitted } : {}),
  })

  const request = {
    model: options.model,
    system,
    user,
    schema: commitSchema(maxBodyWords),
    maxTokens: options.maxTokens,
    temperature: options.temperature ?? 0,
    ...(options.contextTokens ? { contextTokens: options.contextTokens } : {}),
    ...(options.suppressThinking ? { suppressThinking: true } : {}),
  }

  const first = await provider.generate(request, signal)
  const firstDraft = toDraft(first, options.sanitize)
  if (firstDraft) {
    const message = renderCommit(firstDraft)
    const validation = validateCommitMessage(message, maxBodyWords ? { maxBodyWords } : {})
    if (validation.ok) {
      return {
        message,
        draft: firstDraft,
        retried: false,
        droppedBodyEntries: [],
        degradedToText: first.degradedToText,
        problems: [],
        ...(first.finishReason ? { finishReason: first.finishReason } : {}),
      }
    }
    return retry(provider, request, options, validation.problems, first, signal)
  }

  return retry(
    provider,
    request,
    options,
    [{ code: 'empty', message: 'The reply was not a JSON object matching the schema.' }],
    first,
    signal,
  )
}

async function retry(
  provider: CommitProvider,
  request: Parameters<CommitProvider['generate']>[0],
  options: PipelineOptions,
  problems: readonly ValidationProblem[],
  previous: GenerateResult,
  signal?: AbortSignal,
): Promise<PipelineOutcome> {
  // A reply cut off at the limit will be cut off again at the same limit. Asking twice buys the
  // user nothing but the wait, and the failure it ends in blames the wrong side.
  if (isTruncated(previous.finishReason)) {
    throw new PipelineError(TRUNCATED_MESSAGE, previous.text, problems)
  }

  // Exactly one corrective attempt: a model that ignored the schema twice will not improve on a
  // third identical ask, and each attempt costs the user real seconds.
  const second = await provider.generate(
    { ...request, system: `${request.system}\n\n${correctionFor(problems)}` },
    signal,
  )
  const draft = toDraft(second, options.sanitize)
  if (!draft) {
    throw new PipelineError(
      isTruncated(second.finishReason)
        ? TRUNCATED_MESSAGE
        : 'The model did not return a usable commit message.',
      second.text || previous.text,
      problems,
    )
  }

  const maxBodyWords = options.maxBodyWords ?? DEFAULT_MAX_BODY_WORDS

  // Last resort for the one failure a second ask does not fix: models keep writing body entries a
  // couple of words over budget. Dropping the offending entry keeps a correct message — truncating
  // it would mutilate the sentence, and failing would leave the user with nothing.
  const { kept, dropped } = splitByWordBudget(draft.body, maxBodyWords)
  const trimmed: CommitDraft = { ...draft, body: kept }

  const message = renderCommit(trimmed)
  const validation = validateCommitMessage(message, { maxBodyWords })
  if (!validation.ok) {
    throw new PipelineError(
      'The model could not produce a message in the required format.',
      second.text,
      validation.problems,
    )
  }

  return {
    message,
    draft: trimmed,
    retried: true,
    droppedBodyEntries: dropped,
    degradedToText: second.degradedToText,
    problems: [],
    ...(second.finishReason ? { finishReason: second.finishReason } : {}),
  }
}
