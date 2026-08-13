import { describe, expect, it } from 'vitest'

import { buildHeaders, DEFAULT_AUTH, formatCredential, redactToken } from './auth.js'

describe('buildHeaders', () => {
  it('sends no credential when there is no token — the zero-config local case', () => {
    const built = buildHeaders({})
    expect(built.headers).toEqual({ 'content-type': 'application/json' })
    expect(built.authenticated).toBe(false)
  })

  it('treats a blank token as no token', () => {
    expect(buildHeaders({ token: '   ' }).authenticated).toBe(false)
  })

  it('attaches Bearer by default', () => {
    const built = buildHeaders({ token: 'abc123' })
    expect(built.headers.Authorization).toBe('Bearer abc123')
    expect(built.authenticated).toBe(true)
  })

  it('supports a gateway that wants its own header', () => {
    const built = buildHeaders({
      token: 'abc123',
      auth: { header: 'x-api-key', scheme: '' },
    })
    expect(built.headers['x-api-key']).toBe('abc123')
    expect(built.headers.Authorization).toBeUndefined()
  })

  it('supports a custom scheme', () => {
    const built = buildHeaders({ token: 'abc', auth: { header: 'Authorization', scheme: 'Token' } })
    expect(built.headers.Authorization).toBe('Token abc')
  })

  it('carries extra non-sensitive headers through', () => {
    const built = buildHeaders({ extra: { 'X-Title': 'AI Commit Messages' } })
    expect(built.headers['X-Title']).toBe('AI Commit Messages')
  })

  it('replaces a settings Content-Type instead of sending both', () => {
    // HTTP header names are case-insensitive; comparing them verbatim is how both went out and the
    // server received the values concatenated.
    const built = buildHeaders({ extra: { 'Content-Type': 'text/plain' } })
    const names = Object.keys(built.headers).map(k => k.toLowerCase())
    expect(names.filter(n => n === 'content-type')).toHaveLength(1)
    expect(built.headers['content-type']).toBe('application/json')
    expect(built.overrode).toBe('Content-Type')
  })

  it('deduplicates any header, not just the credential one', () => {
    const built = buildHeaders({ extra: { 'X-Title': 'a', 'x-title': 'b' } })
    const names = Object.keys(built.headers).map(k => k.toLowerCase())
    expect(names.filter(n => n === 'x-title')).toHaveLength(1)
  })

  it('lets the credential win over a header from settings, and says which one', () => {
    const built = buildHeaders({ extra: { authorization: 'Bearer stale' }, token: 'fresh' })
    expect(built.headers.Authorization).toBe('Bearer fresh')
    // Case-insensitive: two headers differing only in case would both go out.
    expect(built.headers.authorization).toBeUndefined()
    expect(built.overrode).toBe('authorization')
  })

  it('does not report an override when there was nothing to override', () => {
    expect(buildHeaders({ token: 'abc' }).overrode).toBeUndefined()
  })

  it('falls back to Authorization when the configured header name is blank', () => {
    const built = buildHeaders({ token: 'abc', auth: { header: '   ', scheme: 'Bearer' } })
    expect(built.headers.Authorization).toBe('Bearer abc')
  })

  it('ignores a header entry with an empty name', () => {
    const built = buildHeaders({ extra: { '  ': 'x' } })
    expect(Object.keys(built.headers)).toEqual(['content-type'])
  })

  it('always sets the JSON content type', () => {
    expect(buildHeaders({ token: 'a' }).headers['content-type']).toBe('application/json')
  })
})

describe('formatCredential', () => {
  it('prefixes the scheme', () => {
    expect(formatCredential('abc', DEFAULT_AUTH)).toBe('Bearer abc')
  })

  it('sends the raw token when the scheme is empty', () => {
    expect(formatCredential('abc', { header: 'x-api-key', scheme: '' })).toBe('abc')
    expect(formatCredential('abc', { header: 'x-api-key', scheme: '   ' })).toBe('abc')
  })
})

describe('redactToken', () => {
  it('never returns the token itself', () => {
    expect(redactToken('super-secret-value')).toBe('••••alue')
    expect(redactToken('super-secret-value')).not.toContain('super')
  })

  it('hides a short token completely', () => {
    expect(redactToken('abc')).toBe('••••')
  })

  it('says none when there is nothing', () => {
    expect(redactToken(undefined)).toBe('none')
  })
})
