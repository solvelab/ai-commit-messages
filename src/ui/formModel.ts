import { findBackend, type Backend } from '../providers/catalog.js'

/**
 * Which fields the configuration form shows for a given backend.
 *
 * The settings page cannot do this: `IConfigurationPropertySchema` has `scope`, `order`, `tags`,
 * `included` and `restricted`, and no `when`. A field that does not apply — the endpoint of a hosted
 * provider, the API key of a local Ollama — stays on screen and is the part that confuses most.
 *
 * Pure on purpose: the rule is a value, so it can be tested without an editor and shown by a panel.
 */

export interface FormFields {
  readonly backendId: string
  readonly backendLabel: string
  /** The server's address is the user's to choose. */
  readonly showEndpoint: boolean
  /** The backend cannot answer without a credential. */
  readonly requiresKey: boolean
  /**
   * A credential is possible even where it is not required: a gateway in front of a local Ollama
   * asks for one, and hiding the field would leave that person stuck.
   */
  readonly allowsKey: boolean
  /** Address filled in when the backend is chosen, before anything is saved. */
  readonly suggestedEndpoint: string
  readonly note: string
}

/** Backends whose endpoint is a fixed address of the vendor, not something anyone types. */
const HOSTED = new Set(['openai', 'groq', 'openrouter', 'gemini'])

export function formFields(backendId: string): FormFields {
  const backend: Backend = findBackend(backendId) ?? findBackend('ollama')!
  const hosted = HOSTED.has(backend.id)

  return {
    backendId: backend.id,
    backendLabel: backend.label,
    showEndpoint: !hosted,
    requiresKey: backend.requiresToken,
    // Everywhere: hosted backends require it, and a self-hosted one may sit behind a gateway.
    allowsKey: true,
    suggestedEndpoint: backend.defaultEndpoint,
    note: hosted
      ? `${backend.label} answers at a fixed address, so there is nothing to point anywhere.`
      : 'Point this at your server. A path such as /api/generate is trimmed.',
  }
}

export interface ReadPlan {
  /** Whether the request should be made at all. */
  readonly ask: boolean
  /** What to say when it should not. */
  readonly reason?: string
}

/**
 * Whether the model list can be read yet.
 *
 * Asking a backend that requires a credential without one earns a 401, which the panel then reported
 * as "the key was rejected" — about a key that had never been sent. The missing key is knowable
 * before the request, so the request is not made and the message says what is actually missing.
 */
export function modelReadPlan(input: {
  readonly backendId: string
  readonly hasKey: boolean
}): ReadPlan {
  const fields = formFields(input.backendId)
  if (fields.requiresKey && !input.hasKey) {
    return {
      ask: false,
      reason: `${fields.backendLabel} needs an API key — save one above to read its model list`,
    }
  }
  return { ask: true }
}
