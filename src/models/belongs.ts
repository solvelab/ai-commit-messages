/**
 * Whether the configured model plausibly belongs to the configured backend.
 *
 * The settings page lets `provider: openai` and `model: qwen2.5-coder:7b` coexist happily, and
 * nothing says a word until generation fails with whatever the server chose to answer. Switching
 * backend is exactly when the leftover model stops existing.
 *
 * The answer is deliberately three-valued. Claiming a model is wrong requires knowing what right
 * looks like: with no cached list and no built-in catalogue for that backend, there is no basis for
 * an opinion, and inventing one would nag people running a private model on a private server.
 */

export type Belonging = 'yes' | 'no' | 'unknown'

export interface BelongsInput {
  readonly model: string
  /** Models last read from that backend's server, when there are any. */
  readonly cached?: readonly string[]
  /** Models the catalogue knows for that backend. */
  readonly builtin?: readonly string[]
}

export function modelBelongs(input: BelongsInput): Belonging {
  const model = input.model.trim().toLowerCase()
  if (!model) {
    return 'unknown'
  }

  const known = [...(input.cached ?? []), ...(input.builtin ?? [])].map(id => id.trim().toLowerCase())
  if (known.length === 0) {
    return 'unknown'
  }

  return known.includes(model) ? 'yes' : 'no'
}
