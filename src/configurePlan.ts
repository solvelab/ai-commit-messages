import { findBackend } from './providers/catalog.js'
import { normalizeBaseUrl, type ProviderId } from './settings.js'

/**
 * What the guided setup writes, and where.
 *
 * Split out from the command so the decisions are testable without an editor — the part that goes
 * wrong here is silent (a value written to the wrong target simply never applies).
 */

/** Mirrors `vscode.ConfigurationTarget` without importing it. */
export type WriteTarget = 'global' | 'workspace'

export interface ConfigureAnswers {
  /** Backend id from the catalog, e.g. `groq`. */
  readonly provider?: string
  readonly endpoint?: string
  readonly model?: string
}

export interface ConfigureWrite {
  readonly key: 'provider' | 'endpoint' | 'model'
  readonly value: string
  readonly target: WriteTarget
}

export class ConfigureError extends Error {}

/**
 * `endpoint` is machine-scoped, so it can only live in user (or remote-user) settings — writing it
 * to the workspace is refused by the editor. Under a remote session VS Code resolves the global
 * target to the remote settings file, which is exactly where a per-machine endpoint belongs.
 */
export function planConfiguration(answers: ConfigureAnswers): ConfigureWrite[] {
  const writes: ConfigureWrite[] = []

  if (answers.provider) {
    if (!findBackend(answers.provider)) {
      throw new ConfigureError(`Unknown backend "${answers.provider}".`)
    }
    writes.push({ key: 'provider', value: answers.provider, target: 'global' })
  }

  if (answers.endpoint !== undefined) {
    // Same rule the runtime will use, so the preview and the stored value agree.
    const adapter: ProviderId = findBackend(answers.provider ?? '')?.adapter ?? 'ollama'
    const base = normalizeBaseUrl(answers.endpoint, adapter)
    if (!base) {
      throw new ConfigureError(`"${answers.endpoint}" is not a valid URL.`)
    }
    writes.push({ key: 'endpoint', value: base, target: 'global' })
  }

  if (answers.model !== undefined) {
    const model = answers.model.trim()
    if (!model) {
      throw new ConfigureError('The model name cannot be empty.')
    }
    writes.push({ key: 'model', value: model, target: 'global' })
  }

  return writes
}

/** Validation for the endpoint input box, as the user types. */
export function validateEndpointInput(
  value: string,
  provider: ProviderId = 'ollama',
): string | undefined {
  if (!value.trim()) {
    return 'Type the base URL of the model server, e.g. http://192.168.15.6:11434'
  }
  if (!normalizeBaseUrl(value, provider)) {
    return 'That is not a valid URL.'
  }
  if (/\/(api|v1)\b/i.test(value)) {
    return undefined // normalization trims it; not an error, just noise
  }
  return undefined
}

/**
 * Everything the wizard must hand to `createProvider`.
 *
 * Extracted so the omission that caused the bug is testable: the wizard used to build the provider
 * without `auth` and `headers`, so a gateway expecting `x-api-key` received `Authorization: Bearer`
 * and refused — and the 401 was swallowed into a log line.
 */
export interface WizardProviderContext {
  readonly endpoint: string
  readonly presetId?: string
  readonly token?: string
  readonly headers: Record<string, string>
  readonly auth: { header: string; scheme: string }
}

export function wizardProviderContext(input: {
  endpoint: string
  presetId?: string
  token?: string
  authHeader: string
  authScheme: string
  headers: Record<string, string>
}): WizardProviderContext {
  return {
    endpoint: input.endpoint,
    ...(input.presetId ? { presetId: input.presetId } : {}),
    ...(input.token ? { token: input.token } : {}),
    headers: input.headers,
    auth: { header: input.authHeader, scheme: input.authScheme },
  }
}
