/**
 * Cleaning a raw model reply.
 *
 * On the Ollama path this is mostly redundant: `think: false` suppresses the reasoning trace at
 * the source. It exists for everything else — OpenAI-compatible endpoints that inline the tags,
 * models whose trace cannot be fully disabled, and small models that reason **without any tag at
 * all**.
 *
 * One rule governs every heuristic here: **when in doubt, keep the line.** A stray line of noise
 * is something the user sees and deletes; a deleted body line is content they never learn was
 * there.
 */

/** Opened but never closed — the signature of a truncated stream. */
export function hasUnclosedThinkingTag(text: string): boolean {
  const opens = (text.match(/<think(?:ing)?\b[^>]*>/gi) ?? []).length
  const closes = (text.match(/<\/think(?:ing)?>/gi) ?? []).length
  return opens > closes
}

/** Reasoning openers, in English and Portuguese, that small models emit without any tag. */
const REASONING_LINE =
  /^\s*(?:the user\b|they are\b|the question\b|i can\b|i need\b|i should\b|i will\b|i'?m going\b|let me\b|thinking\s*:|looking at\b|based on\b|first,?\s|okay[,.]?\s|alright[,.]?\s|hmm[,.]?\s|so,?\s+(?:the|i|let|this)|o usuário\b|preciso\b|vou\b|deixa eu\b|analisando\b|olhando\b|primeiro,?\s|então,?\s+(?:o|a|eu|vou))/i

/** A line that is plainly the commit title. Its presence means the reply reached the answer. */
const COMMIT_LINE = /^[\p{Extended_Pictographic}‍️\s]*(?:\w+)(?:\([^)]+\))?:\s+\S/u

export interface SanitizeResult {
  readonly text: string
  /** What was removed, for the log. */
  readonly removed: readonly string[]
  /** The reply was unusable and nothing should be salvaged from it. */
  readonly rejected: boolean
}

export function sanitizeModelOutput(raw: string): SanitizeResult {
  const removed: string[] = []
  let text = raw.replace(/\r\n/g, '\n').trim()

  if (!text) {
    return { text: '', removed, rejected: true }
  }

  // A truncated stream cannot be salvaged: whatever follows the opening tag is reasoning, and the
  // answer never arrived.
  if (hasUnclosedThinkingTag(text)) {
    return { text: '', removed: ['unclosed thinking tag'], rejected: true }
  }

  const withoutThinking = text.replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
  if (withoutThinking !== text) {
    removed.push('thinking block')
    text = withoutThinking.trim()
  }

  // Fences: keep the contents, drop the markers. A fenced JSON reply is still a JSON reply.
  const fenced = /^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/.exec(text)
  if (fenced) {
    removed.push('code fence')
    text = fenced[1].trim()
  }

  const withoutPreamble = text.replace(
    /^(?:here(?:'s| is) (?:your |the )?(?:commit )?message\s*:?|commit message\s*:|message\s*:|mensagem de commit\s*:|resposta\s*:)\s*/i,
    '',
  )
  if (withoutPreamble !== text) {
    removed.push('preamble')
    text = withoutPreamble.trim()
  }

  // Surrounding quotes, but only when they wrap the whole reply.
  const quoted = /^(['"])([\s\S]*)\1$/.exec(text)
  if (quoted && !quoted[2].includes(quoted[1])) {
    removed.push('wrapping quotes')
    text = quoted[2].trim()
  }

  const lines = text.split('\n')
  const commitIndex = lines.findIndex(line => COMMIT_LINE.test(line))

  // Reasoning prose before the answer: only ever dropped when the answer itself is present, so a
  // false positive cannot eat the whole reply.
  if (commitIndex > 0 && lines.slice(0, commitIndex).every(l => !l.trim() || REASONING_LINE.test(l))) {
    removed.push(`${commitIndex} reasoning line(s)`)
    text = lines.slice(commitIndex).join('\n').trim()
  }

  if (!text) {
    return { text: '', removed, rejected: true }
  }

  return { text, removed, rejected: false }
}

/** Convenience wrapper for the pipeline's `sanitize` hook. */
export function sanitize(raw: string): string {
  return sanitizeModelOutput(raw).text
}
