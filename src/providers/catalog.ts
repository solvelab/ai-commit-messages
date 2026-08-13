/**
 * The backends, by the names people actually use.
 *
 * There used to be two lists: `provider` (`ollama` | `openai-compat`) and `compatPreset` (the nine
 * flavours). Choosing Groq meant first knowing that Groq lives inside "OpenAI-compatible" — the
 * name of the **adapter**, an implementation detail that had leaked into the interface.
 *
 * Worse, the second list stayed visible even with Ollama selected, where it does nothing. VS Code
 * has no conditional visibility for settings (`IConfigurationPropertySchema` has no `when`), so the
 * only way out is to not have two lists.
 *
 * One choice now, and the adapter is derived from it.
 */

export type AdapterId = 'ollama' | 'openai-compat'

export interface Backend {
  /** Value stored in `aiCommitMessages.provider`. */
  readonly id: string
  readonly label: string
  readonly adapter: AdapterId
  /** Flavour handed to the OpenAI-compatible adapter. */
  readonly presetId?: string
  readonly defaultEndpoint: string
  /** Whether talking to it at all needs a credential. */
  readonly requiresToken: boolean
  readonly description: string
}

export const BACKENDS: readonly Backend[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    adapter: 'ollama',
    defaultEndpoint: 'http://127.0.0.1:11434',
    requiresToken: false,
    description: "Ollama's native API. Supports num_ctx, structured output and think:false.",
  },
  {
    id: 'openai',
    label: 'OpenAI',
    adapter: 'openai-compat',
    presetId: 'openai',
    defaultEndpoint: 'https://api.openai.com/v1',
    requiresToken: true,
    description: 'OpenAI platform. Needs an API key.',
  },
  {
    id: 'groq',
    label: 'Groq',
    adapter: 'openai-compat',
    presetId: 'groq',
    defaultEndpoint: 'https://api.groq.com/openai/v1',
    requiresToken: true,
    description: 'Groq. Needs an API key.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    adapter: 'openai-compat',
    presetId: 'openrouter',
    defaultEndpoint: 'https://openrouter.ai/api/v1',
    requiresToken: true,
    description: 'OpenRouter. Needs an API key.',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    adapter: 'openai-compat',
    presetId: 'lmstudio',
    defaultEndpoint: 'http://localhost:1234/v1',
    requiresToken: false,
    description: 'LM Studio running locally.',
  },
  {
    id: 'vllm',
    label: 'vLLM',
    adapter: 'openai-compat',
    presetId: 'vllm',
    defaultEndpoint: 'http://localhost:8000/v1',
    requiresToken: false,
    description: 'vLLM server.',
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp',
    adapter: 'openai-compat',
    presetId: 'llamacpp',
    defaultEndpoint: 'http://localhost:8080/v1',
    requiresToken: false,
    description: 'llama.cpp server.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    adapter: 'openai-compat',
    presetId: 'gemini',
    defaultEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    requiresToken: true,
    description: "Gemini through Google's OpenAI-compatible shim. Needs an API key.",
  },
  {
    id: 'ollama-openai',
    label: 'Ollama (OpenAI shim)',
    adapter: 'openai-compat',
    presetId: 'ollama-v1',
    defaultEndpoint: 'http://127.0.0.1:11434/v1',
    requiresToken: false,
    description: 'Prefer plain Ollama — the shim cannot set num_ctx.',
  },
  {
    id: 'custom',
    label: 'Other OpenAI-compatible endpoint',
    adapter: 'openai-compat',
    presetId: 'custom',
    defaultEndpoint: '',
    requiresToken: false,
    description: 'Any other server speaking /v1/chat/completions.',
  },
]

export const DEFAULT_BACKEND_ID = 'ollama'

export function findBackend(id: string): Backend | undefined {
  return BACKENDS.find(b => b.id === id)
}

/**
 * Resolves the stored configuration into a backend, tolerating the shape that shipped before.
 *
 * Compatibility is done by **reading**, not by rewriting the user's settings: someone with
 * `provider: 'openai-compat'` and `compatPreset: 'groq'` keeps working untouched, and their disk is
 * only changed if they reconfigure.
 */
export function resolveBackend(provider: string, legacyPreset?: string): Backend {
  const direct = findBackend(provider)
  if (direct) {
    return direct
  }

  if (provider === 'openai-compat') {
    const byPreset = BACKENDS.find(b => b.presetId === (legacyPreset || 'custom'))
    if (byPreset) {
      return byPreset
    }
  }

  return findBackend(DEFAULT_BACKEND_ID)!
}
