import { DEFAULT_MAX_BODY_WORDS } from './prompt/commit.js'
import { DEFAULT_EXCLUDE_GLOBS } from './budget/exclude.js'
import { DEFAULT_TIMEOUT_MS } from './net.js'

/**
 * Reading, validating and clamping configuration.
 *
 * Free of `vscode`: the raw values arrive as a plain record, so every rule is unit-testable.
 *
 * There is deliberately **no `apiKey` setting**. `settings.json` is plaintext on disk, readable by
 * any other extension through `getConfiguration()`, synced to the user's account, and — when it
 * lands in `.vscode/settings.json` — committable. In a commit-message extension that last one is
 * fatal irony. Keys belong in `SecretStorage`.
 */

export const PROVIDERS = ['ollama', 'openai-compat'] as const
export type ProviderId = (typeof PROVIDERS)[number]

export interface Settings {
  readonly provider: ProviderId
  /** Base URL. Never a full endpoint. */
  readonly endpoint: string
  readonly model: string
  readonly language: string
  readonly promptTemplate: string
  readonly maxDiffChars: number
  readonly maxBodyWords: number
  readonly temperature: number
  readonly timeoutMs: number
  /** Header carrying the credential, for gateways that do not use Authorization. */
  readonly authHeader: string
  /** Scheme prefix. Empty sends the raw token. */
  readonly authScheme: string
  /** Extra non-sensitive headers. */
  readonly headers: Record<string, string>
  /** Which OpenAI-compatible flavour to speak. */
  readonly compatPreset: string
  /** Mask recognizable secrets in the diff before sending it. */
  readonly redactSecrets: boolean
  /** Files matching these contribute a header only. */
  readonly excludeGlobs: readonly string[]
}

export const DEFAULTS: Settings = {
  provider: 'ollama',
  endpoint: 'http://127.0.0.1:11434',
  model: 'qwen2.5-coder:7b',
  language: 'pt-BR',
  promptTemplate: '',
  // Same number the extension being replaced used, so behaviour is familiar on day one.
  maxDiffChars: 4000,
  maxBodyWords: DEFAULT_MAX_BODY_WORDS,
  temperature: 0,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  authHeader: 'Authorization',
  authScheme: 'Bearer',
  headers: {},
  compatPreset: 'custom',
  redactSecrets: true,
  excludeGlobs: DEFAULT_EXCLUDE_GLOBS,
}

export interface SettingsProblem {
  readonly key: keyof Settings
  readonly message: string
}

export interface ReadResult {
  readonly settings: Settings
  /** Values that were out of range and got clamped, or invalid and fell back to the default. */
  readonly problems: readonly SettingsProblem[]
}

/**
 * Operation paths every dialect shares. Pasting one of these is a mistake in any provider.
 */
const OPERATION_PATH = /\/+(chat\/completions|completions|models|embeddings)\/*$/i

/**
 * Paths that only Ollama's native API uses, plus its `/v1` shim. Stripping `/v1` is right for
 * Ollama — its base has none — and **wrong** for every OpenAI-compatible endpoint, whose contract
 * requires the base to end there.
 */
const OLLAMA_PATH = /\/+(api\/(generate|chat|tags|show)|v1(\/.*)?)\/*$/i

/**
 * Trims a full endpoint down to the base URL the adapters expect.
 *
 * The normalization is **provider-aware** on purpose. A single rule cannot serve both dialects:
 * `https://api.groq.com/openai/v1` must keep its `/v1`, while `http://host:11434/api/generate`
 * must lose everything after the host. Applying Ollama's rule to everything is what broke seven of
 * the nine OpenAI-compatible presets between v1.1.0 and v1.4.0.
 */
export function normalizeBaseUrl(raw: string, provider: ProviderId = 'ollama'): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return undefined
  }
  if (!url.hostname) {
    return undefined
  }
  // An operation path is a mistake in any dialect; only Ollama also loses its `/api/...` and `/v1`.
  const path =
    provider === 'ollama'
      ? url.pathname.replace(OLLAMA_PATH, '')
      : url.pathname.replace(OPERATION_PATH, '')
  const cleanPath = path.replace(/\/+$/, '')
  return `${url.protocol}//${url.host}${cleanPath}`
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function num(
  raw: unknown,
  fallback: number,
  min: number,
  max: number,
  key: keyof Settings,
  problems: SettingsProblem[],
): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    if (raw !== undefined && raw !== null && raw !== '') {
      problems.push({ key, message: `${String(key)} must be a number; using ${fallback}.` })
    }
    return fallback
  }
  const clamped = clamp(raw, min, max)
  if (clamped !== raw) {
    problems.push({ key, message: `${String(key)} must be between ${min} and ${max}; using ${clamped}.` })
  }
  return clamped
}

