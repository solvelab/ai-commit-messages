import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { createProvider, isImplemented, knownProviders } from './registry.js'
import { OllamaProvider } from './ollama.js'
import { OpenAICompatProvider } from './openaiCompat.js'
import { ProviderError, type FetchLike } from './types.js'
import { ADAPTERS } from '../settings.js'
import { BACKENDS, findBackend } from './catalog.js'

const fetchImpl: FetchLike = async () => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  text: async () => '{}',
})

const context = { endpoint: 'http://h:11434', fetch: fetchImpl }

describe('createProvider', () => {
  it('builds the Ollama adapter for ollama', () => {
    expect(createProvider('ollama', context)).toBeInstanceOf(OllamaProvider)
  })

  it('builds the OpenAI-compatible adapter for openai-compat', () => {
    // The bug this module exists for: the provider setting was never read, so this used to be an
    // OllamaProvider.
    const provider = createProvider('openai-compat', { ...context, endpoint: 'http://h/v1' })
    expect(provider).toBeInstanceOf(OpenAICompatProvider)
    expect(provider.id).toBe('openai-compat')
  })

  it('passes the preset through', () => {
    const provider = createProvider('openai-compat', {
      ...context,
      endpoint: 'https://api.groq.com/openai/v1',
      presetId: 'groq',
    }) as OpenAICompatProvider
    expect(provider.preset.id).toBe('groq')
  })

  it.each([...ADAPTERS])('handles %s — either builds it or refuses it, never the wrong one', id => {
    if (isImplemented(id)) {
      expect(createProvider(id, context).id).toBe(id)
    } else {
      expect(() => createProvider(id, context)).toThrow(ProviderError)
    }
  })

  it('passes extra headers through to the adapter', () => {
    const provider = createProvider('ollama', { ...context, headers: { 'x-test': '1' } })
    expect(provider).toBeInstanceOf(OllamaProvider)
  })
})

describe('the manifest and the catalog agree on the backend list', () => {
  const manifest = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { contributes: { configuration: { properties: Record<string, { enum?: string[] }> }[] } }

  const declared = manifest.contributes.configuration
    .flatMap(node => Object.entries(node.properties))
    .find(([key]) => key === 'aiCommitMessages.provider')?.[1].enum

  it('offers exactly the backends the catalog knows about', () => {
    // Drift here is how an option gets offered that nothing implements.
    expect(declared?.slice().sort()).toEqual(BACKENDS.map(b => b.id).sort())
  })

  it('every declared backend resolves to an adapter the registry can build', () => {
    for (const id of declared ?? []) {
      const backend = findBackend(id)
      expect(backend, id).toBeDefined()
      expect(() => createProvider(backend!.adapter, { ...context, endpoint: 'http://h/v1' })).not.toThrow()
    }
  })

  it('no backend advertises an adapter that does not exist', () => {
    for (const backend of BACKENDS) {
      expect(knownProviders()).toContain(backend.adapter)
    }
  })

  it('`compatPreset` is gone from the settings surface', () => {
    const keys = manifest.contributes.configuration.flatMap(n => Object.keys(n.properties))
    // Two lists for one decision was the whole problem.
    expect(keys).not.toContain('aiCommitMessages.compatPreset')
  })
})
