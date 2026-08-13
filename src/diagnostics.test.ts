import { describe, expect, it } from 'vitest'

import {
  buildReport,
  formatReport,
  looksLikeUnsupportedNoProxy,
  noProxyCovers,
  type DiagnosticFacts,
} from './diagnostics.js'

const BASE: DiagnosticFacts = {
  provider: 'ollama',
  endpoint: 'http://192.168.15.6:11434',
  model: 'qwen2.5-coder:7b',
  hasCredential: false,
  authHeader: 'Authorization',
  reach: { ok: true, ms: 30, models: ['qwen2.5-coder:7b', 'llama3.2:latest'] },
}

function titles(facts: Partial<DiagnosticFacts> = {}): string[] {
  return buildReport({ ...BASE, ...facts }).lines.map(l => l.title)
}

describe('noProxyCovers — the suffix rule people get wrong', () => {
  it('covers an exact host', () => {
    expect(noProxyCovers(['192.168.15.6'], '192.168.15.6')).toBe(true)
  })

  it('covers a subdomain by suffix', () => {
    expect(noProxyCovers(['example.com'], 'ollama.example.com')).toBe(true)
  })

  it('does NOT cover a CIDR, which is the common mistake', () => {
    expect(noProxyCovers(['192.168.15.0/24'], '192.168.15.6')).toBe(false)
  })

  it('does NOT cover a wildcard prefix', () => {
    expect(noProxyCovers(['192.168.*'], '192.168.15.6')).toBe(false)
  })

  it('a lone * covers everything', () => {
    expect(noProxyCovers(['*'], 'anything')).toBe(true)
  })

  it('ignores the port part of an entry', () => {
    expect(noProxyCovers(['192.168.15.6:11434'], '192.168.15.6')).toBe(true)
  })

  it('handles an empty list', () => {
    expect(noProxyCovers([], 'h')).toBe(false)
    expect(noProxyCovers(undefined, 'h')).toBe(false)
  })
})

describe('looksLikeUnsupportedNoProxy', () => {
  it('flags CIDR and wildcards, which never match', () => {
    expect(looksLikeUnsupportedNoProxy(['192.168.15.0/24', '192.168.*', 'host.local'])).toEqual([
      '192.168.15.0/24',
      '192.168.*',
    ])
  })

  it('does not flag a lone *', () => {
    expect(looksLikeUnsupportedNoProxy(['*'])).toEqual([])
  })
})

describe('buildReport', () => {
  it('reports a healthy setup as ok', () => {
    const report = buildReport(BASE)
    expect(report.lines.every(l => l.severity === 'ok')).toBe(true)
    expect(report.summary).toContain('Everything checks out')
  })

  it('flags a model that is not on the server', () => {
    const report = buildReport({ ...BASE, model: 'inexistente:7b' })
    expect(report.lines.some(l => l.severity === 'error' && /not on the server/.test(l.title))).toBe(
      true,
    )
  })

  it('reports the failure cause when the endpoint does not answer', () => {
    const report = buildReport({
      ...BASE,
      reach: { ok: false, ms: 5000, code: 'network', message: 'fetch failed (ECONNREFUSED)' },
    })
    expect(report.lines.some(l => l.detail?.includes('ECONNREFUSED'))).toBe(true)
    expect(report.summary).toContain('broken')
  })

  it('never puts the credential in the report — only whether there is one', () => {
    const report = buildReport({ ...BASE, hasCredential: true })
    const text = JSON.stringify(report)
    expect(text).toContain('Credential: configured')
    expect(text).not.toMatch(/sk-|ghp_|Bearer [A-Za-z0-9]/)
  })

  it('says the credential is optional when there is none', () => {
    expect(titles()).toContain('Credential: none (fine for a plain local server)')
  })

  it('warns when a LAN host is not covered by http.noProxy', () => {
    const report = buildReport({ ...BASE, remoteName: 'wsl', noProxy: [], httpProxy: 'http://proxy:8080' })
    const line = report.lines.find(l => /not in http.noProxy/.test(l.title))
    expect(line).toBeDefined()
    expect(line?.detail).toContain('"http.noProxy": ["192.168.15.6"]')
    expect(line?.detail).toContain('by suffix')
  })

  it('does not raise the proxy topic for a loopback endpoint', () => {
    const report = buildReport({
      ...BASE,
      endpoint: 'http://127.0.0.1:11434',
      remoteName: 'wsl',
      httpProxy: 'http://proxy:8080',
    })
    expect(report.lines.some(l => /noProxy/.test(l.title))).toBe(false)
  })

  it('stays quiet about the proxy when proxy support is off', () => {
    const report = buildReport({ ...BASE, proxySupport: 'off', useLocalProxyConfiguration: false })
    expect(report.lines.some(l => /noProxy/.test(l.title))).toBe(false)
  })

  it('explains the WSL default of resolving the proxy through Windows', () => {
    const report = buildReport({ ...BASE, remoteName: 'wsl' })
    expect(report.lines.some(l => /local \(Windows\) configuration/.test(l.title))).toBe(true)
  })

  it('accepts that the endpoint answered while still warning', () => {
    const report = buildReport({ ...BASE, remoteName: 'wsl', httpProxy: 'http://p:8080', noProxy: [] })
    expect(report.summary).toContain('worth looking at')
  })

  it('names the preset for an OpenAI-compatible provider', () => {
    expect(titles({ provider: 'openai-compat', compatPreset: 'groq' })[0]).toContain('groq')
  })
})

describe('formatReport', () => {
  it('renders one line per finding with a severity marker', () => {
    const text = formatReport(buildReport(BASE))
    expect(text).toContain('connection diagnosis')
    expect(text.split('\n').filter(l => l.startsWith('✓')).length).toBeGreaterThan(2)
  })

  it('indents the detail under its line', () => {
    const text = formatReport(
      buildReport({
        ...BASE,
        reach: { ok: false, ms: 10, message: 'EHOSTUNREACH' },
      }),
    )
    expect(text).toMatch(/✗ .*\n {4}.*EHOSTUNREACH/)
  })
})