function readHeaders(raw: unknown, problems: SettingsProblem[]): Record<string, string> {
  if (raw === undefined || raw === null) {
    return {}
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push({ key: 'headers', message: 'headers must be an object of string values.' })
    return {}
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && key.trim()) {
      out[key.trim()] = value
    } else {
      problems.push({ key: 'headers', message: `header "${key}" was ignored: values must be strings.` })
    }
  }
  return out
}

function readGlobs(raw: unknown, problems: SettingsProblem[]): readonly string[] {
  if (raw === undefined || raw === null) {
    return DEFAULTS.excludeGlobs
  }
  if (!Array.isArray(raw)) {
    problems.push({ key: 'excludeGlobs', message: 'excludeGlobs must be an array of strings.' })
    return DEFAULTS.excludeGlobs
  }
  return raw.filter((g): g is string => typeof g === 'string' && g.trim().length > 0)
}

function str(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
}

/** Turns the raw configuration record into settings that are safe to use. */
export function readSettings(raw: Record<string, unknown>): ReadResult {
  const problems: SettingsProblem[] = []

  const providerRaw = str(raw.provider, DEFAULTS.provider)
  const provider = (PROVIDERS as readonly string[]).includes(providerRaw)
    ? (providerRaw as ProviderId)
    : DEFAULTS.provider
  if (provider !== providerRaw) {
    problems.push({ key: 'provider', message: `Unknown provider "${providerRaw}"; using ${DEFAULTS.provider}.` })
  }

  // Provider-aware: the endpoint is normalized for the dialect that will actually be spoken.
  const endpoint = normalizeBaseUrl(str(raw.endpoint, DEFAULTS.endpoint), provider)
  if (!endpoint) {
    problems.push({ key: 'endpoint', message: 'The endpoint is not a valid URL; using the default.' })
  }

  return {
    settings: {
      provider,
      endpoint: endpoint ?? DEFAULTS.endpoint,
      model: str(raw.model, DEFAULTS.model),
      language: str(raw.language, DEFAULTS.language),
      promptTemplate: typeof raw.promptTemplate === 'string' ? raw.promptTemplate : DEFAULTS.promptTemplate,
      maxDiffChars: num(raw.maxDiffChars, DEFAULTS.maxDiffChars, 200, 500_000, 'maxDiffChars', problems),
      maxBodyWords: num(raw.maxBodyWords, DEFAULTS.maxBodyWords, 3, 40, 'maxBodyWords', problems),
      temperature: num(raw.temperature, DEFAULTS.temperature, 0, 1, 'temperature', problems),
      timeoutMs: num(raw.timeoutMs, DEFAULTS.timeoutMs, 1_000, 600_000, 'timeoutMs', problems),
      authHeader: str(raw.authHeader, DEFAULTS.authHeader),
      // Empty is meaningful here (raw token), so `str` with its blank-to-default rule is wrong.
      authScheme: typeof raw.authScheme === 'string' ? raw.authScheme.trim() : DEFAULTS.authScheme,
      headers: readHeaders(raw.headers, problems),
      compatPreset: str(raw.compatPreset, DEFAULTS.compatPreset),
      redactSecrets: typeof raw.redactSecrets === 'boolean' ? raw.redactSecrets : DEFAULTS.redactSecrets,
      excludeGlobs: readGlobs(raw.excludeGlobs, problems),
    },
    problems,
  }
}

/**
 * Characters of diff that fit the model's context.
 *
 * The divisor is **2.6 chars per token**, measured against this project's own history with the
 * model's own tokenizer (`prompt_eval_count`): mean 3.25, worst case 2.66. OpenAI's widely quoted
 * "4 characters per token" is off by roughly 35% for diffs, and budgeting by the mean overshoots
 * exactly the dense-diff case.
 */
export const CHARS_PER_TOKEN = 2.6

/**
 * Ceiling applied to the model's reported context window.
 *
 * A 128k window is real but expensive: the server allocates the KV cache for whatever `num_ctx`
 * asks for, and a commit message never needs that much. The number that matters is that the
 * **same** value governs the budget and the request — using the full window for one and a cap for
 * the other truncates the prompt in silence.
 */
export const MAX_CONTEXT_TOKENS = 32_768

/** The window actually used: reported, capped, and shared by budget and request. */
export function usableContextTokens(reported: number | undefined): number | undefined {
  return reported ? Math.min(reported, MAX_CONTEXT_TOKENS) : undefined
}

export function diffBudgetChars(options: {
  contextTokens?: number
  systemPromptChars: number
  maxOutputTokens: number
  fallbackChars: number
}): number {
  if (!options.contextTokens) {
    return options.fallbackChars
  }
  const systemTokens = Math.ceil(options.systemPromptChars / CHARS_PER_TOKEN)
  const slack = 256
  const available = options.contextTokens - systemTokens - options.maxOutputTokens - slack
  if (available <= 0) {
    return options.fallbackChars
  }
  return Math.floor(available * CHARS_PER_TOKEN)
}
