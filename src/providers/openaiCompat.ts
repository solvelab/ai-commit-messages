import { buildHeaders, type AuthConfig } from './auth.js'
import { DEFAULT_PRESET_ID, findPreset, type CompatPreset } from './presets.js'
import {
  ProviderError,
  type CommitProvider,
  type FetchLike,
  type GenerateRequest,
  type GenerateResult,
  type ModelCapabilities,
  type ModelInfo,
} from './types.js'

/**
 * Any endpoint that speaks the OpenAI chat contract.
 *
 * One adapter covers OpenAI, Groq, OpenRouter, LM Studio, vLLM, llama.cpp and Gemini's shim,
 * because the request and the reply are the same shape everywhere. What differs is encoded in the
 * presets: the name of the output-cap field, which optional fields blow up, and which headers the
 * provider wants.
 *
 * It does **not** replace the native Ollama adapter: this contract has no `options` object, so
 * `num_ctx` cannot be set — and a diff-sized prompt is exactly the case that needs it.
 */

export interface OpenAICompatOptions {
  readonly endpoint: string
  readonly fetch: FetchLike
  readonly presetId?: string
  readonly token?: string
  readonly auth?: AuthConfig
  readonly headers?: Record<string, string>
}

interface ChatResponse {
  choices?: { message?: { content?: string; reasoning?: string }; finish_reason?: string }[]
  error?: { message?: string; code?: string } | string
}

/** Ensures the base URL ends at `/v1`, whatever the user pasted. */
export function normalizeCompatBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) {
    throw new ProviderError('network', 'No endpoint configured.')
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  // Drop a pasted operation path; keep everything up to and including /v1.
  return withScheme.replace(/\/(chat\/completions|completions|models|embeddings)$/i, '')
}

export class OpenAICompatProvider implements CommitProvider {
  readonly id = 'openai-compat'
  readonly preset: CompatPreset
  private readonly baseUrl: string
  private readonly fetch: FetchLike
  private readonly headers: Record<string, string>
  readonly authenticated: boolean

