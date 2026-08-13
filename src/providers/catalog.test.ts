import { describe, expect, it } from 'vitest'

import { BACKENDS, findBackend, resolveBackend } from './catalog.js'
import { readSettings } from '../settings.js'

describe('the catalog is one list, by product name', () => {
  it('lists the backends people actually name', () => {
    const ids = BACKENDS.map(b => b.id)
    // "openai-compat" was the adapter's name leaking into the interface.
    expect(ids).not.toContain('openai-compat')
    expect(ids).toEqual(
      expect.arrayContaining(['ollama', 'openai', 'groq', 'openrouter', 'lmstudio', 'gemini']),
    )
  })

  it('gives every backend an adapter and a default endpoint, except the custom one', () => {
    for (const backend of BACKENDS) {
      expect(['ollama', 'openai-compat']).toContain(backend.adapter)
      if (backend.id !== 'custom') {
        expect(backend.defaultEndpoint, backend.id).not.toBe('')
      }
    }
  })

  it('only the OpenAI-compatible ones carry a preset', () => {
    for (const backend of BACKENDS) {
      if (backend.adapter === 'ollama') {
        expect(backend.presetId, backend.id).toBeUndefined()
      } else {
        expect(backend.presetId, backend.id).toBeDefined()
      }
    }
  })

  it('has unique ids', () => {
    const ids = BACKENDS.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('resolveBackend', () => {
  it('resolves a backend by its own id', () => {
    expect(resolveBackend('groq').label).toBe('Groq')
  })

  it.each([
    ['groq', 'Groq'],
    ['openai', 'OpenAI'],
    ['openrouter', 'OpenRouter'],
    ['lmstudio', 'LM Studio'],
    ['gemini', 'Google Gemini'],
    ['ollama-v1', 'Ollama (OpenAI shim)'],
    ['custom', 'Other OpenAI-compatible endpoint'],
  ])('maps the old openai-compat + %s to %s', (preset, label) => {
    // Compatibility by reading: a configuration written by an earlier version keeps working, and
    // nothing on the user's disk is rewritten.
    expect(resolveBackend('openai-compat', preset).label).toBe(label)
  })

  it('falls back to the custom flavour when the old preset is missing', () => {
    expect(resolveBackend('openai-compat').id).toBe('custom')
  })

  it('falls back to Ollama for an unknown value', () => {
    expect(resolveBackend('bogus').id).toBe('ollama')
  })

  it('findBackend is undefined for an unknown id', () => {
    expect(findBackend('bogus')).toBeUndefined()
  })
})

describe('settings resolve the backend, old shape included', () => {
  it('a fresh configuration picking Groq gets the Groq adapter and endpoint', () => {
    const { settings } = readSettings({ provider: 'groq' })
    expect(settings.backend.id).toBe('groq')
    expect(settings.provider).toBe('openai-compat')
    expect(settings.endpoint).toBe('https://api.groq.com/openai/v1')
  })

  it('the configuration written by an earlier version still works untouched', () => {
    const { settings, problems } = readSettings({
      provider: 'openai-compat',
      compatPreset: 'groq',
      endpoint: 'https://api.groq.com/openai/v1',
    })
    expect(settings.backend.id).toBe('groq')
    expect(settings.compatPreset).toBe('groq')
    // No complaint: the old shape is understood, not merely tolerated.
    expect(problems).toHaveLength(0)
  })

  it('Ollama stays the default and keeps its own dialect', () => {
    const { settings } = readSettings({})
    expect(settings.backend.id).toBe('ollama')
    expect(settings.provider).toBe('ollama')
  })

  it('an unknown backend is reported, not silently accepted', () => {
    const { settings, problems } = readSettings({ provider: 'anthropic' })
    expect(settings.backend.id).toBe('ollama')
    expect(problems.map(p => p.key)).toContain('provider')
  })
})
