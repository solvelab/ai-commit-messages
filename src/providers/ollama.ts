import { buildHeaders, type AuthConfig } from './auth.js'
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
 * Ollama's native API.
 *
 * Kept separate from the OpenAI-compatible adapter for one concrete reason: Ollama's `/v1` shim
 * exposes no `options` object, so `num_ctx` cannot be set there — and a diff-sized prompt is
 * exactly the case that needs it.
 *
 * Three behaviours are load-bearing, all from the official API docs:
 *
 * - **`stream: false` is mandatory.** Both `/api/generate` and `/api/chat` stream by default, and
 *   the body is newline-delimited JSON; `JSON.parse` on a default call fails.
 * - **`think: false` suppresses the reasoning trace at the source**, which is why reasoning models
 *   do not need their `<think>` blocks scrubbed afterwards on this path.
 * - **`format` accepts a JSON Schema**, which is how the reply shape is enforced rather than
 *   requested.
 */

/** Strings Ollama returns when the model cannot honour a schema. Matched case-insensitively. */
const STRUCTURED_OUTPUT_REFUSALS = [
  'does not support structured outputs',
  'failed to parse structured output as json',
  'structured output generation failed',
]

/** Normalizes whatever the user pasted into the base URL the adapter needs. */
export function normalizeEndpoint(raw: string): string {
  let value = raw.trim()
  if (!value) {
    throw new ProviderError('network', 'No Ollama endpoint configured.')
  }
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`
  }
  // The extension this replaces stored a full endpoint; every modern client stores a base URL.
  value = value.replace(/\/+(api\/(generate|chat|tags|show)|v1(\/.*)?)\/*$/i, '')
  return value.replace(/\/+$/, '')
}

/** Ollama reports the window under `<architecture>.context_length`, so the prefix cannot be fixed. */
export function readContextLength(modelInfo: Record<string, unknown> | undefined): number | undefined {
  if (!modelInfo) {
    return undefined
  }
  for (const [key, value] of Object.entries(modelInfo)) {
    if (key.endsWith('.context_length') && typeof value === 'number' && value > 0) {
      return value
    }
  }
  return undefined
}

export function isStructuredOutputRefusal(message: string): boolean {
  const lower = message.toLowerCase()
  return STRUCTURED_OUTPUT_REFUSALS.some(needle => lower.includes(needle))
}

interface OllamaChatResponse {
  message?: { content?: string; thinking?: string }
  error?: string
}

export interface OllamaProviderOptions {
  readonly endpoint: string
  readonly fetch: FetchLike
  /** Extra non-sensitive headers. */
  readonly headers?: Record<string, string>
  /** Optional credential, for an Ollama behind a gateway or for Ollama Cloud. */
  readonly token?: string
  readonly auth?: AuthConfig
}

export class OllamaProvider implements CommitProvider {
  readonly id = 'ollama'
  private readonly endpoint: string
  private readonly fetch: FetchLike
  private readonly headers: Record<string, string>
  /** Whether a credential is attached. Logged instead of the credential itself. */
  readonly authenticated: boolean

  constructor(options: OllamaProviderOptions) {
    this.endpoint = normalizeEndpoint(options.endpoint)
    this.fetch = options.fetch
    const built = buildHeaders({
      ...(options.headers ? { extra: options.headers } : {}),
      ...(options.token ? { token: options.token } : {}),
      ...(options.auth ? { auth: options.auth } : {}),
    })
    this.headers = built.headers
    this.authenticated = built.authenticated
  }

  /**
   * `/api/tags` is a GET endpoint; `/api/show` and `/api/chat` are POST. Sending POST to the
   * former answers `405 method not allowed`.
   */
  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Awaited<ReturnType<FetchLike>>
    try {
      response = await this.fetch(`${this.endpoint}${path}`, {
        method,
        headers: this.headers,
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
        signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProviderError('aborted', 'Request cancelled.', error)
      }
      // undici reports every connection failure as `TypeError: fetch failed`; the reason the user
      // needs (ECONNREFUSED, EHOSTUNREACH…) lives on `cause`.
      throw new ProviderError('network', describeNetworkError(error, this.endpoint), error)
    }

    const raw = await response.text()

    if (!response.ok) {
      const detail = extractError(raw) ?? `${response.status} ${response.statusText}`
      if (response.status === 404) {
        throw new ProviderError('model-not-found', detail)
      }
      if (response.status === 401 || response.status === 403) {
        // Almost always a gateway in front of Ollama, since Ollama itself has no auth.
        throw new ProviderError(
          'unauthorized',
          `${this.endpoint} rejected the credential (HTTP ${response.status}).`,
        )
      }
      if (isStructuredOutputRefusal(detail)) {
        throw new ProviderError('structured-output-unsupported', detail)
      }
      throw new ProviderError('http', detail)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      // Almost always means `stream` was left at its default and the body is NDJSON.
      throw new ProviderError(
        'malformed-response',
        'Ollama returned a body that is not a single JSON object. Was `stream: false` sent?',
        error,
      )
    }
    return parsed as T
  }

  async listModels(signal?: AbortSignal): Promise<ModelInfo[]> {
    const body = await this.request<{
      models?: { model?: string; name?: string; details?: Record<string, string> }[]
    }>('GET', '/api/tags', undefined, signal)
    const models: ModelInfo[] = []
    for (const entry of body.models ?? []) {
      const id = entry.model ?? entry.name
      if (!id) {
        continue
      }
      const size = entry.details?.parameter_size
      models.push({
        id,
        label: id,
        ...(size ? { detail: `${size} · ${entry.details?.family ?? ''}`.trim() } : {}),
      })
    }
    return models
  }

  async describeModel(model: string, signal?: AbortSignal): Promise<ModelCapabilities> {
    const body = await this.request<{
      model_info?: Record<string, unknown>
      capabilities?: string[]
    }>('POST', '/api/show', { model }, signal)

    const capabilities = body.capabilities ?? []
    return {
      contextLength: readContextLength(body.model_info),
      // Reported by the server, so no hardcoded list of reasoning model names to keep current.
      thinking: capabilities.includes('thinking'),
      raw: capabilities,
    }
  }

  async generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult> {
    try {
      return await this.chat(request, signal, request.schema)
    } catch (error) {
      if (error instanceof ProviderError && error.code === 'structured-output-unsupported') {
        // Degrade instead of failing: the sanitizer handles a plain-text reply.
        const result = await this.chat(request, signal, undefined)
        return { ...result, degradedToText: true }
      }
      throw error
    }
  }

  private async chat(
    request: GenerateRequest,
    signal: AbortSignal | undefined,
    schema: object | undefined,
  ): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      stream: false,
      options: {
        temperature: request.temperature,
        num_predict: request.maxTokens,
        ...(request.contextTokens ? { num_ctx: request.contextTokens } : {}),
      },
    }
    if (schema) {
      body.format = schema
    }
    if (request.suppressThinking) {
      body.think = false
    }

    const response = await this.request<OllamaChatResponse>('POST', '/api/chat', body, signal)

    if (response.error) {
      if (isStructuredOutputRefusal(response.error)) {
        throw new ProviderError('structured-output-unsupported', response.error)
      }
      throw new ProviderError('http', response.error)
    }

    const text = response.message?.content
    if (typeof text !== 'string') {
      throw new ProviderError(
        'malformed-response',
        'Ollama reply had no message.content — the chat endpoint returns text there, not in `response`.',
      )
    }

    return { text, thinking: response.message?.thinking, degradedToText: false }
  }
}

function extractError(raw: string): string | undefined {
  try {
    const parsed = JSON.parse(raw) as { error?: unknown }
    return typeof parsed.error === 'string' ? parsed.error : undefined
  } catch {
    return raw.trim() ? raw.trim().slice(0, 300) : undefined
  }
}

/** Turns `TypeError: fetch failed` into something a user can act on. */
export function describeNetworkError(error: unknown, endpoint: string): string {
  const code =
    typeof error === 'object' && error !== null && 'cause' in error
      ? (error as { cause?: { code?: string } }).cause?.code
      : undefined

  switch (code) {
    case 'ECONNREFUSED':
      return `Nothing is listening at ${endpoint}. Is Ollama running?`
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return `${endpoint} is unreachable from here. Check the address and the network.`
    case 'ETIMEDOUT':
    case 'UND_ERR_CONNECT_TIMEOUT':
      return `${endpoint} did not answer in time.`
    case 'ENOTFOUND':
      return `The host in ${endpoint} could not be resolved.`
    default:
      return `Could not reach ${endpoint}${code ? ` (${code})` : ''}.`
  }
}