  constructor(options: OpenAICompatOptions) {
    this.preset = findPreset(options.presetId ?? DEFAULT_PRESET_ID) ?? findPreset(DEFAULT_PRESET_ID)!
    this.baseUrl = normalizeCompatBaseUrl(options.endpoint || this.preset.baseUrl)
    this.fetch = options.fetch

    const built = buildHeaders({
      extra: { ...this.preset.headers, ...options.headers },
      ...(options.token ? { token: options.token } : {}),
      ...(options.auth ? { auth: options.auth } : {}),
    })
    this.headers = built.headers
    this.authenticated = built.authenticated
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    // Pasting the server root instead of its /v1 base is the mistake this adapter sees most —
    // but only the user can make it. A preset filled the base in itself, and `gemini` legitimately
    // ends in `/v1beta/openai/`, so accusing it would be accusing our own data.
    const looksLikeWrongBase =
      this.preset.id === 'custom' && !/\/v1(beta)?(\/[^/]*)?\/?$/i.test(this.baseUrl)
    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this.headers,
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
        signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('aborted', 'Request cancelled.', error)
      }
      throw new ProviderError('network', `Could not reach ${this.baseUrl}.`, error)
    }

    const raw = await response.text()

    if (!response.ok) {
      const detail = errorMessage(raw) ?? `${response.status} ${response.statusText}`
      if (response.status === 401 || response.status === 403) {
        throw new ProviderError(
          'unauthorized',
          `${this.preset.label} rejected the credential (HTTP ${response.status}).`,
        )
      }
      if (response.status === 404) {
        // A 404 on /models is about the endpoint, not the model — but the "/v1" hint is only true
        // for a URL the user typed. A preset filled its own base in, and `gemini` legitimately
        // ends in `/v1beta/openai/`.
        if (looksLikeWrongBase) {
          throw new ProviderError(
            'http',
            `${this.baseUrl} does not answer the OpenAI API. The base URL usually ends in /v1.`,
          )
        }
        if (path === '/models') {
          throw new ProviderError(
            'http',
            `${this.baseUrl} did not answer /models (HTTP 404). Check that the server is running and the preset matches it.`,
          )
        }
        throw new ProviderError('model-not-found', detail)
      }
      if (response.status === 429) {
        throw new ProviderError('rate-limited', `${this.preset.label} is rate limiting: ${detail}`)
      }
      // A 400 naming a field is the classic "compatible" endpoint refusing an optional parameter.
      if (response.status === 400 && /unsupported|unrecognized|not supported|invalid.*(field|parameter)/i.test(detail)) {
        throw new ProviderError('unsupported-parameter', detail)
      }
      throw new ProviderError('http', detail)
    }

    try {
      return JSON.parse(raw) as T
    } catch (error) {
      throw new ProviderError(
        'malformed-response',
        `${this.baseUrl} did not answer with JSON. Is it an OpenAI-compatible endpoint?`,
        error,
      )
    }
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const body = await this.request<{ data?: { id?: string; owned_by?: string }[] }>(
      'GET',
      '/models',
      undefined,
      signal,
    )
    const models: ModelInfo[] = []
    for (const entry of body.data ?? []) {
      if (entry.id) {
        models.push({
          id: entry.id,
          label: entry.id,
          ...(entry.owned_by ? { detail: entry.owned_by } : {}),
        })
      }
    }
    return models
  }

  /**
   * This contract exposes no context window and no capability list, so nothing is claimed. The
   * budget falls back to the configured character cap, and the reasoning trace is handled by the
   * sanitizer rather than suppressed at the source.
   */
  async describeModel(): Promise<ModelCapabilities> {
    return { thinking: false, raw: [] }
  }

  async generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    const wantsSchema = Boolean(request.schema) && this.preset.structuredOutput
    try {
      return await this.chat(request, signal, wantsSchema)
    } catch (error) {
      if (
        error instanceof ProviderError &&
        (error.code === 'structured-output-unsupported' || error.code === 'unsupported-parameter') &&
        wantsSchema
      ) {
        const result = await this.chat(request, signal, false)
        return { ...result, degradedToText: true }
      }
      throw error
    }
  }

  private async chat(
    request: GenerateRequest,
    signal: AbortSignal | undefined,
    withSchema: boolean,
  ): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: false,
      temperature: request.temperature,
      [this.preset.maxTokensField]: request.maxTokens,
    }

    if (withSchema && request.schema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: { name: 'commit_message', strict: false, schema: request.schema },
      }
    }

    if (!this.preset.strict) {
      // Only sent where it is known to be accepted; Groq answers 400 for several of these.
      body.n = 1
    }

    const response = await this.request<ChatResponse>('POST', '/chat/completions', body, signal)

    if (response.error) {
      const message = typeof response.error === 'string' ? response.error : (response.error.message ?? 'unknown error')
      throw new ProviderError('http', message)
    }

    const choice = response.choices?.[0]
    const text = choice?.message?.content
    if (typeof text !== 'string') {
      throw new ProviderError(
        'malformed-response',
        'The reply had no choices[0].message.content.',
      )
    }

    return {
      text,
      // Some gateways surface the reasoning trace in a sibling field rather than inline.
      ...(choice?.message?.reasoning ? { thinking: choice.message.reasoning } : {}),
      // Carried out so the pipeline can tell a truncated reply from a malformed one.
      ...(choice?.finish_reason ? { finishReason: choice.finish_reason } : {}),
      degradedToText: false,
    }
  }
}

function errorMessage(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string }
    if (typeof parsed.error === 'string') {
      return parsed.error
    }
    return parsed.error?.message
  } catch {
    return raw.trim() ? raw.trim().slice(0, 300) : undefined
  }
}
