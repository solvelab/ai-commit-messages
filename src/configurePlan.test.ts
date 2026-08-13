import { describe, expect, it } from 'vitest'

import { ConfigureError, planConfiguration, validateEndpointInput } from './configurePlan.js'

describe('planConfiguration', () => {
  it('writes the three answers to the global target', () => {
    const writes = planConfiguration({
      provider: 'ollama',
      endpoint: 'http://192.168.15.6:11434',
      model: 'qwen2.5-coder:7b',
    })
    expect(writes).toEqual([
      { key: 'provider', value: 'ollama', target: 'global' },
      { key: 'endpoint', value: 'http://192.168.15.6:11434', target: 'global' },
      { key: 'model', value: 'qwen2.5-coder:7b', target: 'global' },
    ])
  })

  it('never targets the workspace — endpoint is machine-scoped and would be refused', () => {
    const writes = planConfiguration({ endpoint: 'http://h:11434', model: 'm', provider: 'ollama' })
    expect(writes.every(w => w.target === 'global')).toBe(true)
  })

  it('normalizes a full endpoint the user pasted', () => {
    expect(planConfiguration({ endpoint: 'http://192.168.15.6:11434/api/generate' })[0].value).toBe(
      'http://192.168.15.6:11434',
    )
  })

  it('writes only what was answered', () => {
    expect(planConfiguration({ model: 'llama3.2:latest' })).toHaveLength(1)
    expect(planConfiguration({})).toHaveLength(0)
  })

  it('rejects an invalid URL instead of writing it', () => {
    expect(() => planConfiguration({ endpoint: 'http://' })).toThrow(ConfigureError)
  })

  it('rejects an empty model name', () => {
    expect(() => planConfiguration({ model: '   ' })).toThrow(ConfigureError)
  })

  it('rejects an unknown provider', () => {
    expect(() => planConfiguration({ provider: 'anthropic' as 'ollama' })).toThrow(ConfigureError)
  })

  it('trims the model name', () => {
    expect(planConfiguration({ model: '  qwen3:8b ' })[0].value).toBe('qwen3:8b')
  })
})

describe('validateEndpointInput', () => {
  it('asks for a value when empty', () => {
    expect(validateEndpointInput('')).toMatch(/base URL/)
  })

  it('complains about a non-URL', () => {
    expect(validateEndpointInput('http://')).toBe('That is not a valid URL.')
  })

  it('accepts a bare host:port', () => {
    expect(validateEndpointInput('192.168.15.6:11434')).toBeUndefined()
  })

  it('accepts a full endpoint — it is trimmed, not rejected', () => {
    expect(validateEndpointInput('http://192.168.15.6:11434/api/generate')).toBeUndefined()
  })
})
