/**
 * Per-provider quirks of the "OpenAI-compatible" world.
 *
 * The contract is uniform — `POST /v1/chat/completions`, text at `choices[0].message.content`,
 * models at `GET /v1/models` — but "compatible" is a claim, not a guarantee. Each entry below
 * encodes a difference verified in that provider's own documentation, so the user never has to
 * know about it.
 */

export interface CompatPreset {
  readonly id: string
  readonly label: string
  /** Base URL including `/v1`. Empty means the user supplies it. */
  readonly baseUrl: string
  /**
   * Field carrying the output cap. OpenAI deprecated `max_tokens` in favour of
   * `max_completion_tokens`; most self-hosted servers still only understand the old one.
   */
  readonly maxTokensField: 'max_tokens' | 'max_completion_tokens'
  /**
   * Send only the fields every implementation accepts. Groq answers **400** for
   * `logprobs`, `logit_bias`, `top_logprobs` and `messages[].name`, and requires `n` to be 1.
   */
  readonly strict: boolean
  /** Whether the provider honours `response_format` with a JSON schema. */
  readonly structuredOutput: boolean
  /** Extra headers the provider asks for. */
  readonly headers?: Record<string, string>
  /** Whether a credential is required to talk to it at all. */
  readonly requiresToken: boolean
  readonly note?: string
}

export const COMPAT_PRESETS: readonly CompatPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    maxTokensField: 'max_completion_tokens',
    strict: false,
    structuredOutput: true,
    requiresToken: true,
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    maxTokensField: 'max_tokens',
    // Groq rejects fields OpenAI accepts; strict mode simply never sends them.
    strict: true,
    structuredOutput: true,
    requiresToken: true,
    note: 'Rejects logprobs, logit_bias and messages[].name; n must be 1.',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    maxTokensField: 'max_tokens',
    strict: false,
    structuredOutput: true,
    requiresToken: true,
    // Attribution headers OpenRouter documents for apps calling it.
    headers: {
      'HTTP-Referer': 'https://github.com/solvelab/ai-commit-messages',
      'X-Title': 'AI Commit Messages',
    },
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    maxTokensField: 'max_tokens',
    strict: true,
    // No published field-support list, so nothing is assumed.
    structuredOutput: false,
    requiresToken: false,
  },
  {
    id: 'vllm',
    label: 'vLLM (local)',
    baseUrl: 'http://localhost:8000/v1',
    maxTokensField: 'max_tokens',
    strict: false,
    structuredOutput: true,
    requiresToken: false,
  },
  {
    id: 'llamacpp',
    label: 'llama.cpp server (local)',
    baseUrl: 'http://localhost:8080/v1',
    maxTokensField: 'max_tokens',
    strict: true,
    structuredOutput: true,
    requiresToken: false,
    note: 'Upstream describes its compatibility as approximate.',
  },
  {
    id: 'ollama-v1',
    label: 'Ollama via its OpenAI shim',
    baseUrl: 'http://localhost:11434/v1',
    maxTokensField: 'max_tokens',
    strict: true,
    structuredOutput: true,
    requiresToken: false,
    // Prefer the native provider: the shim exposes no `options`, so `num_ctx` cannot be set.
    note: 'Prefer the native Ollama provider — the shim cannot set num_ctx.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini (OpenAI shim)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    maxTokensField: 'max_tokens',
    strict: true,
    structuredOutput: false,
    requiresToken: true,
    note: 'Google documents this shim as beta.',
  },
  {
    id: 'custom',
    label: 'Custom endpoint',
    baseUrl: '',
    maxTokensField: 'max_tokens',
    // Unknown server: assume the smallest common surface.
    strict: true,
    structuredOutput: false,
    requiresToken: false,
  },
]

export function findPreset(id: string): CompatPreset | undefined {
  return COMPAT_PRESETS.find(preset => preset.id === id)
}

export const DEFAULT_PRESET_ID = 'custom'
