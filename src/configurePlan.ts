import { normalizeBaseUrl, PROVIDERS, type ProviderId } from './settings.js'

/**
 * What the guided setup writes, and where.
 *
 * Split out from the command so the decisions are testable without an editor — the part that goes
 * wrong here is silent (a value written to the wrong target simply never applies).
 */

/** Mirrors `vscode.ConfigurationTarget` without importing it. */
export type WriteTarget = 'global' | 'workspace'

export interface ConfigureAnswers {
  readonly provider?: ProviderId
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
    if (!(PROVIDERS as readonly string[]).includes(answers.provider)) {
      throw new ConfigureError(`Unknown provider "${answers.provider}".`)
    }
    writes.push({ key: 'provider', value: answers.provider, target: 'global' })
  }

  if (answers.endpoint !== undefined) {
    const base = normalizeBaseUrl(answers.endpoint)
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
export function validateEndpointInput(value: string): string | undefined {
  if (!value.trim()) {
    return 'Type the base URL of the model server, e.g. http://192.168.15.6:11434'
  }
  if (!normalizeBaseUrl(value)) {
    return 'That is not a valid URL.'
  }
  if (/\/(api|v1)\b/i.test(value)) {
    return undefined // normalization trims it; not an error, just noise
  }
  return undefined
}
