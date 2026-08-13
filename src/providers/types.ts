/** The seam every backend implements. Free of `vscode`, so every adapter is unit-testable. */

export interface ModelInfo {
  /** Value to send back as the model identifier. */
  readonly id: string
  /** Human-facing label for a picker. */
  readonly label: string
  readonly detail?: string
}

export interface ModelCapabilities {
  /** Context window in tokens, when the backend reports one. */
  readonly contextLength?: number
  /** The model emits a reasoning trace that must be suppressed at the source. */
  readonly thinking: boolean
  /** Raw capability list, for logging. */
  readonly raw: readonly string[]
}

export interface GenerateRequest {
  readonly model: string
  readonly system: string
  readonly user: string
  /** JSON Schema for a structured reply. Omitted means plain text. */
  readonly schema?: object
  readonly maxTokens: number
  readonly temperature: number
  /** Context window to ask the backend for, when it supports setting one. */
  readonly contextTokens?: number
  /** Suppress the reasoning trace when the model has one. */
  readonly suppressThinking?: boolean
}

export interface GenerateResult {
  readonly text: string
  /** Reasoning trace, when the backend returns it in a separate field. */
  readonly thinking?: string
  /** True when the structured path was refused and plain text was used instead. */
  readonly degradedToText: boolean
}

export interface CommitProvider {
  readonly id: string
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>
  describeModel(model: string, signal?: AbortSignal): Promise<ModelCapabilities>
  generate(request: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>
}

export type ProviderErrorCode =
  | 'network'
  | 'http'
  | 'malformed-response'
  | 'model-not-found'
  | 'unauthorized'
  | 'rate-limited'
  | 'unsupported-parameter'
  | 'structured-output-unsupported'
  | 'aborted'

export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/** Minimal `fetch` shape, injected so adapters can be tested without a server. */
export type FetchLike = (
  input: string,
  init: {
    method: string
    headers: Record<string, string>
    /** Omitted for GET: `fetch` rejects a GET carrying a body, even an empty one. */
    body?: string
    signal?: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
}>
