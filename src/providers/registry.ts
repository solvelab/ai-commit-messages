import { OllamaProvider } from './ollama.js'
import { ProviderError, type CommitProvider, type FetchLike } from './types.js'
import { PROVIDERS, type ProviderId } from '../settings.js'

/**
 * Choosing the backend.
 *
 * This exists because the first version did not: `createProvider` built an `OllamaProvider`
 * unconditionally and never read `settings.provider`. Picking `openai-compat` kept talking to
 * Ollama's `/api/chat` — a silent wrong answer, which is the worst kind.
 *
 * The rule here: an option that is offered must either work or fail out loud. Never fall back to a
 * different backend than the one asked for.
 */

export interface ProviderContext {
  readonly endpoint: string
  readonly fetch: FetchLike
  readonly headers?: Record<string, string>
}

/** Backends that are actually implemented. Anything else in the enum is not yet available. */
export const IMPLEMENTED_PROVIDERS: readonly ProviderId[] = ['ollama']

export function isImplemented(id: ProviderId): boolean {
  return IMPLEMENTED_PROVIDERS.includes(id)
}

export function createProvider(id: ProviderId, context: ProviderContext): CommitProvider {
  switch (id) {
    case 'ollama':
      return new OllamaProvider({
        endpoint: context.endpoint,
        fetch: context.fetch,
        ...(context.headers ? { headers: context.headers } : {}),
      })
    case 'openai-compat':
      throw new ProviderError(
        'http',
        'The OpenAI-compatible backend is not available yet. Switch the provider back to Ollama, or follow issue #31.',
      )
    default:
      // Exhaustiveness: adding a value to the enum without handling it here fails to compile.
      return assertNever(id)
  }
}

function assertNever(value: never): never {
  throw new ProviderError('http', `Unknown provider "${String(value)}".`)
}

/** Guards against the manifest enum and the code drifting apart. */
export function knownProviders(): readonly ProviderId[] {
  return PROVIDERS
}
