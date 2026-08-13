import { describe, expect, it } from 'vitest'

import { hostOf } from './endpoint.js'

/**
 * The credential is scoped to the endpoint host.
 *
 * With a provider-only key, saving an OpenAI key and later switching the preset to Groq sent the
 * OpenAI credential to Groq — one vendor's key leaking to another.
 */
describe('hostOf', () => {
  it.each([
    ['https://api.openai.com/v1', 'api.openai.com'],
    ['https://api.groq.com/openai/v1', 'api.groq.com'],
    ['http://192.168.15.6:11434', '192.168.15.6:11434'],
    ['http://127.0.0.1:11434', '127.0.0.1:11434'],
  ])('%s → %s', (endpoint, expected) => {
    expect(hostOf(endpoint)).toBe(expected)
  })

  it('distinguishes hosts that differ only by port', () => {
    expect(hostOf('http://h:11434')).not.toBe(hostOf('http://h:1234'))
  })

  it('falls back to a stable placeholder for an unparseable endpoint', () => {
    expect(hostOf('not a url')).toBe('unknown')
  })

  it('gives OpenAI and Groq different keys — the leak this prevents', () => {
    expect(hostOf('https://api.openai.com/v1')).not.toBe(hostOf('https://api.groq.com/openai/v1'))
  })
})
