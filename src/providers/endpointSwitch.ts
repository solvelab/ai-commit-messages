import { findBackend } from './catalog.js'

/**
 * What the endpoint should become when the backend changes.
 *
 * Choosing OpenAI and keeping an address of a local Ollama is not a configuration anyone meant to
 * have — it reads as if the extension ignored the choice. The address of a backend is the one part
 * of this with a right answer, so it is the one part worth changing without asking.
 *
 * The model is deliberately not treated this way: there is no single correct model for a backend,
 * and picking one would be guessing what someone wants to use.
 */

export interface SwitchInput {
  readonly fromBackendId?: string
  readonly toBackendId: string
  readonly currentEndpoint: string
}

export interface SwitchDecision {
  /** The endpoint to write, or `undefined` when nothing should change. */
  readonly endpoint?: string
  readonly reason: 'same-backend' | 'already-correct' | 'switched'
}

export function endpointForSwitch(input: SwitchInput): SwitchDecision {
  if (input.fromBackendId === input.toBackendId) {
    return { reason: 'same-backend' }
  }

  const target = findBackend(input.toBackendId)
  // "Other OpenAI-compatible endpoint" has no address of its own; the one on screen is all there is.
  if (!target?.defaultEndpoint) {
    return { reason: 'same-backend' }
  }

  if (same(input.currentEndpoint, target.defaultEndpoint)) {
    return { reason: 'already-correct' }
  }

  return { endpoint: target.defaultEndpoint, reason: 'switched' }
}

function same(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, '').toLowerCase() === b.trim().replace(/\/+$/, '').toLowerCase()
}
