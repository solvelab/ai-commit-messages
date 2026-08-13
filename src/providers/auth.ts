/**
 * Building the request headers, including the optional credential.
 *
 * The credential is **never** about a specific vendor. Ollama itself has no authentication — but
 * people routinely put a gateway in front of it (LiteLLM, Portkey, nginx with auth, a corporate API
 * gateway), and Ollama Cloud requires a key too. In all of those the protocol is still Ollama's;
 * only the credential is added.
 *
 * Two consequences, both load-bearing:
 *
 * - The token is **optional everywhere**. No token configured means the request goes out exactly as
 *   it does today. A LAN Ollama with no auth is the common case and must stay zero-config.
 * - The header cannot be hardcoded to `Authorization: Bearer`. Gateways use whatever they like —
 *   `x-api-key`, `X-Portkey-Api-Key`, or the raw token with no scheme at all.
 */

export interface AuthConfig {
  /** Header carrying the credential. */
  readonly header: string
  /** Scheme prefix. Empty means the raw token, which some gateways require. */
  readonly scheme: string
}

export const DEFAULT_AUTH: AuthConfig = { header: 'Authorization', scheme: 'Bearer' }

export interface BuildHeadersInput {
  /** Extra non-sensitive headers from settings. */
  readonly extra?: Record<string, string>
  /** The credential, when there is one. */
  readonly token?: string
  readonly auth?: AuthConfig
}

export interface BuiltHeaders {
  readonly headers: Record<string, string>
  /** True when a credential was attached — logged instead of the value itself. */
  readonly authenticated: boolean
  /** Set when a header from settings was overridden by the credential. */
  readonly overrode?: string
}

/** Formats the credential value, e.g. `Bearer abc` or, with no scheme, `abc`. */
export function formatCredential(token: string, auth: AuthConfig = DEFAULT_AUTH): string {
  const scheme = auth.scheme.trim()
  return scheme ? `${scheme} ${token}` : token
}

/** Replaces any entry whose name matches case-insensitively, and reports the one it replaced. */
function put(
  headers: Record<string, string>,
  name: string,
  value: string,
): string | undefined {
  const clashing = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase())
  if (clashing) {
    delete headers[clashing]
  }
  headers[name] = value
  return clashing && clashing !== name ? clashing : undefined
}

export function buildHeaders(input: BuildHeadersInput): BuiltHeaders {
  const auth = input.auth ?? DEFAULT_AUTH
  const headers: Record<string, string> = {}
  const replaced: string[] = []

  // Settings first, then our own defaults on top — so a user-provided `Content-Type` is replaced
  // rather than sent alongside ours. HTTP header names are case-insensitive, so comparing them
  // verbatim is how `Content-Type` and `content-type` both went out, concatenated by the server.
  for (const [key, value] of Object.entries(input.extra ?? {})) {
    if (typeof value === 'string' && key.trim()) {
      const was = put(headers, key.trim(), value)
      if (was) {
        replaced.push(was)
      }
    }
  }

  const contentTypeWas = put(headers, 'content-type', 'application/json')
  if (contentTypeWas) {
    replaced.push(contentTypeWas)
  }

  const token = input.token?.trim()
  if (!token) {
    return {
      headers,
      authenticated: false,
      ...(replaced.length > 0 ? { overrode: replaced[0] } : {}),
    }
  }

  const headerName = auth.header.trim() || DEFAULT_AUTH.header
  const credentialWas = put(headers, headerName, formatCredential(token, auth))
  if (credentialWas) {
    replaced.push(credentialWas)
  }

  return {
    headers,
    authenticated: true,
    ...(replaced.length > 0 ? { overrode: replaced[0] } : {}),
  }
}

/** Masks a credential for logs. Never log the value itself. */
export function redactToken(token: string | undefined): string {
  if (!token) {
    return 'none'
  }
  return token.length <= 8 ? '••••' : `••••${token.slice(-4)}`
}
