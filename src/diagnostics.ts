/**
 * Turning collected facts into an answer to "why doesn't it work".
 *
 * The number-one predicted failure for this extension is not the model: it is the extension host's
 * proxy patch. `http.proxySupport` defaults to `"override"`, the host replaces `globalThis.fetch`,
 * and under WSL it resolves the proxy through the **Windows** configuration. The built-in bypass
 * covers loopback only, and `http.noProxy` matches by **suffix** — `192.168.15.0/24` does nothing.
 *
 * The symptom is always the same and always confusing: `curl` works in the WSL terminal, the
 * extension fails.
 *
 * Pure module: the caller gathers, this one reasons.
 */

export interface DiagnosticFacts {
  readonly provider: string
  readonly endpoint: string
  readonly model: string
  readonly compatPreset?: string
  /** Whether a credential exists. Never the credential. */
  readonly hasCredential: boolean
  readonly authHeader: string
  /** `wsl`, `ssh-remote`, or undefined when local. */
  readonly remoteName?: string
  readonly proxySupport?: string
  readonly noProxy?: readonly string[]
  readonly useLocalProxyConfiguration?: boolean
  readonly httpProxy?: string
  /** Result of a real call to the endpoint. */
  readonly reach:
    | { ok: true; ms: number; models: readonly string[] }
    | { ok: false; ms: number; code?: string; message: string }
}

export interface Diagnostic {
  readonly severity: 'ok' | 'warn' | 'error'
  readonly title: string
  readonly detail?: string
}

export interface DiagnosticReport {
  readonly summary: string
  readonly lines: readonly Diagnostic[]
}

function hostOf(endpoint: string): string | undefined {
  try {
    return new URL(endpoint).hostname
  } catch {
    return undefined
  }
}

function isLoopback(host: string | undefined): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

/** Suffix matching, the same rule `@vscode/proxy-agent` uses. */
export function noProxyCovers(noProxy: readonly string[] | undefined, host: string | undefined): boolean {
  if (!noProxy?.length || !host) {
    return false
  }
  if (noProxy.includes('*')) {
    return true
  }
  return noProxy.some(entry => {
    const name = entry.trim().split(':')[0]
    if (!name) {
      return false
    }
    const domain = name.startsWith('.') ? name : `.${name}`
    return `.${host.toLowerCase()}`.endsWith(domain.toLowerCase())
  })
}

/** True for the notations people expect to work in `http.noProxy` and that silently do not. */
export function looksLikeUnsupportedNoProxy(noProxy: readonly string[] | undefined): string[] {
  return (noProxy ?? []).filter(entry => entry.includes('/') || entry.includes('*') && entry !== '*')
}

export function buildReport(facts: DiagnosticFacts): DiagnosticReport {
  const lines: Diagnostic[] = []
  const host = hostOf(facts.endpoint)

  lines.push({
    severity: 'ok',
    title: `Provider: ${facts.provider}${facts.compatPreset && facts.provider === 'openai-compat' ? ` (${facts.compatPreset})` : ''}`,
    detail: `endpoint ${facts.endpoint} · model ${facts.model}`,
  })

  lines.push({
    severity: 'ok',
    title: facts.hasCredential
      ? `Credential: configured, sent as ${facts.authHeader}`
      : 'Credential: none (fine for a plain local server)',
  })

  lines.push({
    severity: 'ok',
    title: facts.remoteName ? `Running in the remote host: ${facts.remoteName}` : 'Running locally',
    ...(facts.remoteName
      ? { detail: 'The request leaves from the remote side, not from Windows.' }
      : {}),
  })

  if (facts.reach.ok) {
    lines.push({
      severity: 'ok',
      title: `Endpoint answered in ${facts.reach.ms} ms with ${facts.reach.models.length} model(s)`,
    })
    if (!facts.reach.models.includes(facts.model)) {
      lines.push({
        severity: 'error',
        title: `The configured model "${facts.model}" is not on the server`,
        detail: `Available: ${facts.reach.models.slice(0, 8).join(', ')}${facts.reach.models.length > 8 ? '…' : ''}`,
      })
    }
  } else {
    lines.push({
      severity: 'error',
      title: `Endpoint did not answer (${facts.reach.ms} ms)`,
      detail: `${facts.reach.code ? `${facts.reach.code}: ` : ''}${facts.reach.message}`,
    })
  }

  // The proxy story only matters when the target is not loopback AND there is a reason to think a
  // proxy is in play: an explicit `http.proxy`, or a remote session, where the host asks the local
  // (Windows) configuration. Warning every local user with no proxy at all would be noise.
  const proxyActive =
    (facts.proxySupport ?? 'override') !== 'off' &&
    (Boolean(facts.httpProxy) ||
      (Boolean(facts.remoteName) && facts.useLocalProxyConfiguration !== false))

  if (!isLoopback(host) && proxyActive) {
    const covered = noProxyCovers(facts.noProxy, host)
    lines.push({
      severity: covered ? 'ok' : facts.reach.ok ? 'warn' : 'error',
      title: covered
        ? `http.noProxy already covers ${host}`
        : `${host} is not in http.noProxy, and the extension host resolves a proxy for it`,
      ...(covered
        ? {}
        : {
            detail:
              `Add it in the Remote settings tab: "http.noProxy": ["${host}"]. ` +
              'Matching is by suffix — a CIDR like 192.168.15.0/24 or a wildcard like 192.168.* does nothing. ' +
              'Alternatively set "http.useLocalProxyConfiguration": false.',
          }),
    })

    const unsupported = looksLikeUnsupportedNoProxy(facts.noProxy)
    if (unsupported.length > 0) {
      lines.push({
        severity: 'warn',
        title: `These http.noProxy entries never match: ${unsupported.join(', ')}`,
        detail: 'Only suffix matching is supported. Use the plain host name or address.',
      })
    }
  }

  if (facts.remoteName && facts.useLocalProxyConfiguration !== false && !isLoopback(host)) {
    lines.push({
      severity: 'warn',
      title: 'Proxy is resolved through the local (Windows) configuration',
      detail:
        'Under WSL this is the default. If curl works in the terminal but the extension does not, ' +
        'this is why. Set "http.useLocalProxyConfiguration": false in the Remote tab to stop asking.',
    })
  }

  const worst = lines.some(l => l.severity === 'error')
    ? 'error'
    : lines.some(l => l.severity === 'warn')
      ? 'warn'
      : 'ok'

  const summary =
    worst === 'ok'
      ? `Everything checks out: ${facts.model} at ${facts.endpoint}.`
      : worst === 'warn'
        ? 'Working, but something is worth looking at. See the log.'
        : 'Something is broken. See the log for what and why.'

  return { summary, lines }
}

/** Renders the report for the output channel. */
export function formatReport(report: DiagnosticReport): string {
  const icon = { ok: '✓', warn: '!', error: '✗' } as const
  const body = report.lines
    .map(line => `${icon[line.severity]} ${line.title}${line.detail ? `\n    ${line.detail}` : ''}`)
    .join('\n')
  return `AI Commit Messages — connection diagnosis\n\n${body}\n\n${report.summary}`
}
